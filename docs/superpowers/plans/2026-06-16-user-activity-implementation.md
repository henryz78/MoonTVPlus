# User Activity Admin Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an owner/admin user activity page with viewing-record summaries and accurate recent activity based on a lightweight authenticated ping.

**Architecture:** Add a tiny refresh-token `lastUsed` touch helper and `/api/auth/activity` endpoint, then build server-side user activity summary helpers used by two admin APIs. Add a global visible-tab activity ping component, a standalone `/admin/user-activity` page, and a role-gated `UserMenu` entry.

**Tech Stack:** Next.js App Router route handlers, React client components, TypeScript, Jest, existing `db` and refresh-token storage helpers.

---

## File Structure

- Modify `src/lib/refresh-token.ts`
  - Add `touchRefreshTokenLastUsed(username, tokenId)` so activity ping can update only the current device token.
- Create `src/app/api/auth/activity/route.ts`
  - Authenticated POST endpoint that touches the current token `lastUsed`.
- Create `src/app/api/auth/activity/route.test.ts`
  - Route-level tests for auth, localStorage rejection, expired refresh token, and successful touch.
- Create `src/lib/admin-user-activity.ts`
  - Shared server helper for operator role resolution, target visibility, play-record summaries, last-active calculation, overview, and detail data.
- Create `src/lib/admin-user-activity.test.ts`
  - Unit tests for owner/admin visibility, latest play record summary, sorting, and detail sorting.
- Create `src/app/api/admin/user-activity/route.ts`
  - Overview endpoint.
- Create `src/app/api/admin/user-activity/[username]/route.ts`
  - Detail endpoint.
- Create `src/components/ActivityPing.tsx`
  - Global client component that sends visible-tab pings.
- Create `src/components/ActivityPing.test.tsx`
  - Client behavior tests for visible/hidden throttling.
- Modify `src/app/layout.tsx`
  - Mount `ActivityPing` near `TokenRefreshManager`.
- Create `src/app/admin/user-activity/page.tsx`
  - Standalone admin page with overview table and detail panel.
- Modify `src/components/UserMenu.tsx`
  - Add owner/admin `用户动态` menu item.

---

### Task 1: Refresh Token Touch Helper And Activity Endpoint

**Files:**
- Modify: `src/lib/refresh-token.ts`
- Create: `src/app/api/auth/activity/route.ts`
- Test: `src/app/api/auth/activity/route.test.ts`

- [ ] **Step 1: Write the failing route tests**

Create `src/app/api/auth/activity/route.test.ts`:

```ts
import { getAuthInfoFromCookie } from '@/lib/auth';
import { touchRefreshTokenLastUsed } from '@/lib/refresh-token';

import { POST } from './route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
    }),
  },
}));

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromCookie: jest.fn(),
}));

jest.mock('@/lib/refresh-token', () => ({
  touchRefreshTokenLastUsed: jest.fn(),
}));

const makeRequest = () => ({}) as Parameters<typeof POST>[0];

describe('POST /api/auth/activity', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({
      username: 'alice',
      tokenId: 'token-1',
      refreshToken: 'refresh-1',
      refreshExpires: Date.now() + 60_000,
    });
    (touchRefreshTokenLastUsed as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    if (originalStorageType === undefined) {
      delete process.env.NEXT_PUBLIC_STORAGE_TYPE;
    } else {
      process.env.NEXT_PUBLIC_STORAGE_TYPE = originalStorageType;
    }
  });

  it('rejects localStorage mode', async () => {
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'localstorage';

    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: '本地存储模式不支持活跃状态上报' });
    expect(touchRefreshTokenLastUsed).not.toHaveBeenCalled();
  });

  it('rejects missing auth fields', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'alice' });

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
    expect(touchRefreshTokenLastUsed).not.toHaveBeenCalled();
  });

  it('rejects expired refresh token metadata', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({
      username: 'alice',
      tokenId: 'token-1',
      refreshToken: 'refresh-1',
      refreshExpires: Date.now() - 1,
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Refresh token expired' });
    expect(touchRefreshTokenLastUsed).not.toHaveBeenCalled();
  });

  it('updates the current device lastUsed', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(touchRefreshTokenLastUsed).toHaveBeenCalledWith('alice', 'token-1');
  });

  it('returns unauthorized when the token record cannot be touched', async () => {
    (touchRefreshTokenLastUsed as jest.Mock).mockResolvedValue(false);

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });
});
```

- [ ] **Step 2: Run the activity route test and verify it fails**

