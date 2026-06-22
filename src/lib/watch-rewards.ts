import { getConfig } from '@/lib/config';

import { db } from './db';
import { getUserWatchSeconds } from './watch-time';

const USER_FETCH_LIMIT = 100000;
const SETTLEMENT_KEY = 'watch_rewards.latest_weekly_settlement';
const REWARD_VALID_MS = 7 * 24 * 60 * 60 * 1000;

export interface WatchReward {
  level: 1 | 2 | 3 | 4;
  title: string;
  minSeconds: number;
}

export interface WatchWeekRange {
  startAt: number;
  endAt: number;
  label: string;
}

export interface WatchLeaderboardRow {
  username: string;
  rank: number;
  watchSeconds: number;
  reward: WatchReward | null;
  rankTitle: string | null;
  qualified: boolean;
}

export interface WatchLeaderboardResult {
  type: 'weekly' | 'all-time';
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  weekLabel?: string;
  weekStartAt?: number;
  weekEndAt?: number;
  rewardExpiresAt?: number;
  rows: WatchLeaderboardRow[];
}

export interface WeeklyWatchSettlement {
  id: string;
  settledAt: number;
  expiresAt: number;
  weekStartAt: number;
  weekEndAt: number;
  weekLabel: string;
  rows: WatchLeaderboardRow[];
}

export interface LeaderboardInput {
  viewerUsername: string;
  page: number;
  limit: number;
  now?: number;
}

export interface CurrentWatchReward {
  reward: WatchReward;
  rank: number;
  rankTitle: string | null;
  weekLabel: string;
  expiresAt: number;
  watchSeconds: number;
}

export interface WeeklyWatchNotification {
  settlementId: string;
  weekLabel: string;
  rank: number;
  rankTitle: string | null;
  watchSeconds: number;
  reward: WatchReward | null;
  expiresAt: number;
}

export const WEEKLY_REWARD_TIERS: WatchReward[] = [
  { level: 4, minSeconds: 14 * 60 * 60, title: '本周放映王' },
  { level: 3, minSeconds: 7 * 60 * 60, title: '本周追剧达人' },
  { level: 2, minSeconds: 3 * 60 * 60, title: '本周影迷' },
  { level: 1, minSeconds: 1 * 60 * 60, title: '本周观影者' },
];

const RANK_TITLES: Record<number, string> = {
  1: '周榜冠军',
  2: '周榜亚军',
  3: '周榜季军',
};

interface LeaderboardUser {
  username: string;
  role: 'owner' | 'admin' | 'user';
  banned?: boolean;
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function formatLocalDate(timestamp: number) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
}

function normalizePage(page: number) {
  return Math.max(1, Math.floor(page || 1));
}

function normalizeLimit(limit: number) {
  return Math.min(50, Math.max(1, Math.floor(limit || 10)));
}

function paginate<T>(items: T[], page: number, limit: number) {
  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit);
  const start = (normalizedPage - 1) * normalizedLimit;
  return {
    page: normalizedPage,
    limit: normalizedLimit,
    total: items.length,
    totalPages: Math.ceil(items.length / normalizedLimit),
    rows: items.slice(start, start + normalizedLimit),
  };
}

function parseSettlement(raw: string | null): WeeklyWatchSettlement | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WeeklyWatchSettlement;
    if (typeof parsed.id !== 'string' || !Array.isArray(parsed.rows)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getWeeklyWatchReadKey(settlementId: string, username: string) {
  return `watch_rewards.read.${encodeURIComponent(
    settlementId
  )}.${encodeURIComponent(username)}`;
}

async function getLatestSettlement() {
  return parseSettlement(await db.getGlobalValue(SETTLEMENT_KEY));
}

async function saveSettlement(settlement: WeeklyWatchSettlement) {
  await db.setGlobalValue(SETTLEMENT_KEY, JSON.stringify(settlement));
}

function isOwnerUser(user: LeaderboardUser) {
  return user.role === 'owner' || user.username === process.env.USERNAME;
}

async function getOwnerParticipates() {
  const config = await getConfig();
  return config.SiteConfig?.LeaderboardOwnerParticipates === true;
}

async function listLeaderboardUsers() {
  const [ownerParticipates, result] = await Promise.all([
    getOwnerParticipates(),
    db.getUserListV2(0, USER_FETCH_LIMIT, process.env.USERNAME, ''),
  ]);
  const users = result.users.map((user) => ({
    username: user.username,
    role: user.role,
    banned: user.banned,
  })) as LeaderboardUser[];

  if (
    ownerParticipates &&
    process.env.USERNAME &&
    !users.some((user) => user.username === process.env.USERNAME)
  ) {
    users.unshift({
      username: process.env.USERNAME,
      role: 'owner',
      banned: false,
    });
  }

  return users.filter((user) => {
    if (user.banned) return false;
    if (!ownerParticipates && isOwnerUser(user)) return false;
    return true;
  });
}

function buildRowsFromTotals(
  totals: Array<{ username: string; watchSeconds: number }>,
  rewardByUsername?: Map<string, WatchLeaderboardRow>,
  useWeeklyRewards = false
) {
  return totals
    .sort((a, b) => {
      if (b.watchSeconds !== a.watchSeconds) {
        return b.watchSeconds - a.watchSeconds;
      }
      return a.username.localeCompare(b.username);
    })
    .map<WatchLeaderboardRow>((item, index) => {
      const rank = index + 1;
      const reward = useWeeklyRewards
        ? getRewardTier(item.watchSeconds)
        : rewardByUsername?.get(item.username)?.reward || null;
      const qualified = useWeeklyRewards
        ? item.watchSeconds >= WEEKLY_REWARD_TIERS[3].minSeconds
        : false;

      return {
        username: item.username,
        rank,
        watchSeconds: item.watchSeconds,
        reward,
        rankTitle: useWeeklyRewards
          ? qualified
            ? RANK_TITLES[rank] || null
            : null
          : null,
        qualified,
      };
    });
}

export function getRewardTier(seconds: number): WatchReward | null {
  return WEEKLY_REWARD_TIERS.find((tier) => seconds >= tier.minSeconds) || null;
}

export function getPreviousWeekRange(now = Date.now()): WatchWeekRange {
  const current = new Date(now);
  const currentMidnight = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate()
  );
  const daysSinceMonday = (currentMidnight.getDay() + 6) % 7;
  const currentMonday = new Date(currentMidnight);
  currentMonday.setDate(currentMonday.getDate() - daysSinceMonday);

  const previousMonday = new Date(currentMonday);
  previousMonday.setDate(previousMonday.getDate() - 7);

  const startAt = previousMonday.getTime();
  const endAt = currentMonday.getTime() - 1;

  return {
    startAt,
    endAt,
    label: `${formatLocalDate(startAt)} - ${formatLocalDate(endAt)}`,
  };
}

