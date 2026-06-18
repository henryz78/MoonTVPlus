# Registration Access Control Design

## Summary

Add optional registration access controls to MoonTVPlus:

1. Normal registration: username and password create an account immediately.
2. Email verification registration: username, password, email, and email code create an account immediately.
3. Approval registration: username, password, and optional approval answer create a pending request. An admin approves before the account is created.
4. Email verification plus approval registration: email code must pass first, then the request enters admin approval.

The implementation should preserve the existing registration behavior when all new switches are disabled.

## Goals

- Let admins enable registration approval without changing existing users.
- Let admins require email verification during registration.
- Let admins optionally ask one approval question.
- Let admins restrict registration emails by domain allowlist.
- Let admins block simple email alias patterns such as `+`, leading dot, trailing dot, and consecutive dots.
- Notify the site owner and all admins when a new approval request is submitted.
- Keep the feature aligned with the existing `SiteConfig`, `EmailConfig`, notification, and storage patterns.

## Non-Goals

- No invite link system.
- No multi-question approval form in the first version.
- No complex provider-specific email normalization such as removing dots only for Gmail.
- No account is created before approval when approval mode is enabled.
- No localStorage support for registration approval or email verification, matching the current registration limitation.

## Existing Context

- `src/app/api/register/route.ts` currently creates users directly with `db.createUserV2`.
- Registration is controlled by `SiteConfig.EnableRegistration`.
- Existing registration security options include invite code and Cloudflare Turnstile.
- Admin registration settings live in `RegistrationConfigComponent` inside `src/app/admin/page.tsx`.
- SMTP and Resend already exist in `EmailConfig` and `EmailService`.
- User-facing runtime registration config is exposed by `src/app/api/server-config/route.ts`.
- Notifications already exist through `addNotification`, `getNotifications`, unread counts, and Web Push dispatch from storage implementations.

## Configuration

Extend `SiteConfig` with:

```ts
RegistrationRequireEmailVerification?: boolean;
RegistrationEmailDomainAllowlist?: string[];
RegistrationBlockEmailAliases?: boolean;
RegistrationRequireApproval?: boolean;
RegistrationApprovalQuestion?: string;
```

Defaults:

- `RegistrationRequireEmailVerification`: `false`
- `RegistrationEmailDomainAllowlist`: `[]`
- `RegistrationBlockEmailAliases`: `false`
- `RegistrationRequireApproval`: `false`
- `RegistrationApprovalQuestion`: `''`

Admin UI placement:

- Add these controls under the existing "注册配置" panel.
- Keep email verification and approval settings visually separate from invite code and Turnstile.
- Show a clear hint that email verification depends on enabled and valid `EmailConfig`.

Email domain allowlist UX:

- Input format: one domain per line, such as `gmail.com`.
- Empty list means all domains are allowed.
- The validation message must be explicit. If `example.com` is not allowed and the allowlist is `gmail.com`, `outlook.com`, show a message like:

```text
当前邮箱域名不在允许列表中，请使用以下域名邮箱：gmail.com、outlook.com
```

Email alias blocking UX:

- When enabled, reject email local parts containing `+`, starting with `.`, ending with `.`, or containing `..`.
- Error examples:

```text
邮箱地址不能包含 + 别名
邮箱地址不能以点号开头或结尾
邮箱地址不能包含连续点号
```

This intentionally avoids complex provider-specific normalization. The feature is a lightweight prevention layer, not an anti-abuse identity system.

## Data Model

Add a registration request type:

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

Password handling:

- Do not store plaintext passwords in pending requests.
- Reuse the same password hashing approach as `createUserV2`.
- Approval should create the final user from the stored hash or through a storage helper that can safely create from a pre-hashed password.
- If the existing user creation path cannot accept a hash cleanly, add a focused helper instead of weakening password handling.

Email handling:

- Store `email` as submitted after trimming/lowercasing the domain.
- Store `normalizedEmail` as lowercase full email for simple duplicate checks.
- With the chosen lightweight mode, do not remove Gmail dots or strip plus aliases because plus aliases are rejected outright when alias blocking is enabled.

## Storage Interface

Extend `IStorage` with optional methods:

