# Registration Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build optional registration email verification and admin approval so the site can run normal, verified, approval-only, or verified-plus-approval registration.

**Architecture:** Add focused registration helper modules for validation, verification codes, and approval services; keep storage-specific persistence behind the existing storage interface; keep UI changes in the existing registration configuration panel, register page, and one new admin approval page. Existing behavior remains unchanged when all new switches are off.

**Tech Stack:** Next.js App Router route handlers, React client pages, Jest and Testing Library, existing storage adapters (`redis-base`, D1, Postgres), existing `EmailService`, existing notification storage.

---

## File Structure

Create:

- `src/lib/registration-access.ts`: pure helpers for email normalization, domain allowlist validation, alias blocking, username/password validation reuse, and public error messages.
- `src/lib/registration-access.test.ts`: unit tests for pure registration validation.
- `src/lib/registration-email-code.ts`: server helper for generating, storing, checking, consuming, and throttling email verification codes through global key-value storage.
- `src/lib/registration-email-code.test.ts`: unit tests for email-code storage behavior with a small fake storage.
- `src/lib/registration-approval.ts`: server service for creating pending requests, listing/filtering requests, approving, rejecting, and notifying owner/admin users.
- `src/lib/registration-approval.test.ts`: unit tests for approval service behavior with fake storage.
- `src/app/api/register/email-code/route.ts`: public route to send registration verification codes.
- `src/app/api/register/email-code/route.test.ts`: route tests for email-code behavior.
- `src/app/api/admin/registration-requests/route.ts`: admin list route.
- `src/app/api/admin/registration-requests/[id]/route.ts`: admin detail/action route.
- `src/app/api/admin/registration-requests/route.test.ts`: route tests for listing.
- `src/app/api/admin/registration-requests/[id]/route.test.ts`: route tests for approve/reject.
- `src/app/admin/registration-requests/page.tsx`: admin approval page.
- `src/app/admin/registration-requests/page.test.tsx`: UI tests for the approval page.
- `migrations/009_registration_requests.sql`: D1/SQLite schema.
- `migrations/postgres/009_registration_requests.sql`: Postgres schema.

Modify:

- `src/lib/admin.types.ts`: add new `SiteConfig` fields.
- `src/lib/types.ts`: add `RegistrationRequest`, notification type, and optional storage methods.
- `src/lib/db.ts`: add `DbManager` wrappers for registration request methods.
- `src/lib/redis-base.db.ts`: implement registration request persistence and hashed-password user creation for Redis-like storage.
- `src/lib/d1.db.ts`: implement registration request persistence for D1/SQLite and reuse `createUserWithHashedPassword`.
- `src/lib/postgres.db.ts`: implement registration request persistence for Postgres and reuse `createUserWithHashedPassword`.
- `src/app/api/register/route.ts`: integrate email verification and approval modes.
- `src/app/api/server-config/route.ts`: expose non-secret registration runtime settings.
- `src/app/api/admin/site/route.ts`: accept and validate new registration settings.
- `src/app/register/page.tsx`: add email/code and optional approval answer UI.
- `src/app/admin/page.tsx`: add registration config controls.
- `src/components/UserMenu.tsx`: add "注册审批" entry near the existing admin entries.

---

### Task 1: Pure Registration Validation Helpers

**Files:**

- Create: `src/lib/registration-access.ts`
- Create: `src/lib/registration-access.test.ts`

- [ ] **Step 1: Write failing tests for email allowlist and alias errors**

Create `src/lib/registration-access.test.ts`:

```ts
import {
  normalizeEmailForRegistration,
  validateRegistrationEmail,
  validateRegistrationUsername,
} from './registration-access';

describe('registration access validation', () => {
  it('rejects email domains outside the allowlist and includes allowed domains', () => {
    const result = validateRegistrationEmail('user@example.com', {
      domainAllowlist: ['gmail.com', 'outlook.com'],
      blockAliases: false,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      '当前邮箱域名不在允许列表中，请使用以下域名邮箱：gmail.com、outlook.com'
    );
  });

  it.each([
    ['name+tag@gmail.com', '邮箱地址不能包含 + 别名'],
    ['.name@gmail.com', '邮箱地址不能以点号开头或结尾'],
    ['name.@gmail.com', '邮箱地址不能以点号开头或结尾'],
    ['na..me@gmail.com', '邮箱地址不能包含连续点号'],
  ])('rejects alias-like email %s', (email, message) => {
    const result = validateRegistrationEmail(email, {
      domainAllowlist: [],
      blockAliases: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe(message);
  });

  it('normalizes email domain and full lookup value', () => {
    expect(normalizeEmailForRegistration(' User@GMAIL.COM ')).toEqual({
      email: 'User@gmail.com',
      normalizedEmail: 'user@gmail.com',
      localPart: 'User',
      domain: 'gmail.com',
    });
  });

  it('keeps existing username validation text', () => {
    expect(validateRegistrationUsername('ab')).toBe(
      '用户名只能包含字母、数字、下划线，长度3-20位'
    );
    expect(validateRegistrationUsername('valid_user')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
corepack pnpm test src/lib/registration-access.test.ts --runInBand
```

Expected: fail because `src/lib/registration-access.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/registration-access.ts`:

```ts
export interface NormalizedRegistrationEmail {
  email: string;
  normalizedEmail: string;
  localPart: string;
  domain: string;
}

export interface RegistrationEmailValidationOptions {
  domainAllowlist?: string[];
  blockAliases?: boolean;
}

export type RegistrationEmailValidationResult =
  | { ok: true; value: NormalizedRegistrationEmail }
  | { ok: false; error: string };

export function validateRegistrationUsername(username: string) {
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return '用户名只能包含字母、数字、下划线，长度3-20位';
  }
  return null;
}

export function validateRegistrationPassword(password: string) {
  if (password.length < 6) return '密码长度至少为6位';
  return null;
}

export function normalizeEmailForRegistration(
  input: string
): NormalizedRegistrationEmail | null {
  const trimmed = input.trim();
  const match = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(trimmed);
  if (!match) return null;

  const localPart = match[1];
  const domain = match[2].toLowerCase();
  const email = `${localPart}@${domain}`;

  return {
    email,
    normalizedEmail: email.toLowerCase(),
    localPart,
    domain,
  };
}

export function validateRegistrationEmail(
  input: string,
  options: RegistrationEmailValidationOptions
): RegistrationEmailValidationResult {
  const normalized = normalizeEmailForRegistration(input);
  if (!normalized) {
    return { ok: false, error: '邮箱格式错误' };
  }

  if (options.blockAliases) {
    if (normalized.localPart.includes('+')) {
      return { ok: false, error: '邮箱地址不能包含 + 别名' };
    }
    if (
      normalized.localPart.startsWith('.') ||
      normalized.localPart.endsWith('.')
    ) {
      return { ok: false, error: '邮箱地址不能以点号开头或结尾' };
    }
    if (normalized.localPart.includes('..')) {
      return { ok: false, error: '邮箱地址不能包含连续点号' };
    }
  }

  const allowlist = (options.domainAllowlist || [])
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(normalized.domain)) {
    return {
      ok: false,
      error: `当前邮箱域名不在允许列表中，请使用以下域名邮箱：${allowlist.join(
        '、'
      )}`,
    };
  }

  return { ok: true, value: normalized };
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
corepack pnpm test src/lib/registration-access.test.ts --runInBand
```

Expected: 1 suite passes.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/registration-access.ts src/lib/registration-access.test.ts
git commit -m "feat: add registration validation helpers"
```

---

### Task 2: Types, Config Shape, and Storage Contracts

**Files:**

- Modify: `src/lib/admin.types.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Write a type-level smoke test by extending existing imports**

Add compile-only usage in `src/lib/registration-access.test.ts`:

