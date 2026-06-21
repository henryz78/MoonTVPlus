import { PlayRecord } from '@/lib/types';

import {
  canViewTargetUsername,
  getLastActiveAt,
  getOperatorRole,
  getTargetUser,
  newestActivityTime,
  ONLINE_THRESHOLD_MS,
  UserActivityRole,
  UserActivityUser,
} from './admin-user-activity';
import { db } from './db';

const USER_FETCH_LIMIT = 100000;
const TOP_LIMIT = 10;

export interface PlayStatsRecordSummary {
  username: string;
  title: string;
  episode: number;
  sourceName: string;
  progressPercent: number;
  watchSeconds: number;
  saveTime: number;
}

export interface PlayStatsTitleSummary {
  title: string;
  count: number;
  watchSeconds: number;
  latestSaveTime: number;
}

export interface PlayStatsUserSummary {
  username: string;
  role: UserActivityRole;
  playRecordCount: number;
  watchSeconds: number;
  lastActiveAt: number | null;
  isOnline: boolean;
  latestPlayRecord: PlayStatsRecordSummary | null;
}

export interface PlayStatsResult {
  viewerRole: UserActivityRole;
  totalUsers: number;
  onlineUsers: number;
  totalPlayRecords: number;
  totalWatchSeconds: number;
  todayActiveUsers: number;
  last7DaysActiveUsers: number;
  todayPlayRecords: number;
  last7DaysPlayRecords: number;
  todayWatchSeconds: number;
  last7DaysWatchSeconds: number;
  lastWatchAt: number | null;
  topTitles: PlayStatsTitleSummary[];
  userRanking: PlayStatsUserSummary[];
  recentRecords: PlayStatsRecordSummary[];
}

function progressPercent(record: PlayRecord) {
  if (!record.total_time) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((record.play_time / record.total_time) * 100))
  );
}

function watchSeconds(record: PlayRecord) {
  const playTime = Number.isFinite(record.play_time) ? record.play_time : 0;
  const totalTime = Number.isFinite(record.total_time) ? record.total_time : 0;
  const upperBound = totalTime > 0 ? totalTime : playTime;
  return Math.max(0, Math.floor(Math.min(playTime, upperBound)));
}

function toRecordSummary(
  username: string,
  record: PlayRecord
): PlayStatsRecordSummary {
  return {
    username,
    title: record.title,
    episode: record.index,
    sourceName: record.source_name,
    progressPercent: progressPercent(record),
    watchSeconds: watchSeconds(record),
    saveTime: record.save_time,
  };
}

function latestRecordFrom(records: Record<string, PlayRecord>) {
  return Object.values(records).sort((a, b) => b.save_time - a.save_time)[0];
}

function isSameLocalDay(timestamp: number, now: number) {
  const current = new Date(now);
  const target = new Date(timestamp);
  return (
    current.getFullYear() === target.getFullYear() &&
    current.getMonth() === target.getMonth() &&
    current.getDate() === target.getDate()
  );
}

async function listAllUsers() {
  const result = await db.getUserListV2(
    0,
    USER_FETCH_LIMIT,
    process.env.USERNAME,
    ''
  );
  const users = result.users.map((user) => ({
    username: user.username,
    role: user.role,
    banned: user.banned,
    created_at: user.created_at,
  })) as UserActivityUser[];

  if (
    process.env.USERNAME &&
    !users.some((user) => user.username === process.env.USERNAME)
  ) {
    const owner = await getTargetUser(process.env.USERNAME);
    if (owner) users.unshift(owner);
  }

  return users;
}

async function listVisibleUsersForStats(input: {
  operatorUsername: string;
  operatorRole: UserActivityRole;
}) {
  if (input.operatorRole === 'user') {
    const self = await getTargetUser(input.operatorUsername);
    return self ? [self] : [];
  }

  const allUsers = await listAllUsers();
  const visible = allUsers.filter((user) =>
    canViewTargetUsername(
      input.operatorRole,
      input.operatorUsername,
      user.username,
      user.role
    )
  );

  if (!visible.some((user) => user.username === input.operatorUsername)) {
    const self = await getTargetUser(input.operatorUsername);
    if (self) visible.unshift(self);
  }

  return visible;
}