```ts
getAllRegistrationRequests?(status?: RegistrationRequest['status']): Promise<RegistrationRequest[]>;
getRegistrationRequest?(id: string): Promise<RegistrationRequest | null>;
createRegistrationRequest?(request: RegistrationRequest): Promise<void>;
updateRegistrationRequest?(id: string, updates: Partial<RegistrationRequest>): Promise<void>;
deleteRegistrationRequest?(id: string): Promise<void>;
findRegistrationRequestByUsername?(username: string): Promise<RegistrationRequest | null>;
findRegistrationRequestByEmail?(normalizedEmail: string): Promise<RegistrationRequest | null>;
createUserV2FromPasswordHash?(
  userName: string,
  passwordHash: string,
  role?: 'user' | 'admin' | 'owner',
  tags?: string[],
  email?: string
): Promise<void>;
```

Storage implementation:

- Redis/Upstash/KV-like storage can store requests by ID and maintain an index/list similar to movie requests.
- D1/Postgres should use a `registration_requests` table.
- Keep status in the request so rejected and approved requests can remain visible for admin review.

Suggested SQL table:

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
```

Indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_registration_requests_status_created
  ON registration_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_requests_username
  ON registration_requests(username);

CREATE INDEX IF NOT EXISTS idx_registration_requests_email
  ON registration_requests(normalized_email);
```

## Email Verification Flow

Add a public endpoint:

```text
POST /api/register/email-code
```

Request:

```ts
{
  username: string;
  email: string;
  inviteCode?: string;
  turnstileToken?: string;
}
```

Behavior:

- Only works when registration is enabled and email verification is enabled.
- Applies the same username validation as registration.
- Applies invite code validation if invite code is required.
- Applies Turnstile validation if registration Turnstile is required.
- Applies domain allowlist and alias blocking.
- Checks that username is not already an existing user or pending request.
- Checks that email is not already used by an existing user or pending request where possible.
- Sends a 6-digit code using existing `EmailService`.
- Stores a short-lived verification record using global value storage or a dedicated storage helper.

Code lifetime:

- 10 minutes.
- Resending is allowed with throttling, such as 60 seconds per email or username.
- Verification records should be keyed by username and normalized email.

Registration submission:

- `POST /api/register` accepts `email` and `emailCode`.
- If email verification is enabled, the code must be valid before either creating a user or creating an approval request.
- After successful registration or request creation, consume the code.

## Registration Flow

`POST /api/register` keeps the existing validations:

- storage type is not localStorage
- registration enabled
- username required and valid
- password required and at least 6 characters
- username is not the owner username
- invite code if enabled
- Turnstile if enabled
- username does not already exist

Then apply new validations:

- If email verification is enabled, require `email` and `emailCode`.
- If email is provided, validate format, domain allowlist, and alias blocking.
- If approval is enabled and approval question is configured, require `approvalAnswer`.
- If approval is enabled, reject duplicate pending requests for the same username or email.

Final behavior:

- If approval is disabled, create the user immediately with default user tags.
- If approval is enabled, create a pending `RegistrationRequest` and return:

```ts
{
  ok: true,
  pendingApproval: true,
  message: '申请已提交，请等待管理员审核'
}
```

The register page should show the message and offer a button back to login. It should not redirect as if registration completed.

## Admin Approval API

Add admin endpoints:

```text
GET /api/admin/registration-requests?status=pending&page=1&limit=20&search=
GET /api/admin/registration-requests/[id]
POST /api/admin/registration-requests/[id]
```

Actions:

```ts
{ action: 'approve' }
{ action: 'reject', reason?: string }
```

Permissions:

- Owner and admin can list and review requests.
- This matches user management expectations.

Approve behavior:

- Re-check username does not already exist.
- Re-check email is not already used where email is present and storage supports email lookup.
- Create the user with role `user`, default registration tags, and email if present.
- Mark request `approved`, set `reviewedAt`, `reviewedBy`.
- Return the created username and request status.

Reject behavior:

- Mark request `rejected`, set `reviewedAt`, `reviewedBy`, and optional `rejectReason`.
- Do not create a user.

## Admin UI

Add an admin entry named "注册审批".

Recommended placement:

- Add a button or row in the existing admin/user menu area near "用户动态".
- Add a dedicated page at:

```text
/admin/registration-requests
```

Page layout:

- Header: `注册审批`
- Summary chips: `待审批`, `已批准`, `已拒绝`
- Search by username or email.
- Table columns:
  - 用户名
  - 邮箱
  - 答案
  - 提交时间
  - 状态
  - 操作
- Detail panel or modal:
  - username
  - email
  - approval question
  - approval answer
  - submitted time
  - reviewed time and reviewer when reviewed
  - reject reason when rejected

Actions:

- Pending request: approve and reject buttons.
- Approved/rejected request: read-only details.

## Notifications

When a pending approval request is created:

- Notify the site owner.
- Notify all admin users.
- Use the existing notification system.

Add a notification type:

```ts
| 'registration_request'
```

Notification content:

```ts
{
  id: `registration_request_${request.id}_${Date.now()}`,
  type: 'registration_request',
  title: '新的注册审批申请',
  message: `${username} 提交了注册申请`,
  timestamp: Date.now(),
  read: false,
  metadata: {
    requestId: request.id,
    username,
    email
  }
}
```

If Web Push is enabled for admins, existing storage notification dispatch can continue to handle delivery.

Optional email notification for admins is not part of the first implementation. The first version uses in-app notification plus Web Push.

## Register Page UI

The register page should read runtime config from `window.RUNTIME_CONFIG` as it does today.

New visible fields:

- Email field when email verification is enabled.
- Send code button next to email field.
- Verification code field after code is sent or when email verification is enabled.
- Approval answer textarea when approval is enabled and approval question is non-empty.

Button states:

- If email verification is enabled, registration submit is disabled until a code is entered.
- The send-code button shows cooldown text after sending.
- The main button text can become:
  - `注册`
  - `提交申请`
  - `验证并注册`
  - `验证并提交申请`

Success states:

- Direct registration: current redirect to login is preserved.
- Approval registration: stay on a success message:

```text
申请已提交，请等待管理员审核
```

## Error Handling

All server errors should be safe and clear:

- Existing username:

```text
用户名已存在
```

- Existing pending username:

```text
该用户名已有待审批申请，请等待管理员审核
```

- Email domain not allowed:

```text
当前邮箱域名不在允许列表中，请使用以下域名邮箱：gmail.com、outlook.com
```

- Email alias blocked:

```text
邮箱地址不能包含 + 别名
```

- Email service disabled when email verification is required:

```text
服务器未启用邮件服务，暂时无法发送验证码
```

- Wrong email code:

```text
验证码错误或已过期
```

## Security Notes

- Never expose SMTP password, Resend API key, email code values, or password hashes to the client.
- Never store pending request plaintext passwords.
- Apply server-side validation even if the register page already hides or disables fields.
- Use a registration lock by username, preserving the existing lock style.
- Use throttling for email code sending to reduce accidental abuse.
- Keep rejected requests visible to admins so repeated attempts are easier to inspect.

## Testing Plan

Unit and route tests:

- Email domain allowlist accepts allowed domains and rejects others with the full allowed domain list in the message.
- Alias blocking rejects `name+tag@example.com`, `.name@example.com`, `name.@example.com`, and `na..me@example.com`.
- Registration without new switches preserves current direct creation behavior.
- Email verification requires a valid code when enabled.
- Approval enabled creates a pending request instead of a user.
- Approval question required only when configured.
- Approving a request creates a user and marks the request approved.
- Rejecting a request marks it rejected without creating a user.
- Duplicate username and duplicate pending request are rejected.
- New approval request creates notifications for owner and all admins.

UI tests:

- Register page shows email/code fields only when email verification is enabled.
- Register page shows approval textarea only when approval mode is enabled and question is configured.
- Register page displays pending approval success text instead of redirecting.
- Admin approval page can list, inspect, approve, and reject pending requests.

Verification:

- Run focused registration and approval route tests.
- Run focused register page and admin approval page tests.
- Run typecheck.
- Run Prettier on changed files.
- Do not run a local production build unless explicitly requested.

## Rollout

1. Add config fields with safe disabled defaults.
2. Add storage methods and migrations.
3. Add email code endpoint and validation helpers.
4. Update `/api/register`.
5. Update `/api/server-config`.
6. Update registration config UI.
7. Update register page UI.
8. Add admin approval APIs.
9. Add admin approval page and menu entry.
10. Add notifications for pending requests.
11. Add tests and run verification.