```ts
import type { AdminConfig } from './admin.types';
import type { RegistrationRequest, NotificationType } from './types';

it('exposes registration approval config and types', () => {
  const config = {
    RegistrationRequireEmailVerification: true,
    RegistrationEmailDomainAllowlist: ['gmail.com'],
    RegistrationBlockEmailAliases: true,
    RegistrationRequireApproval: true,
    RegistrationApprovalQuestion: '你是谁？',
  } satisfies Partial<AdminConfig['SiteConfig']>;

  const request: RegistrationRequest = {
    id: 'req_1',
    username: 'alice',
    passwordHash: 'hash',
    email: 'alice@gmail.com',
    normalizedEmail: 'alice@gmail.com',
    approvalQuestion: config.RegistrationApprovalQuestion,
    approvalAnswer: '朋友邀请',
    status: 'pending',
    createdAt: 1,
    updatedAt: 1,
  };

  const notificationType: NotificationType = 'registration_request';

  expect(request.status).toBe('pending');
  expect(notificationType).toBe('registration_request');
});
```

- [ ] **Step 2: Run typecheck and verify it fails**

Run:

```bash
corepack pnpm typecheck
```

Expected: fail because `RegistrationRequest` and new config fields are not defined.

- [ ] **Step 3: Add config and request types**

Update `src/lib/admin.types.ts` inside `SiteConfig` near existing registration fields:

```ts
RegistrationRequireEmailVerification?: boolean;
RegistrationEmailDomainAllowlist?: string[];
RegistrationBlockEmailAliases?: boolean;
RegistrationRequireApproval?: boolean;
RegistrationApprovalQuestion?: string;
```

Update `src/lib/types.ts`:

```ts
export interface RegistrationRequest {
  id: string;
  username: string;
  passwordHash: string;
  email?: string;
  normalizedEmail?: string;
  approvalQuestion?: string;
  approvalAnswer?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectReason?: string;
}
```

Add `'registration_request'` to `NotificationType`.

Extend `IStorage` with:

```ts
getAllRegistrationRequests?(
  status?: RegistrationRequest['status']
): Promise<RegistrationRequest[]>;
getRegistrationRequest?(id: string): Promise<RegistrationRequest | null>;
createRegistrationRequest?(request: RegistrationRequest): Promise<void>;
updateRegistrationRequest?(
  id: string,
  updates: Partial<RegistrationRequest>
): Promise<void>;
deleteRegistrationRequest?(id: string): Promise<void>;
findRegistrationRequestByUsername?(
  username: string
): Promise<RegistrationRequest | null>;
findRegistrationRequestByEmail?(
  normalizedEmail: string
): Promise<RegistrationRequest | null>;
findUserByEmail?(normalizedEmail: string): Promise<string | null>;
createUserWithHashedPassword?(
  userName: string,
  passwordHash: string,
  role: 'owner' | 'admin' | 'user',
  createdAt: number,
  tags?: string[],
  oidcSub?: string,
  enabledApis?: string[],
  banned?: boolean,
  email?: string
): Promise<void>;
```

- [ ] **Step 4: Add DbManager wrappers**

Update `src/lib/db.ts` imports:

```ts
import {
  DanmakuFilterConfig,
  Favorite,
  IStorage,
  PlayRecord,
  RegistrationRequest,
  SkipConfig,
} from './types';
```

Add wrappers near user methods:

```ts
async getAllRegistrationRequests(
  status?: RegistrationRequest['status']
): Promise<RegistrationRequest[]> {
  if (typeof (this.storage as any).getAllRegistrationRequests === 'function') {
    return (this.storage as any).getAllRegistrationRequests(status);
  }
  return [];
}

async getRegistrationRequest(
  id: string
): Promise<RegistrationRequest | null> {
  if (typeof (this.storage as any).getRegistrationRequest === 'function') {
    return (this.storage as any).getRegistrationRequest(id);
  }
  return null;
}

async createRegistrationRequest(request: RegistrationRequest): Promise<void> {
  if (typeof (this.storage as any).createRegistrationRequest === 'function') {
    await (this.storage as any).createRegistrationRequest(request);
  } else {
    throw new Error('当前存储类型不支持注册审批');
  }
}

async updateRegistrationRequest(
  id: string,
  updates: Partial<RegistrationRequest>
): Promise<void> {
  if (typeof (this.storage as any).updateRegistrationRequest === 'function') {
    await (this.storage as any).updateRegistrationRequest(id, updates);
  } else {
    throw new Error('当前存储类型不支持注册审批');
  }
}

async findRegistrationRequestByUsername(
  username: string
): Promise<RegistrationRequest | null> {
  if (
    typeof (this.storage as any).findRegistrationRequestByUsername ===
    'function'
  ) {
    return (this.storage as any).findRegistrationRequestByUsername(username);
  }
  return null;
}

async findRegistrationRequestByEmail(
  normalizedEmail: string
): Promise<RegistrationRequest | null> {
  if (
    typeof (this.storage as any).findRegistrationRequestByEmail === 'function'
  ) {
    return (this.storage as any).findRegistrationRequestByEmail(normalizedEmail);
  }
  return null;
}

async findUserByEmail(normalizedEmail: string): Promise<string | null> {
  if (typeof (this.storage as any).findUserByEmail === 'function') {
    return (this.storage as any).findUserByEmail(normalizedEmail);
  }
  return null;
}

async createUserWithHashedPassword(
  userName: string,
  passwordHash: string,
  role: 'owner' | 'admin' | 'user',
  createdAt: number,
  tags?: string[],
  oidcSub?: string,
  enabledApis?: string[],
  banned?: boolean,
  email?: string
): Promise<void> {
  if (typeof (this.storage as any).createUserWithHashedPassword === 'function') {
    await (this.storage as any).createUserWithHashedPassword(
      userName,
      passwordHash,
      role,
      createdAt,
      tags,
      oidcSub,
      enabledApis,
      banned,
      email
    );
    return;
  }
  throw new Error('当前存储类型不支持哈希密码创建用户');
}
```

- [ ] **Step 5: Run typecheck and tests**

Run:

```bash
corepack pnpm test src/lib/registration-access.test.ts --runInBand
corepack pnpm typecheck
```

Expected: registration helper tests pass and typecheck passes.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/admin.types.ts src/lib/types.ts src/lib/db.ts src/lib/registration-access.test.ts
git commit -m "feat: add registration access types"
```

---

### Task 3: Storage Implementations and Migrations

**Files:**

- Create: `migrations/009_registration_requests.sql`
- Create: `migrations/postgres/009_registration_requests.sql`
- Modify: `src/lib/redis-base.db.ts`
- Modify: `src/lib/d1.db.ts`
- Modify: `src/lib/postgres.db.ts`
- Test: `src/lib/registration-approval.test.ts`

- [ ] **Step 1: Write failing storage-facing approval tests**

Create `src/lib/registration-approval.test.ts` with fake storage only:

```ts
import type { RegistrationRequest } from './types';

