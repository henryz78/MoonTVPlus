import { db } from './db';

const USER_PRESENCE_KEY_PREFIX = 'user_presence:';

export function getUserPresenceKey(username: string) {
  return `${USER_PRESENCE_KEY_PREFIX}${encodeURIComponent(username)}`;
}

export async function recordUserPresence(
  username: string,
  timestamp = Date.now()
) {
  await db.setGlobalValue(getUserPresenceKey(username), String(timestamp));
  return timestamp;
}

export async function getUserPresence(
  username: string
): Promise<number | null> {
  const raw = await db.getGlobalValue(getUserPresenceKey(username));
  if (!raw) return null;

  const timestamp = Number(raw);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;

  return timestamp;
}
