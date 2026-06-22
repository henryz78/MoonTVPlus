import { createHmac, timingSafeEqual } from 'crypto';

type WatchRoomAccessPayload = {
  username: string;
  issuedAt: number;
  expiresAt: number;
};

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding =
    normalized.length % 4 === 0
      ? ''
      : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

export function createWatchRoomAccessToken(
  username: string,
  secret: string,
  ttlSeconds = 300
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = encodeBase64Url(
    JSON.stringify({
      username,
      issuedAt,
      expiresAt: issuedAt + ttlSeconds,
    } satisfies WatchRoomAccessPayload)
  );
  const signature = encodeBase64Url(
    createHmac('sha256', secret).update(payload).digest()
  );

  return `${payload}.${signature}`;
}

export function verifyWatchRoomAccessToken(
  token: string,
  secret: string
): WatchRoomAccessPayload | null {
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra) return null;

  const expected = encodeBase64Url(
    createHmac('sha256', secret).update(payload).digest()
  );
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      decodeBase64Url(payload)
    ) as WatchRoomAccessPayload;
    const now = Math.floor(Date.now() / 1000);
    if (
      !parsed.username ||
      !Number.isFinite(parsed.issuedAt) ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt < now
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