Run:

```bash
corepack pnpm test src/app/api/auth/activity/route.test.ts --runInBand
```

Expected: FAIL because `src/app/api/auth/activity/route.ts` does not exist.

- [ ] **Step 3: Add the refresh-token touch helper**

In `src/lib/refresh-token.ts`, append this export after `verifyRefreshToken`:

```ts
export async function touchRefreshTokenLastUsed(
  username: string,
  tokenId: string
): Promise<boolean> {
  const hashKey = `user_tokens:${username}`;
  const storage = await loadStorage();

  if (
    !storage ||
    typeof (storage as any).adapter?.hGet !== 'function' ||
    typeof (storage as any).adapter?.hSet !== 'function'
  ) {
    console.warn('Redis Hash not supported');
    return false;
  }

  try {
    const dataStr = await (storage as any).adapter.hGet(hashKey, tokenId);
    if (!dataStr) {
      return false;
    }

    const tokenData: TokenData = JSON.parse(dataStr);
    if (Date.now() > tokenData.expiresAt) {
      if (typeof (storage as any).adapter?.hDel === 'function') {
        await (storage as any).adapter.hDel(hashKey, tokenId);
      }
      return false;
    }

    tokenData.lastUsed = Date.now();
    await (storage as any).adapter.hSet(
      hashKey,
      tokenId,
      JSON.stringify(tokenData)
    );

    return true;
  } catch (error) {
    console.error('Failed to touch refresh token lastUsed:', error);
    return false;
  }
}
```

- [ ] **Step 4: Add the activity route**

Create `src/app/api/auth/activity/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { touchRefreshTokenLastUsed } from '@/lib/refresh-token';

export const runtime = 'nodejs';

const STORAGE_TYPE = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

export async function POST(request: NextRequest) {
  if (STORAGE_TYPE === 'localstorage') {
    return NextResponse.json(
      { error: '本地存储模式不支持活跃状态上报' },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (
    !authInfo?.username ||
    !authInfo.tokenId ||
    !authInfo.refreshToken ||
    !authInfo.refreshExpires
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (Date.now() >= authInfo.refreshExpires) {
    return NextResponse.json(
      { error: 'Refresh token expired' },
      { status: 401 }
    );
  }

  const touched = await touchRefreshTokenLastUsed(
    authInfo.username,
    authInfo.tokenId
  );

  if (!touched) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
```

- [ ] **Step 5: Run the activity route test and typecheck**

Run:

```bash
corepack pnpm test src/app/api/auth/activity/route.test.ts --runInBand
corepack pnpm typecheck
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/refresh-token.ts src/app/api/auth/activity/route.ts src/app/api/auth/activity/route.test.ts
git commit -m "feat: add auth activity ping endpoint"
```

---

### Task 2: Admin User Activity Service

**Files:**
- Create: `src/lib/admin-user-activity.ts`
- Test: `src/lib/admin-user-activity.test.ts`

- [ ] **Step 1: Write the failing service tests**

Create `src/lib/admin-user-activity.test.ts`:

```ts
import { getUserDevices } from '@/lib/refresh-token';

import {
  canViewTargetUsername,
  getUserActivityDetail,
  getUserActivityOverview,
  summarizeLatestPlayRecord,
} from './admin-user-activity';
import { db } from './db';

jest.mock('./db', () => ({
  db: {
    getUserInfoV2: jest.fn(),
    getUserListV2: jest.fn(),
    getAllPlayRecords: jest.fn(),
  },
}));

jest.mock('@/lib/refresh-token', () => ({
  getUserDevices: jest.fn(),
}));

const user = (username: string, role: 'owner' | 'admin' | 'user') => ({
  username,
  role,
  banned: false,
  created_at: 1,
});

describe('admin user activity helpers', () => {
  const originalUsername = process.env.USERNAME;
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERNAME = 'owner';
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
  });

  afterEach(() => {
    if (originalUsername === undefined) {
      delete process.env.USERNAME;
    } else {
      process.env.USERNAME = originalUsername;
    }

    if (originalStorageType === undefined) {
      delete process.env.NEXT_PUBLIC_STORAGE_TYPE;
    } else {
      process.env.NEXT_PUBLIC_STORAGE_TYPE = originalStorageType;
    }
  });

  it('allows owner to view any target and admin to view users plus self', () => {
    expect(canViewTargetUsername('owner', 'alice', 'owner', 'owner')).toBe(true);
    expect(canViewTargetUsername('admin', 'admin', 'alice', 'user')).toBe(true);
    expect(canViewTargetUsername('admin', 'admin', 'admin', 'admin')).toBe(true);
    expect(canViewTargetUsername('admin', 'admin', 'owner', 'owner')).toBe(false);
    expect(canViewTargetUsername('admin', 'admin', 'other-admin', 'admin')).toBe(false);
    expect(canViewTargetUsername('user', 'alice', 'alice', 'user')).toBe(false);
  });

  it('summarizes the latest play record without returning the full record', () => {
    const summary = summarizeLatestPlayRecord({
      title: '沙丘：预言',
      source_name: 'source-a',
      cover: 'https://example.com/cover.jpg',
      year: '2024',
      index: 3,
      total_episodes: 6,
      play_time: 30,
      total_time: 60,
      save_time: 1000,
      search_title: '沙丘',
    });

    expect(summary).toEqual({
      title: '沙丘：预言',
      episode: 3,
      sourceName: 'source-a',
      progressPercent: 50,
      saveTime: 1000,
    });
    expect(summary).not.toHaveProperty('cover');
  });

  it('builds owner overview rows sorted by lastActiveAt for returned users', async () => {
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('alice', 'user'), user('bob', 'user')],
      total: 2,
    });
    (db.getAllPlayRecords as jest.Mock).mockImplementation(async (username) => ({
      [`source+${username}`]: {
        title: username === 'alice' ? 'A' : 'B',
        source_name: 'source',
        cover: '',
        year: '',
        index: 1,
        total_episodes: 1,
        play_time: username === 'alice' ? 10 : 20,
        total_time: 100,
        save_time: username === 'alice' ? 10 : 20,
        search_title: '',
      },
    }));
    (getUserDevices as jest.Mock).mockImplementation(async (username) =>
      username === 'alice'
        ? [{ tokenId: 'a', deviceInfo: 'Chrome', createdAt: 1, lastUsed: 100, expiresAt: 9999 }]
        : [{ tokenId: 'b', deviceInfo: 'Chrome', createdAt: 1, lastUsed: 200, expiresAt: 9999 }]
    );

    const result = await getUserActivityOverview({
      operatorUsername: 'owner',
      page: 1,
      limit: 20,
      search: '',
    });

    expect(result.users.map((item) => item.username)).toEqual(['bob', 'alice']);
    expect(result.users[0].latestPlayRecord).toEqual({
      title: 'B',
      episode: 1,
      sourceName: 'source',
      progressPercent: 20,
      saveTime: 20,
    });
    expect(result.total).toBe(2);
  });

  it('filters admin overview to ordinary users and self', async () => {
    (db.getUserInfoV2 as jest.Mock).mockResolvedValue({ role: 'admin', banned: false });
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('owner', 'owner'), user('admin', 'admin'), user('alice', 'user')],
      total: 3,
    });
    (db.getAllPlayRecords as jest.Mock).mockResolvedValue({});
    (getUserDevices as jest.Mock).mockResolvedValue([]);

    const result = await getUserActivityOverview({
      operatorUsername: 'admin',
      page: 1,
      limit: 20,
      search: '',
    });

    expect(result.users.map((item) => item.username).sort()).toEqual(['admin', 'alice']);
  });

  it('returns detail records sorted newest first', async () => {
    (db.getUserInfoV2 as jest.Mock).mockResolvedValue({ role: 'user', banned: false });
    (db.getAllPlayRecords as jest.Mock).mockResolvedValue({
      'source+old': {
        title: 'Old',
        source_name: 'source',
        cover: '',
        year: '',
        index: 1,
        total_episodes: 1,
        play_time: 1,
        total_time: 2,
        save_time: 10,
        search_title: '',
      },
      'source+new': {
        title: 'New',
        source_name: 'source',
        cover: '',
        year: '',
        index: 2,
        total_episodes: 2,
        play_time: 1,
        total_time: 2,
        save_time: 20,
        search_title: '',
      },
    });
    (getUserDevices as jest.Mock).mockResolvedValue([]);

    const result = await getUserActivityDetail({
      operatorUsername: 'owner',
      targetUsername: 'alice',
    });

    expect(result.records.map((record) => record.title)).toEqual(['New', 'Old']);
    expect(result.user).toEqual({
      username: 'alice',
      role: 'user',
      banned: false,
      lastActiveAt: null,
      playRecordCount: 2,
    });
  });
});
```

- [ ] **Step 2: Run the service tests and verify they fail**