describe('registration approval storage contract', () => {
  it('keeps only pending username duplicates blocking new requests', () => {
    const requests: RegistrationRequest[] = [
      {
        id: 'old',
        username: 'alice',
        passwordHash: 'hash',
        status: 'rejected',
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 'new',
        username: 'alice',
        passwordHash: 'hash',
        status: 'pending',
        createdAt: 3,
        updatedAt: 3,
      },
    ];

    const pending = requests.find(
      (request) => request.username === 'alice' && request.status === 'pending'
    );

    expect(pending?.id).toBe('new');
  });
});
```

This test starts as a small contract guard; later service tests will use real service functions.

- [ ] **Step 2: Run the focused test**

Run:

```bash
corepack pnpm test src/lib/registration-approval.test.ts --runInBand
```

Expected: pass, proving the test harness is available before storage edits.

- [ ] **Step 3: Add SQL migrations**

Create `migrations/009_registration_requests.sql`:

```sql
CREATE TABLE IF NOT EXISTS registration_requests (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  normalized_email TEXT,
  approval_question TEXT,
  approval_answer TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT,
  reject_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_registration_requests_status_created
  ON registration_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_requests_username
  ON registration_requests(username);

CREATE INDEX IF NOT EXISTS idx_registration_requests_email
  ON registration_requests(normalized_email);
```

Create `migrations/postgres/009_registration_requests.sql` with the same SQL, using `TEXT` and `INTEGER` as in existing Postgres migrations.

- [ ] **Step 4: Implement Redis-like storage methods**

In `src/lib/redis-base.db.ts`, add key helpers near movie request helpers:

```ts
private registrationRequestsKey() {
  return 'registration_requests:all';
}
```

Add methods:

```ts
async getAllRegistrationRequests(
  status?: import('./types').RegistrationRequest['status']
): Promise<import('./types').RegistrationRequest[]> {
  const data = await this.withRetry(() =>
    this.adapter.hGetAll(this.registrationRequestsKey())
  );
  const requests = Object.values(data || {}).map(
    (value) => JSON.parse(value) as import('./types').RegistrationRequest
  );
  return requests
    .filter((request) => !status || request.status === status)
    .sort((a, b) => b.createdAt - a.createdAt);
}

async getRegistrationRequest(
  id: string
): Promise<import('./types').RegistrationRequest | null> {
  const value = await this.withRetry(() =>
    this.adapter.hGet(this.registrationRequestsKey(), id)
  );
  return value
    ? (JSON.parse(value) as import('./types').RegistrationRequest)
    : null;
}

async createRegistrationRequest(
  request: import('./types').RegistrationRequest
): Promise<void> {
  await this.withRetry(() =>
    this.adapter.hSet(
      this.registrationRequestsKey(),
      request.id,
      JSON.stringify(request)
    )
  );
}

async updateRegistrationRequest(
  id: string,
  updates: Partial<import('./types').RegistrationRequest>
): Promise<void> {
  const existing = await this.getRegistrationRequest(id);
  if (!existing) throw new Error('注册申请不存在');
  const updated = { ...existing, ...updates, updatedAt: Date.now() };
  await this.createRegistrationRequest(updated);
}

async deleteRegistrationRequest(id: string): Promise<void> {
  await this.withRetry(() =>
    this.adapter.hDel(this.registrationRequestsKey(), id)
  );
}

async findRegistrationRequestByUsername(
  username: string
): Promise<import('./types').RegistrationRequest | null> {
  const requests = await this.getAllRegistrationRequests('pending');
  return requests.find((request) => request.username === username) || null;
}

async findRegistrationRequestByEmail(
  normalizedEmail: string
): Promise<import('./types').RegistrationRequest | null> {
  const requests = await this.getAllRegistrationRequests('pending');
  return (
    requests.find(
      (request) => request.normalizedEmail === normalizedEmail.toLowerCase()
    ) || null
  );
}

async findUserByEmail(normalizedEmail: string): Promise<string | null> {
  const { users } = await this.getUserListV2(0, 1000, process.env.USERNAME);
  const target = normalizedEmail.toLowerCase();
  for (const user of users) {
    const info = await this.getUserInfoV2(user.username);
    if (info?.email?.toLowerCase() === target) return user.username;
  }
  return null;
}
```

Add optional `email` support to `createUserWithHashedPassword` by extending the existing method or adding it next to `createUserV2`:

```ts
async createUserWithHashedPassword(
  userName: string,
  passwordHash: string,
  role: 'owner' | 'admin' | 'user',
  createdAt: number,
  tags?: string[],
  oidcSub?: string,
  enabledApis?: string[],
  banned?: boolean,
  email?: string
): Promise<void> {
  const userInfo: Record<string, string> = {
    role,
    banned: banned ? 'true' : 'false',
    password: passwordHash,
    created_at: createdAt.toString(),
    playrecord_migrated: 'true',
    favorite_migrated: 'true',
    skip_migrated: 'true',
  };
  if (tags && tags.length > 0) userInfo.tags = JSON.stringify(tags);
  if (enabledApis && enabledApis.length > 0) {
    userInfo.enabledApis = JSON.stringify(enabledApis);
  }
  if (oidcSub) userInfo.oidcSub = oidcSub;
  if (email) userInfo.email = email;

  await this.withRetry(() =>
    this.adapter.hSet(this.userInfoKey(userName), userInfo)
  );
  await this.withRetry(() =>
    this.adapter.zAdd(this.userListKey(), { score: createdAt, value: userName })
  );
  userInfoCache?.delete(userName);
}
```

- [ ] **Step 5: Implement D1 and Postgres methods**

In `src/lib/d1.db.ts`, add row mapping:

```ts
private rowToRegistrationRequest(row: any): import('./types').RegistrationRequest {
  return {
    id: row.id as string,
    username: row.username as string,
    passwordHash: row.password_hash as string,
    email: row.email as string | undefined,
    normalizedEmail: row.normalized_email as string | undefined,
    approvalQuestion: row.approval_question as string | undefined,
    approvalAnswer: row.approval_answer as string | undefined,
    status: row.status as import('./types').RegistrationRequest['status'],
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    reviewedAt: row.reviewed_at as number | undefined,
    reviewedBy: row.reviewed_by as string | undefined,
    rejectReason: row.reject_reason as string | undefined,
  };
}
```

Add D1 methods using `?` placeholders:

```ts
async getAllRegistrationRequests(status?: import('./types').RegistrationRequest['status']) {
  const query = status
    ? this.db.prepare('SELECT * FROM registration_requests WHERE status = ? ORDER BY created_at DESC').bind(status)
    : this.db.prepare('SELECT * FROM registration_requests ORDER BY created_at DESC');
  const result = await query.all();
  return (result.results || []).map((row: any) => this.rowToRegistrationRequest(row));
}
```

Add `getRegistrationRequest`, `createRegistrationRequest`, `updateRegistrationRequest`, `deleteRegistrationRequest`, `findRegistrationRequestByUsername`, `findRegistrationRequestByEmail`, and `findUserByEmail` with D1 placeholders.

In `src/lib/postgres.db.ts`, add equivalent methods using `$1`, `$2`, and incrementing placeholder indexes in update methods.

Update existing D1/Postgres `createUserWithHashedPassword` signatures to accept `email?: string`, insert `email` into the `users` table, and bind it before migration flags:

```sql
INSERT INTO users (
  username, password_hash, role, banned, tags, oidc_sub,
  enabled_apis, email, created_at, playrecord_migrated,
  favorite_migrated, skip_migrated
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1)
```

Use `$1...$9` for Postgres.

- [ ] **Step 6: Run focused typecheck and storage-adjacent tests**

Run:

```bash
corepack pnpm test src/lib/registration-approval.test.ts --runInBand
corepack pnpm typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add migrations/009_registration_requests.sql migrations/postgres/009_registration_requests.sql src/lib/redis-base.db.ts src/lib/d1.db.ts src/lib/postgres.db.ts src/lib/registration-approval.test.ts
git commit -m "feat: add registration request storage"
```

---

### Task 4: Email Code Storage and Sending

**Files:**

- Create: `src/lib/registration-email-code.ts`
- Create: `src/lib/registration-email-code.test.ts`
- Create: `src/app/api/register/email-code/route.ts`
- Create: `src/app/api/register/email-code/route.test.ts`
- Modify: `src/lib/email.templates.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/lib/registration-email-code.test.ts`:

```ts
import {
  consumeRegistrationEmailCode,
  createRegistrationEmailCode,
  verifyRegistrationEmailCode,
} from './registration-email-code';

class FakeGlobalStore {
  values = new Map<string, string>();
  async getGlobalValue(key: string) {
    return this.values.get(key) || null;
  }
  async setGlobalValue(key: string, value: string) {
    this.values.set(key, value);
  }
  async deleteGlobalValue(key: string) {
    this.values.delete(key);
  }
}

describe('registration email codes', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores and verifies a code for username plus email', async () => {
    const store = new FakeGlobalStore();
    const code = await createRegistrationEmailCode(store, {
      username: 'alice',
      normalizedEmail: 'alice@gmail.com',
      code: '123456',
    });

    expect(code).toBe('123456');
    await expect(
      verifyRegistrationEmailCode(store, {
        username: 'alice',
        normalizedEmail: 'alice@gmail.com',
        code: '123456',
      })
    ).resolves.toBe(true);
  });

  it('consumes a code after successful use', async () => {
    const store = new FakeGlobalStore();
    await createRegistrationEmailCode(store, {
      username: 'alice',
      normalizedEmail: 'alice@gmail.com',
      code: '123456',
    });

    await consumeRegistrationEmailCode(store, {
      username: 'alice',
      normalizedEmail: 'alice@gmail.com',
    });

    await expect(
      verifyRegistrationEmailCode(store, {
        username: 'alice',
        normalizedEmail: 'alice@gmail.com',
        code: '123456',
      })
    ).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run helper tests and verify failure**

Run:

```bash
corepack pnpm test src/lib/registration-email-code.test.ts --runInBand
```

Expected: fail because `registration-email-code.ts` does not exist.

- [ ] **Step 3: Implement email-code helper**

Create `src/lib/registration-email-code.ts`:

```ts
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

function keyFor(identity: EmailCodeIdentity) {
  return `registration:email-code:${identity.username}:${identity.normalizedEmail}`;
}

export function generateRegistrationEmailCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
    })
  );
  return code;
}

export async function verifyRegistrationEmailCode(
  store: GlobalCodeStore,
  input: EmailCodeIdentity & { code: string }
) {
  const raw = await store.getGlobalValue(keyFor(input));
  if (!raw) return false;
  const parsed = JSON.parse(raw) as { code: string; expiresAt: number };
  if (parsed.expiresAt < Date.now()) return false;
  return parsed.code === input.code.trim();
}

export async function consumeRegistrationEmailCode(
  store: GlobalCodeStore,
  input: EmailCodeIdentity
) {
  await store.deleteGlobalValue(keyFor(input));
}
```

- [ ] **Step 4: Add verification email template**

Append to `src/lib/email.templates.ts`:

```ts
export function getRegistrationEmailCodeTemplate(
  code: string,
  siteName?: string
) {
  const displayName = siteName || 'MoonTVPlus';
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f5f5f5; padding:20px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:24px;">
        <h2 style="margin-top:0;">${displayName} 注册验证码</h2>
        <p>你的注册验证码是：</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:6px;margin:20px 0;">${code}</div>
        <p style="color:#666;">验证码 10 分钟内有效。如果不是你本人操作，可以忽略这封邮件。</p>
      </div>
    </body>
    </html>
  `;
}
```

- [ ] **Step 5: Write route tests**

Create `src/app/api/register/email-code/route.test.ts` with mocks for `getConfig`, `db`, and `EmailService.send`:

```ts
import { NextRequest } from 'next/server';

import { POST } from './route';

jest.mock('@/lib/config', () => ({
  getConfig: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: {
    checkUserExistV2: jest.fn(),
    findRegistrationRequestByUsername: jest.fn(),
    findRegistrationRequestByEmail: jest.fn(),
    findUserByEmail: jest.fn(),
    getGlobalValue: jest.fn(),
    setGlobalValue: jest.fn(),
    deleteGlobalValue: jest.fn(),
  },
}));
jest.mock('@/lib/email.service', () => ({
  EmailService: { send: jest.fn() },
}));

describe('POST /api/register/email-code', () => {
  it('rejects disallowed domains with allowed-domain text', async () => {
    const { getConfig } = await import('@/lib/config');
    (getConfig as jest.Mock).mockResolvedValue({
      SiteConfig: {
        EnableRegistration: true,
        RegistrationRequireEmailVerification: true,
        RegistrationEmailDomainAllowlist: ['gmail.com'],
      },
      EmailConfig: { enabled: true, provider: 'smtp', smtp: {} },
    });

    const request = new NextRequest('http://test/api/register/email-code', {
      method: 'POST',
      body: JSON.stringify({ username: 'alice', email: 'alice@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe(
      '当前邮箱域名不在允许列表中，请使用以下域名邮箱：gmail.com'
    );
  });
});
```

- [ ] **Step 6: Implement email-code route**

Create `src/app/api/register/email-code/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { EmailService } from '@/lib/email.service';
import { getRegistrationEmailCodeTemplate } from '@/lib/email.templates';
import { createRegistrationEmailCode } from '@/lib/registration-email-code';
import {
  validateRegistrationEmail,
  validateRegistrationUsername,
} from '@/lib/registration-access';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const config = await getConfig();
  const siteConfig = config.SiteConfig;

  if (!siteConfig.EnableRegistration) {
    return NextResponse.json({ error: '注册功能未开启' }, { status: 403 });
  }
  if (!siteConfig.RegistrationRequireEmailVerification) {
    return NextResponse.json({ error: '邮箱验证未开启' }, { status: 400 });
  }
  if (!config.EmailConfig?.enabled) {
    return NextResponse.json(
      { error: '服务器未启用邮件服务，暂时无法发送验证码' },
      { status: 500 }
    );
  }

  const { username, email } = await request.json();
  if (!username || typeof username !== 'string') {
    return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
  }
  const usernameError = validateRegistrationUsername(username);
  if (usernameError) {
    return NextResponse.json({ error: usernameError }, { status: 400 });
  }
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: '邮箱不能为空' }, { status: 400 });
  }

  const emailResult = validateRegistrationEmail(email, {
    domainAllowlist: siteConfig.RegistrationEmailDomainAllowlist || [],
    blockAliases: siteConfig.RegistrationBlockEmailAliases || false,
  });
  if (!emailResult.ok) {
    return NextResponse.json({ error: emailResult.error }, { status: 400 });
  }

  if (await db.checkUserExistV2(username)) {
    return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
  }
  if (await db.findRegistrationRequestByUsername(username)) {
    return NextResponse.json(
      { error: '该用户名已有待审批申请，请等待管理员审核' },
      { status: 409 }
    );
  }

  const code = await createRegistrationEmailCode(db, {
    username,
    normalizedEmail: emailResult.value.normalizedEmail,
  });

  await EmailService.send(config.EmailConfig, {
    to: emailResult.value.email,
    subject: `${siteConfig.SiteName || 'MoonTVPlus'} 注册验证码`,
    html: getRegistrationEmailCodeTemplate(code, siteConfig.SiteName),
  });

  return NextResponse.json({ ok: true, message: '验证码已发送' });
}
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
corepack pnpm test src/lib/registration-email-code.test.ts src/app/api/register/email-code/route.test.ts --runInBand
```

Expected: both suites pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/lib/registration-email-code.ts src/lib/registration-email-code.test.ts src/lib/email.templates.ts src/app/api/register/email-code/route.ts src/app/api/register/email-code/route.test.ts
git commit -m "feat: add registration email codes"
```