export async function settlePreviousWeekWatchRewards(now = Date.now()) {
  const range = getPreviousWeekRange(now);
  const existing = await getLatestSettlement();
  if (
    existing &&
    existing.weekStartAt === range.startAt &&
    existing.weekEndAt === range.endAt
  ) {
    return existing;
  }

  const users = await listLeaderboardUsers();
  const totals = await Promise.all(
    users.map(async (user) => ({
      username: user.username,
      watchSeconds: await getUserWatchSeconds(user.username, range),
    }))
  );
  const rows = buildRowsFromTotals(totals, undefined, true);
  const settlement: WeeklyWatchSettlement = {
    id: `weekly-${range.startAt}`,
    settledAt: now,
    expiresAt: now + REWARD_VALID_MS,
    weekStartAt: range.startAt,
    weekEndAt: range.endAt,
    weekLabel: range.label,
    rows,
  };

  await saveSettlement(settlement);
  return settlement;
}

export async function getWeeklyWatchLeaderboard(input: LeaderboardInput) {
  let settlement = await getLatestSettlement();
  const range = getPreviousWeekRange(input.now);
  if (
    !settlement ||
    settlement.weekStartAt !== range.startAt ||
    settlement.weekEndAt !== range.endAt
  ) {
    settlement = await settlePreviousWeekWatchRewards(input.now);
  }

  const page = normalizePage(input.page);
  const limit = normalizeLimit(input.limit);
  const paged = paginate(settlement.rows, page, limit);

  return {
    type: 'weekly' as const,
    page: paged.page,
    limit: paged.limit,
    total: paged.total,
    totalPages: paged.totalPages,
    weekLabel: settlement.weekLabel,
    weekStartAt: settlement.weekStartAt,
    weekEndAt: settlement.weekEndAt,
    rewardExpiresAt: settlement.expiresAt,
    rows: paged.rows,
  };
}

export async function getAllTimeWatchLeaderboard(input: LeaderboardInput) {
  const users = await listLeaderboardUsers();
  const totals = await Promise.all(
    users.map(async (user) => ({
      username: user.username,
      watchSeconds: await getUserWatchSeconds(user.username),
    }))
  );
  const rows = buildRowsFromTotals(totals, undefined, false);
  const paged = paginate(rows, input.page, input.limit);

  return {
    type: 'all-time' as const,
    page: paged.page,
    limit: paged.limit,
    total: paged.total,
    totalPages: paged.totalPages,
    rows: paged.rows,
  };
}

export async function getCurrentWatchReward(
  username: string,
  now = Date.now()
): Promise<CurrentWatchReward | null> {
  const settlement = await getLatestSettlement();
  if (!settlement || settlement.expiresAt < now) return null;
  const row = settlement.rows.find((item) => item.username === username);
  if (!row?.reward) return null;

  return {
    reward: row.reward,
    rank: row.rank,
    rankTitle: row.rankTitle,
    weekLabel: settlement.weekLabel,
    expiresAt: settlement.expiresAt,
    watchSeconds: row.watchSeconds,
  };
}

export async function getWeeklyWatchNotification(
  username: string,
  now = Date.now()
): Promise<WeeklyWatchNotification | null> {
  const settlement = await getLatestSettlement();
  if (!settlement || settlement.expiresAt < now) return null;
  const readValue = await db.getGlobalValue(
    getWeeklyWatchReadKey(settlement.id, username)
  );
  if (readValue) return null;

  const row = settlement.rows.find((item) => item.username === username);
  if (!row || row.watchSeconds <= 0) return null;

  return {
    settlementId: settlement.id,
    weekLabel: settlement.weekLabel,
    rank: row.rank,
    rankTitle: row.rankTitle,
    watchSeconds: row.watchSeconds,
    reward: row.reward,
    expiresAt: settlement.expiresAt,
  };
}

export async function markWeeklyWatchNotificationRead(
  username: string,
  settlementId: string
) {
  const settlement = await getLatestSettlement();
  if (!settlement) return;
  if (settlement.id !== settlementId) return;
  await db.setGlobalValue(getWeeklyWatchReadKey(settlementId, username), '1');
}