Run:

```bash
corepack pnpm test src/lib/admin-user-activity.test.ts --runInBand
```

Expected: FAIL because `src/lib/admin-user-activity.ts` does not exist.

- [ ] **Step 3: Implement the service helper**

Create `src/lib/admin-user-activity.ts`:

```ts
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
      ? Math.min(100, Math.max(0, Math.round((record.play_time / record.total_time) * 100)))
      : 0;

  return {
    title: record.title,
    episode: record.index,
    sourceName: record.source_name,
    progressPercent,
    saveTime: record.save_time,
  };
}

async function getOperatorRole(username: string): Promise<UserActivityRole> {
  if (username === process.env.USERNAME) return 'owner';
  const info = await db.getUserInfoV2(username);
  if (info?.banned) return 'user';
  return info?.role || 'user';
}

async function getTargetUser(username: string): Promise<UserActivityUser | null> {
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
  if (!info) return null;
  return {
    username,
    role: info.role,
    banned: info.banned,
    created_at: info.created_at,
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
  const newest = devices.reduce<number | null>((current, device) => {
    if (!current || device.lastUsed > current) return device.lastUsed;
    return current;
  }, null);
  return newest;
}

async function buildOverviewRow(user: UserActivityUser): Promise<UserActivityOverviewRow> {
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
    isOnline: Boolean(lastActiveAt && Date.now() - lastActiveAt <= ONLINE_THRESHOLD_MS),
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
    throw Object.assign(new Error('权限不足'), { status: 401 });
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
    if (a.lastActiveAt === b.lastActiveAt) return a.username.localeCompare(b.username);
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
    throw Object.assign(new Error('权限不足'), { status: 401 });
  }

  const target = await getTargetUser(input.targetUsername);
  if (!target) {
    throw Object.assign(new Error('目标用户不存在'), { status: 404 });
  }
  if (
    !canViewTargetUsername(
      operatorRole,
      input.operatorUsername,
      target.username,
      target.role
    )
  ) {
    throw Object.assign(new Error('权限不足'), { status: 401 });
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
```

- [ ] **Step 4: Run the service tests**

Run:

```bash
corepack pnpm test src/lib/admin-user-activity.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-user-activity.ts src/lib/admin-user-activity.test.ts
git commit -m "feat: add admin user activity service"
```

---

### Task 3: Admin User Activity API Routes

**Files:**
- Create: `src/app/api/admin/user-activity/route.ts`
- Create: `src/app/api/admin/user-activity/[username]/route.ts`
- Test: `src/app/api/admin/user-activity/route.test.ts`

- [ ] **Step 1: Write route tests**

Create `src/app/api/admin/user-activity/route.test.ts`:

```ts
import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  getUserActivityDetail,
  getUserActivityOverview,
} from '@/lib/admin-user-activity';

import { GET as GET_OVERVIEW } from './route';
import { GET as GET_DETAIL } from './[username]/route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
    }),
  },
}));

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromCookie: jest.fn(),
}));

jest.mock('@/lib/admin-user-activity', () => ({
  getUserActivityOverview: jest.fn(),
  getUserActivityDetail: jest.fn(),
}));

const makeRequest = (url: string) =>
  ({
    url,
  } as Parameters<typeof GET_OVERVIEW>[0]);

describe('admin user activity routes', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'owner' });
  });

  afterEach(() => {
    if (originalStorageType === undefined) {
      delete process.env.NEXT_PUBLIC_STORAGE_TYPE;
    } else {
      process.env.NEXT_PUBLIC_STORAGE_TYPE = originalStorageType;
    }
  });

  it('rejects overview in localStorage mode', async () => {
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'localstorage';

    const response = await GET_OVERVIEW(makeRequest('http://test/api/admin/user-activity'));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: '本地存储模式不支持用户动态' });
  });

  it('rejects overview without auth', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue(null);

    const response = await GET_OVERVIEW(makeRequest('http://test/api/admin/user-activity'));

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns overview data with no-store cache header', async () => {
    (getUserActivityOverview as jest.Mock).mockResolvedValue({
      users: [],
      total: 0,
      page: 2,
      limit: 20,
      totalPages: 0,
    });

    const response = await GET_OVERVIEW(
      makeRequest('http://test/api/admin/user-activity?page=2&limit=20&search=ali')
    );

    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(getUserActivityOverview).toHaveBeenCalledWith({
      operatorUsername: 'owner',
      page: 2,
      limit: 20,
      search: 'ali',
    });
  });

  it('maps service errors to response status', async () => {
    (getUserActivityOverview as jest.Mock).mockRejectedValue(
      Object.assign(new Error('权限不足'), { status: 401 })
    );

    const response = await GET_OVERVIEW(makeRequest('http://test/api/admin/user-activity'));

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: '权限不足' });
  });

  it('returns target detail data', async () => {
    (getUserActivityDetail as jest.Mock).mockResolvedValue({
      user: {
        username: 'alice',
        role: 'user',
        banned: false,
        lastActiveAt: null,
        playRecordCount: 0,
      },
      records: [],
    });

    const response = await GET_DETAIL(
      makeRequest('http://test/api/admin/user-activity/alice') as Parameters<typeof GET_DETAIL>[0],
      { params: { username: 'alice' } }
    );

    expect(response.status).toBe(200);
    expect(getUserActivityDetail).toHaveBeenCalledWith({
      operatorUsername: 'owner',
      targetUsername: 'alice',
    });
  });
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
corepack pnpm test src/app/api/admin/user-activity/route.test.ts --runInBand
```