---

### Task 5: Registration Approval Service and Register Route

**Files:**

- Create: `src/lib/registration-approval.ts`
- Modify: `src/lib/registration-approval.test.ts`
- Modify: `src/app/api/register/route.ts`
- Create or modify: `src/app/api/register/route.test.ts`
- Modify: `src/app/api/server-config/route.ts`

- [ ] **Step 1: Write approval service tests**

Replace the temporary content in `src/lib/registration-approval.test.ts` with service tests:

```ts
import type { AdminConfig } from './admin.types';
import type { Notification, RegistrationRequest } from './types';
import {
  approveRegistrationRequest,
  createPendingRegistrationRequest,
  rejectRegistrationRequest,
} from './registration-approval';

class FakeApprovalStorage {
  requests = new Map<string, RegistrationRequest>();
  users = new Map<string, { passwordHash: string; email?: string }>();
  notifications: Record<string, Notification[]> = {};

  async checkUserExistV2(username: string) {
    return this.users.has(username);
  }
  async findRegistrationRequestByUsername(username: string) {
    return (
      [...this.requests.values()].find(
        (request) =>
          request.username === username && request.status === 'pending'
      ) || null
    );
  }
  async findRegistrationRequestByEmail(normalizedEmail: string) {
    return (
      [...this.requests.values()].find(
        (request) =>
          request.normalizedEmail === normalizedEmail &&
          request.status === 'pending'
      ) || null
    );
  }
  async createRegistrationRequest(request: RegistrationRequest) {
    this.requests.set(request.id, request);
  }
  async getRegistrationRequest(id: string) {
    return this.requests.get(id) || null;
  }
  async updateRegistrationRequest(
    id: string,
    updates: Partial<RegistrationRequest>
  ) {
    const existing = this.requests.get(id);
    if (!existing) throw new Error('注册申请不存在');
    this.requests.set(id, { ...existing, ...updates });
  }
  async createUserWithHashedPassword(
    username: string,
    passwordHash: string,
    _role: 'user',
    _createdAt: number,
    _tags?: string[],
    _oidcSub?: string,
    _enabledApis?: string[],
    _banned?: boolean,
    email?: string
  ) {
    this.users.set(username, { passwordHash, email });
  }
  async addNotification(username: string, notification: Notification) {
    this.notifications[username] = this.notifications[username] || [];
    this.notifications[username].push(notification);
  }
}

const config = {
  SiteConfig: {
    SiteName: 'HYTV',
    DefaultUserTags: ['friends'],
    RegistrationApprovalQuestion: '你是谁？',
  },
  UserConfig: {
    Users: [
      { username: 'admin1', role: 'admin' },
      { username: 'user1', role: 'user' },
    ],
  },
} as AdminConfig;

describe('registration approval service', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    jest.spyOn(crypto, 'randomUUID').mockReturnValue('req-1');
    process.env.USERNAME = 'owner';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates pending request and notifies owner plus admins', async () => {
    const storage = new FakeApprovalStorage();

    const request = await createPendingRegistrationRequest(storage, config, {
      username: 'alice',
      passwordHash: 'hash',
      email: 'alice@gmail.com',
      normalizedEmail: 'alice@gmail.com',
      approvalAnswer: '朋友邀请',
    });

    expect(request.status).toBe('pending');
    expect(storage.notifications.owner).toHaveLength(1);
    expect(storage.notifications.admin1).toHaveLength(1);
    expect(storage.notifications.user1).toBeUndefined();
  });

  it('approves a request by creating a user and marking status', async () => {
    const storage = new FakeApprovalStorage();
    await storage.createRegistrationRequest({
      id: 'req-1',
      username: 'alice',
      passwordHash: 'hash',
      email: 'alice@gmail.com',
      normalizedEmail: 'alice@gmail.com',
      status: 'pending',
      createdAt: 1,
      updatedAt: 1,
    });

    await approveRegistrationRequest(storage, config, 'req-1', 'owner');

    expect(storage.users.get('alice')).toEqual({
      passwordHash: 'hash',
      email: 'alice@gmail.com',
    });
    expect((await storage.getRegistrationRequest('req-1'))?.status).toBe(
      'approved'
    );
  });

  it('rejects a request without creating a user', async () => {
    const storage = new FakeApprovalStorage();
    await storage.createRegistrationRequest({
      id: 'req-1',
      username: 'alice',
      passwordHash: 'hash',
      status: 'pending',
      createdAt: 1,
      updatedAt: 1,
    });

    await rejectRegistrationRequest(storage, 'req-1', 'admin1', '不是朋友');

    expect(storage.users.has('alice')).toBe(false);
    expect((await storage.getRegistrationRequest('req-1'))?.status).toBe(
      'rejected'
    );
  });
});
```

