import { db } from './db';
import { getWatchTimeUserKey } from './watch-time-keys';

const WATCH_TIME_VERSION = 1;
const MAX_REPORT_DELTA_SECONDS = 60;
const REPORT_GRACE_SECONDS = 5;

export { getWatchTimeUserKey };

export interface WatchTimeEntry {
  key: string;
  source: string;
  id: string;
  title: string;
  sourceName: string;
  cover: string;
  year: string;
  episode: number;
  totalEpisodes: number;
  totalTime: number;
  progressTime: number;
  watchSeconds: number;
  dailySeconds: Record<string, number>;
  firstWatchedAt: number;
  lastWatchedAt: number;
  lastReportedAt: number;
}

export interface WatchTimeLedger {
  version: 1;
  updatedAt: number;
  entries: Record<string, WatchTimeEntry>;
}

export interface WatchTimeReportInput {
  username: string;
  source: string;
  id: string;
  title: string;
  sourceName: string;
  cover?: string;
  year?: string;
  episode: number;
  totalEpisodes: number;
  totalTime: number;
  progressTime: number;
  deltaSeconds: number;
}

export interface WatchTimeReportResult {
  acceptedSeconds: number;
  totalWatchSeconds: number;
}

export interface WatchTimeRange {
  startAt: number;
  endAt: number;
}

function cleanString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function cleanPositiveInt(value: unknown, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function entryKey(
  input: Pick<WatchTimeReportInput, 'source' | 'id' | 'episode'>
) {
  return `${input.source}+${input.id}:${input.episode}`;
}

function dateKey(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateKeyToTimestamp(key: string) {
  const [year, month, day] = key.split('-').map((part) => Number(part));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getTime();
}

function parseLedger(raw: string | null): WatchTimeLedger {
  if (!raw) {
    return { version: WATCH_TIME_VERSION, updatedAt: 0, entries: {} };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WatchTimeLedger>;
    if (!parsed || typeof parsed !== 'object' || !parsed.entries) {
      return { version: WATCH_TIME_VERSION, updatedAt: 0, entries: {} };
    }

    const entries: Record<string, WatchTimeEntry> = {};
    for (const [key, entry] of Object.entries(parsed.entries)) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Partial<WatchTimeEntry>;
      entries[key] = {
        key,
        source: cleanString(item.source),
        id: cleanString(item.id),
        title: cleanString(item.title, '未命名影片'),
        sourceName: cleanString(item.sourceName),
        cover: cleanString(item.cover),
        year: cleanString(item.year),
        episode: cleanPositiveInt(item.episode, 1) || 1,
        totalEpisodes: cleanPositiveInt(item.totalEpisodes, 1) || 1,
        totalTime: cleanPositiveInt(item.totalTime),
        progressTime: cleanPositiveInt(item.progressTime),
        watchSeconds: cleanPositiveInt(item.watchSeconds),
        dailySeconds:
          item.dailySeconds && typeof item.dailySeconds === 'object'
            ? Object.fromEntries(
                Object.entries(item.dailySeconds).map(([day, seconds]) => [
                  day,
                  cleanPositiveInt(seconds),
                ])
              )
            : {},
        firstWatchedAt: cleanPositiveInt(item.firstWatchedAt),
        lastWatchedAt: cleanPositiveInt(item.lastWatchedAt),
        lastReportedAt: cleanPositiveInt(item.lastReportedAt),
      };
    }

    return {
      version: WATCH_TIME_VERSION,
      updatedAt: cleanPositiveInt(parsed.updatedAt),
      entries,
    };
  } catch {
    return { version: WATCH_TIME_VERSION, updatedAt: 0, entries: {} };
  }
}

export function getWatchTimeEntrySeconds(
  entry: WatchTimeEntry,
  range?: WatchTimeRange
) {
  if (!range) return entry.watchSeconds;

  return Object.entries(entry.dailySeconds).reduce((total, [day, seconds]) => {
    const timestamp = dateKeyToTimestamp(day);
    if (timestamp === null) return total;
    if (timestamp < range.startAt || timestamp > range.endAt) return total;
    return total + cleanPositiveInt(seconds);
  }, 0);
}

function allowedSeconds(
  requestedSeconds: number,
  previous: WatchTimeEntry | undefined,
  now: number
) {
  const requested = cleanPositiveInt(requestedSeconds);
  if (requested <= 0) return 0;

  const elapsedBound = previous?.lastReportedAt
    ? Math.max(
        0,
        Math.floor((now - previous.lastReportedAt) / 1000) +
          REPORT_GRACE_SECONDS
      )
    : MAX_REPORT_DELTA_SECONDS;

  return Math.min(requested, MAX_REPORT_DELTA_SECONDS, elapsedBound);
}

export async function getWatchTimeLedger(username: string) {
  return parseLedger(await db.getGlobalValue(getWatchTimeUserKey(username)));
}

export async function getWatchTimeEntries(username: string) {
  const ledger = await getWatchTimeLedger(username);
  return Object.values(ledger.entries).sort(
    (a, b) => b.lastWatchedAt - a.lastWatchedAt
  );
}

export async function getUserWatchSeconds(
  username: string,
  range?: WatchTimeRange
) {
  const entries = await getWatchTimeEntries(username);
  return entries.reduce(
    (total, entry) => total + getWatchTimeEntrySeconds(entry, range),
    0
  );
}

export async function recordWatchTime(
  input: WatchTimeReportInput,
  now = Date.now()
): Promise<WatchTimeReportResult> {
  const source = cleanString(input.source);
  const id = cleanString(input.id);
  const title = cleanString(input.title);
  const sourceName = cleanString(input.sourceName);
  const episode = cleanPositiveInt(input.episode, 1) || 1;

  if (!input.username || !source || !id || !title || !sourceName) {
    throw new Error('Invalid watch time report');
  }

  const ledger = await getWatchTimeLedger(input.username);
  const key = entryKey({ source, id, episode });
  const previous = ledger.entries[key];
  const acceptedSeconds = allowedSeconds(input.deltaSeconds, previous, now);
  const day = dateKey(now);

  const next: WatchTimeEntry = {
    key,
    source,
    id,
    title,
    sourceName,
    cover: cleanString(input.cover),
    year: cleanString(input.year),
    episode,
    totalEpisodes: cleanPositiveInt(input.totalEpisodes, 1) || 1,
    totalTime: cleanPositiveInt(input.totalTime),
    progressTime: cleanPositiveInt(input.progressTime),
    watchSeconds: (previous?.watchSeconds || 0) + acceptedSeconds,
    dailySeconds: {
      ...(previous?.dailySeconds || {}),
      [day]: (previous?.dailySeconds?.[day] || 0) + acceptedSeconds,
    },
    firstWatchedAt: previous?.firstWatchedAt || now,
    lastWatchedAt: now,
    lastReportedAt: now,
  };

  ledger.entries[key] = next;
  ledger.updatedAt = now;

  await db.setGlobalValue(
    getWatchTimeUserKey(input.username),
    JSON.stringify(ledger)
  );

  return {
    acceptedSeconds,
    totalWatchSeconds: next.watchSeconds,
  };
}