Expected: FAIL because route files do not exist.

- [ ] **Step 3: Add the overview route**

Create `src/app/api/admin/user-activity/route.ts`:

```ts
/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getUserActivityOverview } from '@/lib/admin-user-activity';
import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'nodejs';

const STORAGE_TYPE = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

function errorResponse(error: unknown) {
  const status = typeof (error as any)?.status === 'number' ? (error as any).status : 500;
  const message = error instanceof Error ? error.message : '获取用户动态失败';
  if (status >= 500) {
    console.error('获取用户动态失败:', error);
  }
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  if (STORAGE_TYPE === 'localstorage') {
    return NextResponse.json(
      { error: '本地存储模式不支持用户动态' },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get('page') || '1', 10);
    const limit = Number.parseInt(searchParams.get('limit') || '20', 10);
    const search = (searchParams.get('search') || '').trim();

    const result = await getUserActivityOverview({
      operatorUsername: authInfo.username,
      page,
      limit,
      search,
    });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 4: Add the detail route**

Create `src/app/api/admin/user-activity/[username]/route.ts`:

```ts
/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getUserActivityDetail } from '@/lib/admin-user-activity';
import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'nodejs';

const STORAGE_TYPE = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

function errorResponse(error: unknown) {
  const status = typeof (error as any)?.status === 'number' ? (error as any).status : 500;
  const message = error instanceof Error ? error.message : '获取用户观看记录失败';
  if (status >= 500) {
    console.error('获取用户观看记录失败:', error);
  }
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  if (STORAGE_TYPE === 'localstorage') {
    return NextResponse.json(
      { error: '本地存储模式不支持用户动态' },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetUsername = decodeURIComponent(params.username || '').trim();
  if (!targetUsername) {
    return NextResponse.json({ error: '缺少目标用户名' }, { status: 400 });
  }

  try {
    const result = await getUserActivityDetail({
      operatorUsername: authInfo.username,
      targetUsername,
    });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 5: Run API tests and typecheck**

Run:

```bash
corepack pnpm test src/lib/admin-user-activity.test.ts src/app/api/admin/user-activity/route.test.ts --runInBand
corepack pnpm typecheck
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/user-activity src/lib/admin-user-activity.ts src/lib/admin-user-activity.test.ts
git commit -m "feat: add admin user activity APIs"
```

---

### Task 4: Visible-Tab Activity Ping Client

**Files:**
- Create: `src/components/ActivityPing.tsx`
- Test: `src/components/ActivityPing.test.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Write client behavior tests**

Create `src/components/ActivityPing.test.tsx`:

```tsx
import { render } from '@testing-library/react';

import ActivityPing from './ActivityPing';

describe('ActivityPing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    Object.defineProperty(window, 'RUNTIME_CONFIG', {
      value: { STORAGE_TYPE: 'redis' },
      configurable: true,
    });
    Object.defineProperty(document, 'cookie', {
      value: encodeURIComponent(
        JSON.stringify({
          username: 'alice',
          tokenId: 'token-1',
          refreshToken: 'refresh',
          refreshExpires: Date.now() + 60_000,
        })
      ).replace(/^/, 'auth='),
      configurable: true,
    });
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends an initial ping and repeats while visible', async () => {
    render(<ActivityPing />);

    await Promise.resolve();
    expect(fetch).toHaveBeenCalledWith('/api/auth/activity', {
      method: 'POST',
      credentials: 'include',
    });

    jest.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not ping while hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });

    render(<ActivityPing />);

    jest.advanceTimersByTime(120_000);
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('pings when visible again only after the previous success is older than 60 seconds', async () => {
    render(<ActivityPing />);

    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    jest.advanceTimersByTime(59_000);

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    jest.advanceTimersByTime(1_000);

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not run in localStorage mode', async () => {
    Object.defineProperty(window, 'RUNTIME_CONFIG', {
      value: { STORAGE_TYPE: 'localstorage' },
      configurable: true,
    });

    render(<ActivityPing />);

    jest.advanceTimersByTime(120_000);
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```bash
corepack pnpm test src/components/ActivityPing.test.tsx --runInBand
```

Expected: FAIL because `src/components/ActivityPing.tsx` does not exist.

- [ ] **Step 3: Implement ActivityPing**

Create `src/components/ActivityPing.tsx`:

```tsx
'use client';

import { useEffect } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

const PING_INTERVAL_MS = 60_000;

export default function ActivityPing() {
  useEffect(() => {
    const storageType =
      (window as any).RUNTIME_CONFIG?.STORAGE_TYPE || 'localstorage';
    if (storageType === 'localstorage') {
      return;
    }

    let lastSuccessfulPing = 0;
    let inFlight = false;
    let disposed = false;

    const canPing = () => {
      if (document.visibilityState !== 'visible') return false;
      const authInfo = getAuthInfoFromBrowserCookie();
      return Boolean(
        authInfo?.username &&
          authInfo.tokenId &&
          authInfo.refreshToken &&
          authInfo.refreshExpires &&
          Date.now() < authInfo.refreshExpires
      );
    };

    const sendPing = async () => {
      if (inFlight || disposed || !canPing()) return;
      inFlight = true;
      try {
        const response = await fetch('/api/auth/activity', {
          method: 'POST',
          credentials: 'include',
        });
        if (response.ok) {
          lastSuccessfulPing = Date.now();
        }
      } catch (error) {
        console.warn('[ActivityPing] Failed to update activity:', error);
      } finally {
        inFlight = false;
      }
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastSuccessfulPing >= PING_INTERVAL_MS
      ) {
        void sendPing();
      }
    };

    void sendPing();
    const intervalId = window.setInterval(() => {
      void sendPing();
    }, PING_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}
```

- [ ] **Step 4: Mount ActivityPing globally**

Modify `src/app/layout.tsx`:

```tsx
import ActivityPing from '../components/ActivityPing';
```

Then render it next to `TokenRefreshManager`:

```tsx
<TokenRefreshManager />
<ActivityPing />
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
corepack pnpm test src/components/ActivityPing.test.tsx --runInBand
corepack pnpm typecheck
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/ActivityPing.tsx src/components/ActivityPing.test.tsx src/app/layout.tsx
git commit -m "feat: report active sessions from visible pages"
```

---

### Task 5: Admin User Activity Page And Menu Entry

**Files:**
- Create: `src/app/admin/user-activity/page.tsx`
- Modify: `src/components/UserMenu.tsx`

- [ ] **Step 1: Add the page component**

Create `src/app/admin/user-activity/page.tsx`:

```tsx
'use client';

import { Activity, RefreshCw, Search, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import PageLayout from '@/components/PageLayout';

type Role = 'owner' | 'admin' | 'user';

interface LatestPlayRecordSummary {
  title: string;
  episode: number;
  sourceName: string;
  progressPercent: number;
  saveTime: number;
}

interface OverviewRow {
  username: string;
  role: Role;
  banned: boolean;
  lastActiveAt: number | null;
  isOnline: boolean;
  playRecordCount: number;
  latestPlayRecord: LatestPlayRecordSummary | null;
}

interface OverviewResponse {
  users: OverviewRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface DetailRecord {
  key: string;
  title: string;
  source_name: string;
  cover: string;
  index: number;
  total_episodes: number;
  play_time: number;
  total_time: number;
  save_time: number;
}

interface DetailResponse {
  user: {
    username: string;
    role: Role;
    banned: boolean;
    lastActiveAt: number | null;
    playRecordCount: number;
  };
  records: DetailRecord[];
}

const roleText: Record<Role, string> = {
  owner: '站长',
  admin: '管理员',
  user: '用户',
};

function formatDateTime(timestamp: number) {
  return new Date(timestamp)
    .toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(/\//g, '-');
}

function formatActivity(lastActiveAt: number | null, isOnline?: boolean) {
  if (!lastActiveAt) return '从未活跃';
  const diff = Date.now() - lastActiveAt;
  if (isOnline || diff <= 2 * 60 * 1000) return '在线';
  if (diff <= 10 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  return formatDateTime(lastActiveAt);
}

function formatProgress(record: DetailRecord) {
  if (!record.total_time) return '进度未知';
  const percent = Math.round((record.play_time / record.total_time) * 100);
  return `${Math.min(100, Math.max(0, percent))}%`;
}

export default function UserActivityPage() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/admin/user-activity?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '加载用户动态失败');
      }
      setOverview(data);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : '加载用户动态失败');
    } finally {
      setOverviewLoading(false);
    }
  }, [page, search]);

  const loadDetail = useCallback(async (username: string) => {
    setSelectedUsername(username);
    setDetailLoading(true);
    setDetailError('');
    try {
      const response = await fetch(
        `/api/admin/user-activity/${encodeURIComponent(username)}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '加载观看记录失败');
      }
      setDetail(data);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '加载观看记录失败');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const users = overview?.users || [];
  const totalPages = overview?.totalPages || 0;
  const selectedUser = useMemo(
    () => users.find((item) => item.username === selectedUsername) || null,
    [selectedUsername, users]
  );

  return (
    <PageLayout activePath='/admin'>
      <div className='px-4 py-8 md:px-8 max-w-7xl mx-auto'>
        <div className='mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div>
            <h1 className='flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100'>
              <Activity className='h-6 w-6 text-blue-500' />
              用户动态
            </h1>
            <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
              查看用户最近活跃状态和观看记录
            </p>
          </div>
          <div className='flex gap-2'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400' />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder='搜索用户'
                className='w-56 rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
              />
            </div>
            <button
              onClick={() => loadOverview()}
              disabled={overviewLoading}
              className='inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60'
            >
              <RefreshCw className={`h-4 w-4 ${overviewLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>

        {overviewError && (
          <div className='mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'>
            {overviewError}
          </div>
        )}

        <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]'>
          <div className='overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'>
            <div className='grid grid-cols-[1fr_120px_120px_1.2fr_96px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400'>
              <span>用户</span>
              <span>活跃</span>
              <span>记录</span>
              <span>最近观看</span>
              <span>操作</span>
            </div>
            {overviewLoading && users.length === 0 ? (
              <div className='p-8 text-center text-sm text-gray-500'>加载中...</div>
            ) : users.length === 0 ? (
              <div className='p-8 text-center text-sm text-gray-500'>暂无用户动态</div>
            ) : (
              users.map((user) => (
                <div
                  key={user.username}
                  className='grid grid-cols-[1fr_120px_120px_1.2fr_96px] gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0 dark:border-gray-800'
                >
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100'>
                      <UserRound className='h-4 w-4 text-gray-400' />
                      <span className='truncate'>{user.username}</span>
                    </div>
                    <div className='mt-1 text-xs text-gray-500'>
                      {roleText[user.role]}{user.banned ? ' · 已封禁' : ''}
                    </div>
                  </div>
                  <span className={user.isOnline ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'}>
                    {formatActivity(user.lastActiveAt, user.isOnline)}
                  </span>
                  <span>{user.playRecordCount} 条</span>
                  <span className='min-w-0 truncate text-gray-700 dark:text-gray-300'>
                    {user.latestPlayRecord
                      ? `${user.latestPlayRecord.title} · 第 ${user.latestPlayRecord.episode} 集 · ${user.latestPlayRecord.progressPercent}%`
                      : '暂无观看记录'}
                  </span>
                  <button
                    onClick={() => loadDetail(user.username)}
                    className='rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                  >
                    查看详情
                  </button>
                </div>
              ))
            )}
            <div className='flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-800'>
              <span>共 {overview?.total || 0} 个用户</span>
              <div className='flex items-center gap-2'>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className='rounded-md border border-gray-300 px-2 py-1 disabled:opacity-50 dark:border-gray-700'
                >
                  上一页
                </button>
                <span>{page} / {Math.max(1, totalPages)}</span>
                <button
                  disabled={totalPages === 0 || page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                  className='rounded-md border border-gray-300 px-2 py-1 disabled:opacity-50 dark:border-gray-700'
                >
                  下一页
                </button>
              </div>
            </div>
          </div>

          <aside className='rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900'>
            <div className='mb-3'>
              <h2 className='text-base font-semibold text-gray-900 dark:text-gray-100'>
                {selectedUsername ? `${selectedUsername} 的观看记录` : '观看记录详情'}
              </h2>
              {selectedUser && (
                <p className='mt-1 text-xs text-gray-500'>
                  最近活跃：{formatActivity(selectedUser.lastActiveAt, selectedUser.isOnline)}
                </p>
              )}
            </div>
            {detailLoading ? (
              <div className='py-10 text-center text-sm text-gray-500'>加载中...</div>
            ) : detailError ? (
              <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'>
                {detailError}
              </div>
            ) : !detail ? (
              <div className='py-10 text-center text-sm text-gray-500'>选择用户查看详情</div>
            ) : detail.records.length === 0 ? (
              <div className='py-10 text-center text-sm text-gray-500'>暂无观看记录</div>
            ) : (
              <div className='space-y-3'>
                {detail.records.map((record) => (
                  <div key={record.key} className='flex gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800'>
                    {record.cover ? (
                      <img src={record.cover} alt='' className='h-20 w-14 rounded object-cover' />
                    ) : (
                      <div className='h-20 w-14 rounded bg-gray-200 dark:bg-gray-800' />
                    )}
                    <div className='min-w-0 flex-1'>
                      <div className='truncate font-medium text-gray-900 dark:text-gray-100'>{record.title}</div>
                      <div className='mt-1 text-xs text-gray-500'>
                        {record.source_name} · 第 {record.index} / {record.total_episodes || '?'} 集
                      </div>
                      <div className='mt-1 text-xs text-gray-500'>
                        进度 {formatProgress(record)} · {formatDateTime(record.save_time)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </PageLayout>
  );
}
```

- [ ] **Step 2: Add UserMenu entry**

Modify `src/components/UserMenu.tsx`.

Add `Activity` to the lucide import list:

```tsx
import {
  Activity,
  Bell,
  ...
} from 'lucide-react';
```

Add this handler near `handleAdminPanel`:

```tsx
const handleUserActivity = () => {
  setIsOpen(false);
  router.push('/admin/user-activity');
};
```

Add the menu item directly after the existing `管理面板` button:

```tsx
{showAdminPanel && (
  <button
    onClick={handleUserActivity}
    className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
  >
    <Activity className='w-4 h-4 text-gray-500 dark:text-gray-400' />
    <span className='font-medium'>用户动态</span>
  </button>
)}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Manual UI verification**

Run the dev server:

```bash
corepack pnpm dev
```

Expected: server starts and prints a local URL.

Open the app and verify:

- Owner/admin user menu shows `用户动态`.
- Ordinary user menu does not show `用户动态`.
- `/admin/user-activity` shows overview or a clear unsupported/error message.
- Clicking `查看详情` loads the selected user's records.
- Unknown activity displays `从未活跃`.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/user-activity/page.tsx src/components/UserMenu.tsx
git commit -m "feat: add user activity admin page"
```

---

### Task 6: Final Verification

**Files:**
- Read: `docs/superpowers/specs/2026-06-16-user-activity-design.md`
- Verify: all files changed in Tasks 1-5

- [ ] **Step 1: Run focused tests**

Run:

```bash
corepack pnpm test src/app/api/auth/activity/route.test.ts src/lib/admin-user-activity.test.ts src/app/api/admin/user-activity/route.test.ts src/components/ActivityPing.test.tsx --runInBand
```

Expected: all suites pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Check formatting**

Run:

```bash
corepack pnpm exec prettier -c src/lib/refresh-token.ts src/app/api/auth/activity/route.ts src/app/api/auth/activity/route.test.ts src/lib/admin-user-activity.ts src/lib/admin-user-activity.test.ts src/app/api/admin/user-activity/route.ts src/app/api/admin/user-activity/[username]/route.ts src/app/api/admin/user-activity/route.test.ts src/components/ActivityPing.tsx src/components/ActivityPing.test.tsx src/app/layout.tsx src/app/admin/user-activity/page.tsx src/components/UserMenu.tsx
```

Expected: all matched files use Prettier code style.

- [ ] **Step 4: Review diff against spec**

Run:

```bash
git diff --stat HEAD~5..HEAD
git status --short --branch
```

Expected:

- Only planned files are modified.
- Working tree is clean after final commit.
- No `.superpowers/` directory is staged.

- [ ] **Step 5: Push when requested**

```bash
git push origin hy
```

Expected: remote `hy` updates successfully.