async function buildUserStats(user: UserActivityUser) {
  const [records, deviceLastActiveAt] = await Promise.all([
    db.getAllPlayRecords(user.username),
    getLastActiveAt(user.username),
  ]);
  const recordList = Object.values(records);
  const latestRecord = latestRecordFrom(records);
  const totalWatchSeconds = recordList.reduce(
    (total, record) => total + watchSeconds(record),
    0
  );
  const lastActiveAt = newestActivityTime(
    deviceLastActiveAt,
    latestRecord?.save_time
  );

  return {
    user,
    records: recordList,
    watchSeconds: totalWatchSeconds,
    lastActiveAt,
    isOnline: Boolean(
      lastActiveAt && Date.now() - lastActiveAt <= ONLINE_THRESHOLD_MS
    ),
    latestPlayRecord: latestRecord
      ? toRecordSummary(user.username, latestRecord)
      : null,
  };
}

export async function getPlayStats(input: {
  operatorUsername: string;
}): Promise<PlayStatsResult> {
  const operatorRole = await getOperatorRole(input.operatorUsername);
  const visibleUsers = await listVisibleUsersForStats({
    operatorUsername: input.operatorUsername,
    operatorRole,
  });
  const userStats = await Promise.all(visibleUsers.map(buildUserStats));
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const titleCounts = new Map<string, PlayStatsTitleSummary>();
  const recentRecords: PlayStatsRecordSummary[] = [];

  let todayPlayRecords = 0;
  let last7DaysPlayRecords = 0;
  let todayWatchSeconds = 0;
  let last7DaysWatchSeconds = 0;
  let totalWatchSeconds = 0;
  let lastWatchAt: number | null = null;

  for (const item of userStats) {
    for (const record of item.records) {
      const recordWatchSeconds = watchSeconds(record);
      totalWatchSeconds += recordWatchSeconds;
      if (isSameLocalDay(record.save_time, now)) {
        todayPlayRecords += 1;
        todayWatchSeconds += recordWatchSeconds;
      }
      if (record.save_time >= sevenDaysAgo) {
        last7DaysPlayRecords += 1;
        last7DaysWatchSeconds += recordWatchSeconds;
      }
      if (!lastWatchAt || record.save_time > lastWatchAt) {
        lastWatchAt = record.save_time;
      }

      const title = record.title || '未命名影片';
      const existing = titleCounts.get(title);
      titleCounts.set(title, {
        title,
        count: (existing?.count || 0) + 1,
        watchSeconds: (existing?.watchSeconds || 0) + recordWatchSeconds,
        latestSaveTime: Math.max(
          existing?.latestSaveTime || 0,
          record.save_time
        ),
      });
      recentRecords.push(toRecordSummary(item.user.username, record));
    }
  }

  const userRanking = userStats
    .map((item) => ({
      username: item.user.username,
      role: item.user.role,
      playRecordCount: item.records.length,
      watchSeconds: item.watchSeconds,
      lastActiveAt: item.lastActiveAt,
      isOnline: item.isOnline,
      latestPlayRecord: item.latestPlayRecord,
    }))
    .sort((a, b) => {
      if (b.playRecordCount !== a.playRecordCount) {
        return b.playRecordCount - a.playRecordCount;
      }
      if (a.lastActiveAt === b.lastActiveAt) {
        return a.username.localeCompare(b.username);
      }
      if (a.lastActiveAt === null) return 1;
      if (b.lastActiveAt === null) return -1;
      return b.lastActiveAt - a.lastActiveAt;
    });

  return {
    viewerRole: operatorRole,
    totalUsers: visibleUsers.length,
    onlineUsers: userStats.filter((item) => item.isOnline).length,
    totalPlayRecords: userStats.reduce(
      (total, item) => total + item.records.length,
      0
    ),
    totalWatchSeconds,
    todayActiveUsers: userStats.filter((item) =>
      item.lastActiveAt ? isSameLocalDay(item.lastActiveAt, now) : false
    ).length,
    last7DaysActiveUsers: userStats.filter((item) =>
      item.lastActiveAt ? item.lastActiveAt >= sevenDaysAgo : false
    ).length,
    todayPlayRecords,
    last7DaysPlayRecords,
    todayWatchSeconds,
    last7DaysWatchSeconds,
    lastWatchAt,
    topTitles: Array.from(titleCounts.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.latestSaveTime - a.latestSaveTime;
      })
      .slice(0, TOP_LIMIT),
    userRanking:
      operatorRole === 'user' ? userRanking.slice(0, 1) : userRanking,
    recentRecords: recentRecords
      .sort((a, b) => b.saveTime - a.saveTime)
      .slice(0, TOP_LIMIT),
  };
}

export async function getOnlineCount() {
  const users = await listAllUsers();
  const stats = await Promise.all(users.map(buildUserStats));
  return stats.filter((item) => item.isOnline).length;
}
