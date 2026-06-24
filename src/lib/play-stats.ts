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
import {
  getWatchTimeEntries,
  getWatchTimeEntrySeconds,
  WatchTimeEntry,
} from './watch-time';

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

export type PersonalPlayStatsRecordSummary = Omit<
  PlayStatsRecordSummary,
  'username'
>;

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

interface PlayStatsBaseResult {
  totalPlayRecords: number;
  totalWatchSeconds: number;
  todayPlayRecords: number;
  last7DaysPlayRecords: number;
  todayWatchSeconds: number;
  last7DaysWatchSeconds: number;
  lastWatchAt: number | null;
}

export interface AdminPlayStatsResult extends PlayStatsBaseResult {
  viewerRole: Exclude<UserActivityRole, 'user'>;
  totalUsers: number;
  onlineUsers: number;
  todayActiveUsers: number;
  last7DaysActiveUsers: number;
  topTitles: PlayStatsTitleSummary[];
  userRanking: PlayStatsUserSummary[];
  recentRecords: PlayStatsRecordSummary[];
}

export interface UserPlayStatsResult extends PlayStatsBaseResult {
  viewerRole: 'user';
  latestRecord: PersonalPlayStatsRecordSummary | null;
  recentRecords: PersonalPlayStatsRecordSummary[];
}

export type PlayStatsResult = AdminPlayStatsResult | UserPlayStatsResult;

function progressPercent(record: PlayRecord) {
  if (!record.total_time) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((record.play_time / record.total_time) * 100))
  );
}

function watchEntryProgressPercent(entry: WatchTimeEntry) {
  if (!entry.totalTime) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((entry.progressTime / entry.totalTime) * 100))
  );
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
    watchSeconds: 0,
    saveTime: record.save_time,
  };
}

function watchEntryToRecordSummary(
  username: string,
  entry: WatchTimeEntry
): PlayStatsRecordSummary {
  return {
    username,
    title: entry.title,
    episode: entry.episode,
    sourceName: entry.sourceName,
    progressPercent: watchEntryProgressPercent(entry),
    watchSeconds: entry.watchSeconds,
    saveTime: entry.lastWatchedAt,
  };
}

function toPersonalRecordSummary(
  record: PlayStatsRecordSummary
): PersonalPlayStatsRecordSummary {
  return {
    title: record.title,
    episode: record.episode,
    sourceName: record.sourceName,
    progressPercent: record.progressPercent,
    watchSeconds: record.watchSeconds,
    saveTime: record.saveTime,
  };
}

function latestRecordFrom(records: Record<string, PlayRecord>) {
  return Object.values(records).sort((a, b) => b.save_time - a.save_time)[0];
}