- [ ] **Step 2: Run service tests and verify failure**

Run:

```bash
corepack pnpm test src/lib/registration-approval.test.ts --runInBand
```

Expected: fail because `registration-approval.ts` does not exist.

- [ ] **Step 3: Implement approval service**

Create `src/lib/registration-approval.ts`:

```ts
import type { AdminConfig } from './admin.types';
import type { Notification, RegistrationRequest } from './types';

interface ApprovalStorage {
  checkUserExistV2(username: string): Promise<boolean>;
  findRegistrationRequestByUsername(
    username: string
  ): Promise<RegistrationRequest | null>;
  findRegistrationRequestByEmail(
    email: string
  ): Promise<RegistrationRequest | null>;
  createRegistrationRequest(request: RegistrationRequest): Promise<void>;
  getRegistrationRequest(id: string): Promise<RegistrationRequest | null>;
  updateRegistrationRequest(
    id: string,
    updates: Partial<RegistrationRequest>
  ): Promise<void>;
  createUserWithHashedPassword(
    username: string,
    passwordHash: string,
    role: 'user',
    createdAt: number,
    tags?: string[],
    oidcSub?: string,
    enabledApis?: string[],
    banned?: boolean,
    email?: string
  ): Promise<void>;
  addNotification(username: string, notification: Notification): Promise<void>;
}

export async function hashRegistrationPassword(password: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function adminRecipients(config: AdminConfig) {
  const recipients = new Set<string>();
  if (process.env.USERNAME) recipients.add(process.env.USERNAME);
  for (const user of config.UserConfig.Users || []) {
    if (user.role === 'admin' || user.role === 'owner') {
      recipients.add(user.username);
    }
  }
  return [...recipients];
}

export async function createPendingRegistrationRequest(
  storage: ApprovalStorage,
  config: AdminConfig,
  input: {
    username: string;
    passwordHash: string;
    email?: string;
    normalizedEmail?: string;
    approvalAnswer?: string;
  }
) {
  if (await storage.checkUserExistV2(input.username)) {
    throw new Error('用户名已存在');
  }
  if (await storage.findRegistrationRequestByUsername(input.username)) {
    throw new Error('该用户名已有待审批申请，请等待管理员审核');
  }
  if (
    input.normalizedEmail &&
    (await storage.findRegistrationRequestByEmail(input.normalizedEmail))
  ) {
    throw new Error('该邮箱已有待审批申请，请等待管理员审核');
  }

  const now = Date.now();
  const request: RegistrationRequest = {
    id: crypto.randomUUID(),
    username: input.username,
    passwordHash: input.passwordHash,
    email: input.email,
    normalizedEmail: input.normalizedEmail,
    approvalQuestion: config.SiteConfig.RegistrationApprovalQuestion || '',
    approvalAnswer: input.approvalAnswer || '',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await storage.createRegistrationRequest(request);

  for (const recipient of adminRecipients(config)) {
    await storage.addNotification(recipient, {
      id: `registration_request_${request.id}_${now}`,
      type: 'registration_request',
      title: '新的注册审批申请',
      message: `${input.username} 提交了注册申请`,
      timestamp: now,
      read: false,
      metadata: {
        requestId: request.id,
        username: input.username,
        email: input.email,
      },
    });
  }

  return request;
}

export async function approveRegistrationRequest(
  storage: ApprovalStorage,
  config: AdminConfig,
  requestId: string,
  reviewer: string
) {
  const request = await storage.getRegistrationRequest(requestId);
  if (!request) throw new Error('注册申请不存在');
  if (request.status !== 'pending') throw new Error('该申请已处理');
  if (await storage.checkUserExistV2(request.username)) {
    throw new Error('用户名已存在');
  }

  await storage.createUserWithHashedPassword(
    request.username,
    request.passwordHash,
    'user',
    Date.now(),
    config.SiteConfig.DefaultUserTags,
    undefined,
    undefined,
    false,
    request.email
  );

  await storage.updateRegistrationRequest(requestId, {
    status: 'approved',
    reviewedAt: Date.now(),
    reviewedBy: reviewer,
  });
}

export async function rejectRegistrationRequest(
  storage: ApprovalStorage,
  requestId: string,
  reviewer: string,
  reason?: string
) {
  const request = await storage.getRegistrationRequest(requestId);
  if (!request) throw new Error('注册申请不存在');
  if (request.status !== 'pending') throw new Error('该申请已处理');

  await storage.updateRegistrationRequest(requestId, {
    status: 'rejected',
    reviewedAt: Date.now(),
    reviewedBy: reviewer,
    rejectReason: reason || '',
  });
}
```

- [ ] **Step 4: Write or update register route tests**

Create `src/app/api/register/route.test.ts` if absent. Cover:

```ts
it('creates a pending approval request instead of user when approval is enabled', async () => {
  // mock getConfig SiteConfig.EnableRegistration=true and RegistrationRequireApproval=true
  // mock db.checkUserExistV2=false
  // mock db.createRegistrationRequest success
  // call POST with username/password/approvalAnswer
  // expect response json pendingApproval true
  // expect db.createUserV2 not called
});
```

Also cover the domain allowlist message when email verification is enabled.

- [ ] **Step 5: Integrate register route**

In `src/app/api/register/route.ts`:

