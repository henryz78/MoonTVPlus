import { randomInt } from 'crypto';

interface GlobalCodeStore {
  getGlobalValue(key: string): Promise<string | null>;
  setGlobalValue(key: string, value: string): Promise<void>;
  deleteGlobalValue(key: string): Promise<void>;
}

interface EmailCodeIdentity {
  username: string;
  normalizedEmail: string;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;

interface StoredEmailCode {
  code: string;
  expiresAt: number;
  createdAt: number;
  attempts?: number;
  lockedUntil?: number;
}

function keyFor(identity: EmailCodeIdentity) {
  return `registration:email-code:${identity.username}:${identity.normalizedEmail}`;
}

export function generateRegistrationEmailCode() {
  return randomInt(100000, 1000000).toString();
}

export async function createRegistrationEmailCode(
  store: GlobalCodeStore,
  input: EmailCodeIdentity & { code?: string }
) {
  const code = input.code || generateRegistrationEmailCode();
  await store.setGlobalValue(
    keyFor(input),
    JSON.stringify({
      code,
      expiresAt: Date.now() + CODE_TTL_MS,
      createdAt: Date.now(),
      attempts: 0,
    })
  );
  return code;
}

export async function getRegistrationEmailCodeCooldown(
  store: GlobalCodeStore,
  input: EmailCodeIdentity
) {
  const raw = await store.getGlobalValue(keyFor(input));
  if (!raw) return 0;

  const parsed = JSON.parse(raw) as StoredEmailCode;
  const remaining = parsed.createdAt + RESEND_COOLDOWN_MS - Date.now();
  return Math.max(0, remaining);
}

export async function verifyRegistrationEmailCode(
  store: GlobalCodeStore,
  input: EmailCodeIdentity & { code: string }
) {
  const raw = await store.getGlobalValue(keyFor(input));
  if (!raw) return false;

  const parsed = JSON.parse(raw) as StoredEmailCode;
  if (parsed.expiresAt < Date.now()) return false;
  if (parsed.lockedUntil && parsed.lockedUntil > Date.now()) return false;

  if (parsed.code === input.code.trim()) return true;

  const attempts = (parsed.attempts || 0) + 1;
  await store.setGlobalValue(
    keyFor(input),
    JSON.stringify({
      ...parsed,
      attempts,
      lockedUntil:
        attempts >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : parsed.lockedUntil,
    })
  );

  return false;
}

export async function consumeRegistrationEmailCode(
  store: GlobalCodeStore,
  input: EmailCodeIdentity
) {
  await store.deleteGlobalValue(keyFor(input));
}
