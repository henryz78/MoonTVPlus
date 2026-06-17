import { getConfig } from '@/lib/config';
import { getUserDevices } from '@/lib/refresh-token';
import { PlayRecord } from '@/lib/types';

import { db } from './db';

export type UserActivityRole = 'owner' | 'admin' | 'user';

export interface UserActivityUser {
  username: string;
  role: UserActivityRole;
  banned: boolean;
  created_at?: number;
}

export interface LatestPlayRecordSummary {
  title: string;
  episode: number;
  sourceName: string;
  progressPercent: number;
  saveTime: number;
}

export interface UserActivityOverviewRow {
  username: string;
  role: UserActivityRole;
  banned: boolean;
  lastActiveAt: number | null;
  isOnline: boolean;
  playRecordCount: number;
  latestPlayRecord: LatestPlayRecordSummary | null;
}

export interface UserActivityOverviewResult {
  users: UserActivityOverviewRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserActivityDetailResult {
  user: {
    username: string;
    role: UserActivityRole;
    banned: boolean;
    lastActiveAt: number | null;
    playRecordCount: number;
  };
  records: Array<PlayRecord & { key: string }>;
}

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
const ADMIN_VISIBLE_FETCH_LIMIT = 1000;

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

export function canViewTargetUsername(
  operatorRole: UserActivityRole,
  operatorUsername: string,
  targetUsername: string,
  targetRole: UserActivityRole
): boolean {
  if (operatorRole === 'owner') return true;
  if (operatorRole === 'admin') {
    return targetRole === 'user' || targetUsername === operatorUsername;
  }
  return false;
}

export function summarizeLatestPlayRecord(
  record: PlayRecord
): LatestPlayRecordSummary {
  const progressPercent =
    record.total_time > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((record.play_time / record.total_time) * 100))
        )
      : 0;

  return {
    title: record.title,
    episode: record.index,
    sourceName: record.source_name,
    progressPercent,
    saveTime: record.save_time,
  };
}

async function getConfigUser(username: string) {
  const adminConfig = await getConfig();
  return adminConfig.UserConfig.Users.find((user) => user.username === username);
}

async function getOperatorRole(username: string): Promise<UserActivityRole> {
  if (username === process.env.USERNAME) return 'owner';

  const info = await db.getUserInfoV2(username);
  if (info) {
    if (info.banned) return 'user';
    return info.role;
  }

  const configUser = await getConfigUser(username);
  if (configUser?.banned) return 'user';
  return configUser?.role || 'user';
}

async function getTargetUser(
  username: string
): Promise<UserActivityUser | null> {
  if (username === process.env.USERNAME) {
    const info = await db.getUserInfoV2(username);
    return {
      username,
      role: 'owner',
      banned: info?.banned || false,
      created_at: info?.created_at || 0,
    };
  }

  const info = await db.getUserInfoV2(username);
  if (info) {
    return {
      username,
      role: info.role,
      banned: info.banned,
      created_at: info.created_at,
    };
  }

  const configUser = await getConfigUser(username);
  if (!configUser) return null;
  return {
    username,
    role: configUser.role,
    banned: configUser.banned || false,
  };
}

function latestRecordFrom(records: Record<string, PlayRecord>) {
  const entries = Object.entries(records)
    .map(([key, record]) => ({ key, record }))
    .sort((a, b) => b.record.save_time - a.record.save_time);
  return entries[0] || null;
}

async function getLastActiveAt(username: string): Promise<number | null> {
  const devices = await getUserDevices(username);
  return devices.reduce<number | null>((current, device) => {
    if (!current || device.lastUsed > current) return device.lastUsed;
    return current;
  }, null);
}

async function buildOverviewRow(
  user: UserActivityUser
): Promise<UserActivityOverviewRow> {
  const [records, lastActiveAt] = await Promise.all([
    db.getAllPlayRecords(user.username),
    getLastActiveAt(user.username),
  ]);
  const latest = latestRecordFrom(records);

  return {
    username: user.username,
    role: user.role,
    banned: user.banned,
    lastActiveAt,
    isOnline: Boolean(
      lastActiveAt && Date.now() - lastActiveAt <= ONLINE_THRESHOLD_MS
    ),
    playRecordCount: Object.keys(records).length,
    latestPlayRecord: latest ? summarizeLatestPlayRecord(latest.record) : null,
  };
}

async function listVisibleUsers(input: {
  operatorUsername: string;
  operatorRole: UserActivityRole;
  page: number;
  limit: number;
  search: string;
}) {
  if (input.operatorRole === 'owner') {
    return db.getUserListV2(
      (input.page - 1) * input.limit,
      input.limit,
      process.env.USERNAME,
      input.search
    );
  }

  const all = await db.getUserListV2(
    0,
    ADMIN_VISIBLE_FETCH_LIMIT,
    process.env.USERNAME,
    input.search
  );
  const visibleUsers = all.users.filter((user) =>
    canViewTargetUsername(
      input.operatorRole,
      input.operatorUsername,
      user.username,
      user.role
    )
  );
  const start = (input.page - 1) * input.limit;
  return {
    users: visibleUsers.slice(start, start + input.limit),
    total: visibleUsers.length,
  };
}

export async function getUserActivityOverview(input: {
  operatorUsername: string;
  page: number;
  limit: number;
  search: string;
}): Promise<UserActivityOverviewResult> {
  const operatorRole = await getOperatorRole(input.operatorUsername);
  if (operatorRole !== 'owner' && operatorRole !== 'admin') {
    throw httpError('权限不足', 401);
  }

  const normalizedPage = Math.max(1, input.page || 1);
  const normalizedLimit = Math.min(100, Math.max(1, input.limit || 20));
  const result = await listVisibleUsers({
    operatorUsername: input.operatorUsername,
    operatorRole,
    page: normalizedPage,
    limit: normalizedLimit,
    search: input.search,
  });

  const rows = await Promise.all(result.users.map(buildOverviewRow));
  rows.sort((a, b) => {
    if (a.lastActiveAt === b.lastActiveAt) {
      return a.username.localeCompare(b.username);
    }
    if (a.lastActiveAt === null) return 1;
    if (b.lastActiveAt === null) return -1;
    return b.lastActiveAt - a.lastActiveAt;
  });

  return {
    users: rows,
    total: result.total,
    page: normalizedPage,
    limit: normalizedLimit,
    totalPages: Math.ceil(result.total / normalizedLimit),
  };
}

export async function getUserActivityDetail(input: {
  operatorUsername: string;
  targetUsername: string;
}): Promise<UserActivityDetailResult> {
  const operatorRole = await getOperatorRole(input.operatorUsername);
  if (operatorRole !== 'owner' && operatorRole !== 'admin') {
    throw httpError('权限不足', 401);
  }

  const target = await getTargetUser(input.targetUsername);
  if (!target) {
    throw httpError('目标用户不存在', 404);
  }

  if (
    !canViewTargetUsername(
      operatorRole,
      input.operatorUsername,
      target.username,
      target.role
    )
  ) {
    throw httpError('权限不足', 401);
  }

  const [records, lastActiveAt] = await Promise.all([
    db.getAllPlayRecords(target.username),
    getLastActiveAt(target.username),
  ]);
  const sortedRecords = Object.entries(records)
    .map(([key, record]) => ({ ...record, key }))
    .sort((a, b) => b.save_time - a.save_time);

  return {
    user: {
      username: target.username,
      role: target.role,
      banned: target.banned,
      lastActiveAt,
      playRecordCount: sortedRecords.length,
    },
    records: sortedRecords,
  };
}