- Import helpers from `registration-access`, `registration-email-code`, and `registration-approval`.
- Parse `email`, `emailCode`, and `approvalAnswer`.
- Validate email when `RegistrationRequireEmailVerification` is enabled.
- Check email code through `verifyRegistrationEmailCode`.
- If approval is enabled, hash password with `hashRegistrationPassword`, call `createPendingRegistrationRequest`, consume email code when present, and return pending response.
- If approval is disabled, keep `db.createUserV2(username, password, 'user', defaultTags)` and set email after creation when available through `db.setUserEmail` if available.

- [ ] **Step 6: Expose runtime config**

Update `src/app/api/server-config/route.ts` result:

```ts
RegistrationRequireEmailVerification:
  config.SiteConfig.RegistrationRequireEmailVerification || false,
RegistrationEmailDomainAllowlist:
  config.SiteConfig.RegistrationEmailDomainAllowlist || [],
RegistrationBlockEmailAliases:
  config.SiteConfig.RegistrationBlockEmailAliases || false,
RegistrationRequireApproval:
  config.SiteConfig.RegistrationRequireApproval || false,
RegistrationApprovalQuestion:
  config.SiteConfig.RegistrationApprovalQuestion || '',
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
corepack pnpm test src/lib/registration-approval.test.ts src/app/api/register/route.test.ts --runInBand
corepack pnpm typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/lib/registration-approval.ts src/lib/registration-approval.test.ts src/app/api/register/route.ts src/app/api/register/route.test.ts src/app/api/server-config/route.ts
git commit -m "feat: support approval registration flow"
```

---

### Task 6: Admin Registration Request APIs

**Files:**

- Create: `src/app/api/admin/registration-requests/route.ts`
- Create: `src/app/api/admin/registration-requests/[id]/route.ts`
- Create: `src/app/api/admin/registration-requests/route.test.ts`
- Create: `src/app/api/admin/registration-requests/[id]/route.test.ts`

- [ ] **Step 1: Write list route tests**

Create `src/app/api/admin/registration-requests/route.test.ts`:

```ts
import { NextRequest } from 'next/server';

import { GET } from './route';

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromCookie: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: {
    getUserInfoV2: jest.fn(),
    getAllRegistrationRequests: jest.fn(),
  },
}));

describe('GET /api/admin/registration-requests', () => {
  it('returns paginated pending requests for admins', async () => {
    const { getAuthInfoFromCookie } = await import('@/lib/auth');
    const { db } = await import('@/lib/db');
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'admin' });
    (db.getUserInfoV2 as jest.Mock).mockResolvedValue({
      role: 'admin',
      banned: false,
    });
    (db.getAllRegistrationRequests as jest.Mock).mockResolvedValue([
      {
        id: 'req-1',
        username: 'alice',
        email: 'alice@gmail.com',
        status: 'pending',
        createdAt: 3,
        updatedAt: 3,
      },
    ]);

    const response = await GET(
      new NextRequest(
        'http://test/api/admin/registration-requests?status=pending&page=1&limit=20'
      )
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.requests).toHaveLength(1);
    expect(data.total).toBe(1);
  });
});
```

- [ ] **Step 2: Write action route tests**

Create `src/app/api/admin/registration-requests/[id]/route.test.ts`:

```ts
import { NextRequest } from 'next/server';

import { POST } from './route';

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromCookie: jest.fn(),
}));
jest.mock('@/lib/config', () => ({
  getConfig: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: {
    getUserInfoV2: jest.fn(),
  },
}));
jest.mock('@/lib/registration-approval', () => ({
  approveRegistrationRequest: jest.fn(),
  rejectRegistrationRequest: jest.fn(),
}));

describe('POST /api/admin/registration-requests/[id]', () => {
  it('approves request for admin users', async () => {
    const { getAuthInfoFromCookie } = await import('@/lib/auth');
    const { getConfig } = await import('@/lib/config');
    const { db } = await import('@/lib/db');
    const { approveRegistrationRequest } = await import(
      '@/lib/registration-approval'
    );
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'admin' });
    (db.getUserInfoV2 as jest.Mock).mockResolvedValue({
      role: 'admin',
      banned: false,
    });
    (getConfig as jest.Mock).mockResolvedValue({
      SiteConfig: {},
      UserConfig: { Users: [] },
    });

    const response = await POST(
      new NextRequest('http://test/api/admin/registration-requests/req-1', {
        method: 'POST',
        body: JSON.stringify({ action: 'approve' }),
      }),
      { params: { id: 'req-1' } }
    );

    expect(response.status).toBe(200);
    expect(approveRegistrationRequest).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
corepack pnpm test src/app/api/admin/registration-requests/route.test.ts src/app/api/admin/registration-requests/[id]/route.test.ts --runInBand
```

Expected: fail because routes do not exist.

- [ ] **Step 4: Implement admin list route**

Create `src/app/api/admin/registration-requests/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import type { RegistrationRequest } from '@/lib/types';

export const runtime = 'nodejs';

async function canManageRequests(username: string) {
  if (username === process.env.USERNAME) return true;
  const info = await db.getUserInfoV2(username);
  return !!info && !info.banned && info.role === 'admin';
}

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await canManageRequests(authInfo.username))) {
    return NextResponse.json({ error: '权限不足' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as
    | RegistrationRequest['status']
    | null;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(
    50,
    Math.max(1, parseInt(searchParams.get('limit') || '20', 10))
  );
  const search = (searchParams.get('search') || '').trim().toLowerCase();

  let requests = await db.getAllRegistrationRequests(status || undefined);
  if (search) {
    requests = requests.filter(
      (item) =>
        item.username.toLowerCase().includes(search) ||
        item.email?.toLowerCase().includes(search)
    );
  }

  const total = requests.length;
  const offset = (page - 1) * limit;

  return NextResponse.json({
    requests: requests
      .slice(offset, offset + limit)
      .map(({ passwordHash, ...item }) => item),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
```

- [ ] **Step 5: Implement admin action route**

Create `src/app/api/admin/registration-requests/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import {
  approveRegistrationRequest,
  rejectRegistrationRequest,
} from '@/lib/registration-approval';

export const runtime = 'nodejs';

async function canManageRequests(username: string) {
  if (username === process.env.USERNAME) return true;
  const info = await db.getUserInfoV2(username);
  return !!info && !info.banned && info.role === 'admin';
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await canManageRequests(authInfo.username))) {
    return NextResponse.json({ error: '权限不足' }, { status: 403 });
  }

  const registrationRequest = await db.getRegistrationRequest(params.id);
  if (!registrationRequest) {
    return NextResponse.json({ error: '注册申请不存在' }, { status: 404 });
  }
  const { passwordHash, ...safeRequest } = registrationRequest;
  return NextResponse.json({ request: safeRequest });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await canManageRequests(authInfo.username))) {
    return NextResponse.json({ error: '权限不足' }, { status: 403 });
  }

  const body = await request.json();
  const config = await getConfig();

  try {
    if (body.action === 'approve') {
      await approveRegistrationRequest(
        db,
        config,
        params.id,
        authInfo.username
      );
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'reject') {
      await rejectRegistrationRequest(
        db,
        params.id,
        authInfo.username,
        typeof body.reason === 'string' ? body.reason : ''
      );
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: '无效的操作' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '操作失败' },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
corepack pnpm test src/app/api/admin/registration-requests/route.test.ts src/app/api/admin/registration-requests/[id]/route.test.ts --runInBand
corepack pnpm typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/app/api/admin/registration-requests
git commit -m "feat: add registration approval admin APIs"
```

---

### Task 7: Admin Config UI and Register Page UI

**Files:**

- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/register/page.tsx`
- Create or modify: `src/app/register/page.test.tsx`

- [ ] **Step 1: Write register page UI tests**

Create `src/app/register/page.test.tsx`:

```ts
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import RegisterPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn() }),
}));
jest.mock('@/components/SiteProvider', () => ({
  useSite: () => ({ siteName: 'HYTV' }),
}));
jest.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div />,
}));
jest.mock('@/lib/version_check', () => ({
  checkForUpdates: jest.fn(),
  UpdateStatus: { FETCH_FAILED: 'FETCH_FAILED' },
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    (window as any).RUNTIME_CONFIG = {
      ENABLE_REGISTRATION: true,
      REGISTRATION_REQUIRE_EMAIL_VERIFICATION: true,
      REGISTRATION_REQUIRE_APPROVAL: true,
      REGISTRATION_APPROVAL_QUESTION: '你是谁，从哪里知道本站的？',
    };
    window.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/register/email-code')) {
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          pendingApproval: true,
          message: '申请已提交，请等待管理员审核',
        }),
      } as Response;
    });
  });

  it('shows email code and approval answer fields when enabled', async () => {
    render(<RegisterPage />);

    expect(await screen.findByPlaceholderText('输入邮箱')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('输入邮箱验证码')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('你是谁，从哪里知道本站的？')
    ).toBeInTheDocument();
  });

  it('shows pending approval message after submit', async () => {
    render(<RegisterPage />);

    fireEvent.change(await screen.findByPlaceholderText('输入用户名'), {
      target: { value: 'alice' },
    });
    fireEvent.change(screen.getByPlaceholderText('输入密码（至少6位）'), {
      target: { value: 'password1' },
    });
    fireEvent.change(screen.getByPlaceholderText('再次输入密码'), {
      target: { value: 'password1' },
    });
    fireEvent.change(screen.getByPlaceholderText('输入邮箱'), {
      target: { value: 'alice@gmail.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('输入邮箱验证码'), {
      target: { value: '123456' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('你是谁，从哪里知道本站的？'),
      { target: { value: '朋友邀请' } }
    );

    fireEvent.click(screen.getByRole('button', { name: '验证并提交申请' }));

    expect(
      await screen.findByText('申请已提交，请等待管理员审核')
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run UI tests and verify failure**

Run:

```bash
corepack pnpm test src/app/register/page.test.tsx --runInBand
```

Expected: fail because the page has no new fields.

- [ ] **Step 3: Update register page runtime config**

In `src/app/register/page.tsx`, add state:

```ts
const [email, setEmail] = useState('');
const [emailCode, setEmailCode] = useState('');
const [approvalAnswer, setApprovalAnswer] = useState('');
const [pendingMessage, setPendingMessage] = useState('');
const [sendingCode, setSendingCode] = useState(false);
```

Add runtime config fields:

```ts
RegistrationRequireEmailVerification:
  runtimeConfig?.REGISTRATION_REQUIRE_EMAIL_VERIFICATION || false,
RegistrationRequireApproval:
  runtimeConfig?.REGISTRATION_REQUIRE_APPROVAL || false,
RegistrationApprovalQuestion:
  runtimeConfig?.REGISTRATION_APPROVAL_QUESTION || '',
```

Add `sendEmailCode` that calls `/api/register/email-code`.

Add form fields with placeholders exactly:

- `输入邮箱`
- `输入邮箱验证码`
- approval question text as textarea placeholder.

Update submit body:

```ts
email: siteConfig?.RegistrationRequireEmailVerification ? email.trim() : undefined,
emailCode: siteConfig?.RegistrationRequireEmailVerification ? emailCode.trim() : undefined,
approvalAnswer: siteConfig?.RegistrationRequireApproval ? approvalAnswer.trim() : undefined,
```

If response JSON has `pendingApproval`, set `pendingMessage` instead of redirecting.

Button text:

```ts
const submitText = siteConfig?.RegistrationRequireEmailVerification
  ? siteConfig?.RegistrationRequireApproval
    ? '验证并提交申请'
    : '验证并注册'
  : siteConfig?.RegistrationRequireApproval
  ? '提交申请'
  : '注册';
```

- [ ] **Step 4: Update admin registration config UI**

In `src/app/admin/page.tsx` `RegistrationConfigComponent` state, add:

```ts
RegistrationRequireEmailVerification: boolean;
RegistrationEmailDomainAllowlist: string[];
RegistrationBlockEmailAliases: boolean;
RegistrationRequireApproval: boolean;
RegistrationApprovalQuestion: string;
```

Initialize from `config.SiteConfig`.

Add controls under "基础注册设置" or a new `details` block titled `注册准入控制`:

- Toggle: `要求邮箱验证`
- Textarea: `邮箱域名白名单`
- Toggle: `禁止邮箱别名`
- Toggle: `开启注册审批`
- Textarea: `审批问题`

Store allowlist as array on save:

```ts
RegistrationEmailDomainAllowlist:
  registrationSettings.RegistrationEmailDomainAllowlist.map((item) =>
    item.trim().toLowerCase()
  ).filter(Boolean),
```

Show helper copy:

```text
白名单为空时允许任意邮箱域名；如果不匹配，注册页会显示允许的域名。
```

- [ ] **Step 5: Update admin site route validation**

In `src/app/api/admin/site/route.ts`, destructure the new fields, validate their types, and preserve them in `adminConfig.SiteConfig`.

Validation:

```ts
(RegistrationRequireEmailVerification !== undefined &&
  typeof RegistrationRequireEmailVerification !== 'boolean') ||
  (RegistrationEmailDomainAllowlist !== undefined &&
    !Array.isArray(RegistrationEmailDomainAllowlist)) ||
  (RegistrationBlockEmailAliases !== undefined &&
    typeof RegistrationBlockEmailAliases !== 'boolean') ||
  (RegistrationRequireApproval !== undefined &&
    typeof RegistrationRequireApproval !== 'boolean') ||
  (RegistrationApprovalQuestion !== undefined &&
    typeof RegistrationApprovalQuestion !== 'string');
```

- [ ] **Step 6: Run focused UI and route tests**

Run:

```bash
corepack pnpm test src/app/register/page.test.tsx --runInBand
corepack pnpm typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/app/register/page.tsx src/app/register/page.test.tsx src/app/admin/page.tsx src/app/api/admin/site/route.ts
git commit -m "feat: add registration access controls UI"
```

---

### Task 8: Admin Approval Page and Menu Entry

**Files:**

- Create: `src/app/admin/registration-requests/page.tsx`
- Create: `src/app/admin/registration-requests/page.test.tsx`
- Modify: `src/components/UserMenu.tsx`

- [ ] **Step 1: Write admin page UI test**

Create `src/app/admin/registration-requests/page.test.tsx`:

```ts
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import RegistrationRequestsPage from './page';

jest.mock('@/components/PageLayout', () => {
  return function MockPageLayout({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  };
});

describe('RegistrationRequestsPage', () => {
  beforeEach(() => {
    window.fetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/req-1') && init?.method === 'POST') {
          return { ok: true, json: async () => ({ ok: true }) } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            requests: [
              {
                id: 'req-1',
                username: 'alice',
                email: 'alice@gmail.com',
                approvalQuestion: '你是谁？',
                approvalAnswer: '朋友邀请',
                status: 'pending',
                createdAt: 1_800_000_000_000,
                updatedAt: 1_800_000_000_000,
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
            totalPages: 1,
          }),
        } as Response;
      }
    );
  });

  it('lists pending requests and approves one', async () => {
    render(<RegistrationRequestsPage />);

    expect(await screen.findByText('注册审批')).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('朋友邀请')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '批准' }));

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        '/api/admin/registration-requests/req-1',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
corepack pnpm test src/app/admin/registration-requests/page.test.tsx --runInBand
```

Expected: fail because the page does not exist.

- [ ] **Step 3: Implement admin approval page**

Create `src/app/admin/registration-requests/page.tsx`:

```tsx
'use client';

import { Check, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import PageLayout from '@/components/PageLayout';

type RequestStatus = 'pending' | 'approved' | 'rejected';

interface RegistrationRequestRow {
  id: string;
  username: string;
  email?: string;
  approvalQuestion?: string;
  approvalAnswer?: string;
  status: RequestStatus;
  createdAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectReason?: string;
}

export default function RegistrationRequestsPage() {
  const [status, setStatus] = useState<RequestStatus>('pending');
  const [search, setSearch] = useState('');
  const [requests, setRequests] = useState<RegistrationRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ status, page: '1', limit: '20' });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(
        `/api/admin/registration-requests?${params.toString()}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '加载注册申请失败');
      setRequests(data.requests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载注册申请失败');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    const response = await fetch(`/api/admin/registration-requests/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || '操作失败');
      return;
    }
    await loadRequests();
  };

  return (
    <PageLayout activePath='/admin'>
      <div className='mx-auto max-w-7xl px-4 py-8 md:px-8'>
        <div className='mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
              注册审批
            </h1>
            <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
              查看并处理用户注册申请
            </p>
          </div>
          <div className='flex gap-2'>
            <label className='relative'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400' />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder='搜索用户或邮箱'
                className='h-10 rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900'
              />
            </label>
            <button
              type='button'
              onClick={() => loadRequests()}
              className='inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white'
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
              刷新
            </button>
          </div>
        </div>

        <div className='mb-4 flex gap-2'>
          {(['pending', 'approved', 'rejected'] as RequestStatus[]).map(
            (item) => (
              <button
                key={item}
                type='button'
                onClick={() => setStatus(item)}
                className={`rounded-md px-3 py-1 text-sm ${
                  status === item
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                }`}
              >
                {item === 'pending'
                  ? '待审批'
                  : item === 'approved'
                  ? '已批准'
                  : '已拒绝'}
              </button>
            )
          )}
        </div>

        {error && (
          <div className='mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>
            {error}
          </div>
        )}

        <section className='overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'>
          <div className='overflow-x-auto'>
            <table className='min-w-full text-sm'>
              <thead className='bg-gray-50 text-left text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400'>
                <tr>
                  <th className='px-4 py-3'>用户</th>
                  <th className='px-4 py-3'>邮箱</th>
                  <th className='px-4 py-3'>答案</th>
                  <th className='px-4 py-3'>提交时间</th>
                  <th className='px-4 py-3'>状态</th>
                  <th className='px-4 py-3'>操作</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr
                    key={request.id}
                    className='border-t border-gray-100 dark:border-gray-800'
                  >
                    <td className='px-4 py-3 font-medium'>
                      {request.username}
                    </td>
                    <td className='px-4 py-3'>{request.email || '-'}</td>
                    <td className='max-w-sm truncate px-4 py-3'>
                      {request.approvalAnswer || '-'}
                    </td>
                    <td className='px-4 py-3'>
                      {new Date(request.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className='px-4 py-3'>
                      {request.status === 'pending'
                        ? '待审批'
                        : request.status === 'approved'
                        ? '已批准'
                        : '已拒绝'}
                    </td>
                    <td className='px-4 py-3'>
                      {request.status === 'pending' ? (
                        <div className='flex gap-2'>
                          <button
                            type='button'
                            onClick={() => handleAction(request.id, 'approve')}
                            className='inline-flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-xs text-white'
                          >
                            <Check className='h-3 w-3' />
                            批准
                          </button>
                          <button
                            type='button'
                            onClick={() => handleAction(request.id, 'reject')}
                            className='inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs text-white'
                          >
                            <X className='h-3 w-3' />
                            拒绝
                          </button>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
```

- [ ] **Step 4: Add user menu entry**

In `src/components/UserMenu.tsx`, find the admin navigation section that routes to `/admin/user-activity`. Add a sibling button that routes to:

```ts
router.push('/admin/registration-requests');
```

Use visible text:

```text
注册审批
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
corepack pnpm test src/app/admin/registration-requests/page.test.tsx --runInBand
corepack pnpm typecheck
```

Expected: page test and typecheck pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/app/admin/registration-requests src/components/UserMenu.tsx
git commit -m "feat: add registration approval admin page"
```

---

### Task 9: Full Verification, Formatting, Review, and Push

**Files:**

- All changed files from tasks 1-8.

- [ ] **Step 1: Run focused registration tests**

Run:

```bash
corepack pnpm test src/lib/registration-access.test.ts src/lib/registration-email-code.test.ts src/lib/registration-approval.test.ts src/app/api/register/email-code/route.test.ts src/app/api/register/route.test.ts src/app/api/admin/registration-requests/route.test.ts src/app/api/admin/registration-requests/[id]/route.test.ts src/app/register/page.test.tsx src/app/admin/registration-requests/page.test.tsx --runInBand
```

Expected: all listed suites pass.

- [ ] **Step 2: Run related existing tests**

Run:

```bash
corepack pnpm test src/app/api/admin/ai/route.test.ts src/app/api/auth/activity/route.test.ts src/components/TokenRefreshManager.test.tsx --runInBand
```

Expected: existing adjacent suites pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
corepack pnpm typecheck
```

Expected: `tsc --noEmit --incremental false` exits 0.

- [ ] **Step 4: Run Prettier check on changed files**

Run:

```bash
.\node_modules\.bin\prettier.cmd -c src/lib/registration-access.ts src/lib/registration-access.test.ts src/lib/registration-email-code.ts src/lib/registration-email-code.test.ts src/lib/registration-approval.ts src/lib/registration-approval.test.ts src/app/api/register/route.ts src/app/api/register/email-code/route.ts src/app/api/register/email-code/route.test.ts src/app/api/admin/registration-requests/route.ts src/app/api/admin/registration-requests/route.test.ts src/app/api/admin/registration-requests/[id]/route.ts src/app/api/admin/registration-requests/[id]/route.test.ts src/app/register/page.tsx src/app/register/page.test.tsx src/app/admin/registration-requests/page.tsx src/app/admin/registration-requests/page.test.tsx src/app/admin/page.tsx src/app/api/admin/site/route.ts src/app/api/server-config/route.ts src/lib/admin.types.ts src/lib/types.ts src/lib/db.ts src/lib/redis-base.db.ts src/lib/d1.db.ts src/lib/postgres.db.ts src/lib/email.templates.ts src/components/UserMenu.tsx
```

Expected: all matched files use Prettier code style.

- [ ] **Step 5: If Prettier fails, format only changed files**

Run:

```bash
.\node_modules\.bin\prettier.cmd -w src/lib/registration-access.ts src/lib/registration-access.test.ts src/lib/registration-email-code.ts src/lib/registration-email-code.test.ts src/lib/registration-approval.ts src/lib/registration-approval.test.ts src/app/api/register/route.ts src/app/api/register/email-code/route.ts src/app/api/register/email-code/route.test.ts src/app/api/admin/registration-requests/route.ts src/app/api/admin/registration-requests/route.test.ts src/app/api/admin/registration-requests/[id]/route.ts src/app/api/admin/registration-requests/[id]/route.test.ts src/app/register/page.tsx src/app/register/page.test.tsx src/app/admin/registration-requests/page.tsx src/app/admin/registration-requests/page.test.tsx src/app/admin/page.tsx src/app/api/admin/site/route.ts src/app/api/server-config/route.ts src/lib/admin.types.ts src/lib/types.ts src/lib/db.ts src/lib/redis-base.db.ts src/lib/d1.db.ts src/lib/postgres.db.ts src/lib/email.templates.ts src/components/UserMenu.tsx
```

Then rerun Step 1, Step 3, and Step 4.

- [ ] **Step 6: Inspect diff**

Run:

```bash
git status --short --branch
git diff --stat
git diff -- src/lib/registration-access.ts src/app/api/register/route.ts src/app/register/page.tsx src/app/admin/registration-requests/page.tsx
```

Expected: changes match this plan, no unrelated files are modified.

- [ ] **Step 7: Request code review**

Use `superpowers:requesting-code-review` after all verification passes. Ask the reviewer to focus on:

- Password hash handling for pending approval requests.
- Email code lifecycle and no secret leakage.
- Approval permissions.
- Existing registration behavior when new switches are disabled.
- Cloudflare/D1 and Postgres SQL compatibility.

- [ ] **Step 8: Address review findings**

For each valid finding:

- Write or update a failing test first.
- Run the focused test and verify failure.
- Implement the fix.
- Run the focused test and verify pass.
- Rerun Step 1, Step 3, and Step 4.

- [ ] **Step 9: Push**

After review is clean and verification passes, run:

```bash
git push origin hy
```

Expected: local `hy` pushes to GitHub successfully.