function latestWatchEntryFrom(entries: WatchTimeEntry[]) {
  return [...entries].sort((a, b) => b.lastWatchedAt - a.lastWatchedAt)[0];
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

function localDayRange(timestamp: number) {
  const date = new Date(timestamp);
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
  return {
    startAt: start,
    endAt: start + 24 * 60 * 60 * 1000 - 1,
  };
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
  const [records, watchEntries, deviceLastActiveAt] = await Promise.all([
    db.getAllPlayRecords(user.username),
    getWatchTimeEntries(user.username),
    getLastActiveAt(user.username),
  ]);
  const recordList = Object.values(records);
  const latestRecord = latestRecordFrom(records);
  const latestWatchEntry = latestWatchEntryFrom(watchEntries);
  const totalWatchSeconds = watchEntries.reduce(
    (total, entry) => total + entry.watchSeconds,
    0
  );
  const lastActiveAt = newestActivityTime(
    deviceLastActiveAt,
    latestRecord?.save_time
  );

  return {
    user,
    records: recordList,
    watchEntries,
    watchSeconds: totalWatchSeconds,
    lastActiveAt,
    isOnline: Boolean(
      lastActiveAt && Date.now() - lastActiveAt <= ONLINE_THRESHOLD_MS
    ),
    latestPlayRecord: latestWatchEntry
      ? watchEntryToRecordSummary(user.username, latestWatchEntry)
      : latestRecord
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
  const todayRange = localDayRange(now);
  const last7DaysRange = { startAt: sevenDaysAgo, endAt: now };
  const titleCounts = new Map<string, PlayStatsTitleSummary>();
  const recentRecords: PlayStatsRecordSummary[] = [];

  let todayPlayRecords = 0;
  let last7DaysPlayRecords = 0;
  let todayWatchSeconds = 0;
  let last7DaysWatchSeconds = 0;
  let totalWatchSeconds = 0;
  let lastWatchAt: number | null = null;

  for (const item of userStats) {
    for (const entry of item.watchEntries) {
      const recordWatchSeconds = entry.watchSeconds;
      const recordTodayWatchSeconds = getWatchTimeEntrySeconds(
        entry,
        todayRange
      );
      const recordLast7DaysWatchSeconds = getWatchTimeEntrySeconds(
        entry,
        last7DaysRange
      );
      totalWatchSeconds += recordWatchSeconds;
      if (recordTodayWatchSeconds > 0) {
        todayPlayRecords += 1;
        todayWatchSeconds += recordTodayWatchSeconds;
      }
      if (recordLast7DaysWatchSeconds > 0) {
        last7DaysPlayRecords += 1;
        last7DaysWatchSeconds += recordLast7DaysWatchSeconds;
      }
      if (!lastWatchAt || entry.lastWatchedAt > lastWatchAt) {
        lastWatchAt = entry.lastWatchedAt;
      }

      const title = entry.title || '未命名影片';
      const existing = titleCounts.get(title);
      titleCounts.set(title, {
        title,
        count: (existing?.count || 0) + 1,
        watchSeconds: (existing?.watchSeconds || 0) + recordWatchSeconds,
        latestSaveTime: Math.max(
          existing?.latestSaveTime || 0,
          entry.lastWatchedAt
        ),
      });
      recentRecords.push(watchEntryToRecordSummary(item.user.username, entry));
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
      if (b.watchSeconds !== a.watchSeconds) {
        return b.watchSeconds - a.watchSeconds;
      }
      if (a.lastActiveAt === b.lastActiveAt) {
        return a.username.localeCompare(b.username);
      }
      if (a.lastActiveAt === null) return 1;
      if (b.lastActiveAt === null) return -1;
      return b.lastActiveAt - a.lastActiveAt;
    });

  const totalPlayRecords = userStats.reduce(
    (total, item) => total + item.records.length,
    0
  );
  const sortedRecentRecords = recentRecords
    .sort((a, b) => b.saveTime - a.saveTime)
    .slice(0, TOP_LIMIT);
  const baseStats: PlayStatsBaseResult = {
    totalPlayRecords,
    totalWatchSeconds,
    todayPlayRecords,
    last7DaysPlayRecords,
    todayWatchSeconds,
    last7DaysWatchSeconds,
    lastWatchAt,
  };

  if (operatorRole === 'user') {
    const personalRecentRecords = sortedRecentRecords.map(
      toPersonalRecordSummary
    );

    return {
      viewerRole: 'user',
      ...baseStats,
      latestRecord: personalRecentRecords[0] || null,
      recentRecords: personalRecentRecords,
    };
  }

  return {
    viewerRole: operatorRole,
    ...baseStats,
    totalUsers: visibleUsers.length,
    onlineUsers: userStats.filter((item) => item.isOnline).length,
    todayActiveUsers: userStats.filter((item) =>
      item.lastActiveAt ? isSameLocalDay(item.lastActiveAt, now) : false
    ).length,
    last7DaysActiveUsers: userStats.filter((item) =>
      item.lastActiveAt ? item.lastActiveAt >= sevenDaysAgo : false
    ).length,
    topTitles: Array.from(titleCounts.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.latestSaveTime - a.latestSaveTime;
      })
      .slice(0, TOP_LIMIT),
    userRanking,
    recentRecords: sortedRecentRecords,
  };
}

export async function getOnlineCount() {
  const users = await listAllUsers();
  const stats = await Promise.all(users.map(buildUserStats));
  return stats.filter((item) => item.isOnline).length;
}
