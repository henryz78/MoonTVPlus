# User Activity Admin Page Design

## Goal

Add an admin-only user activity page that lets operators see each user's viewing activity and approximate online status without disrupting the existing MoonTVPlus architecture.

The feature should be useful for a personal fork: quick to inspect, conservative in scope, and aligned with existing admin/user/device management behavior.

## Entry Point

Add a new owner/admin-only item to the existing top-right `UserMenu`.

- Label: `用户动态`
- Destination: `/admin/user-activity`
- Visibility: same role gate as the existing admin panel entry

This keeps the feature discoverable from the small user menu while avoiding changes to the main sidebar.

## Page Structure

Create a standalone admin page at `/admin/user-activity`.

The page has two levels:

1. User overview list
2. Per-user viewing detail panel

The overview list shows:

- Username
- Role
- Banned status if present
- Recent activity status
- Viewing record count
- Most recent watched item
- Action to view details

Default ordering for returned overview rows is `lastActiveAt` descending, so online and recently active users appear first within the response. Users without any known activity sort after users with activity.

The details panel opens only after selecting a user. It shows that user's viewing records sorted by `save_time` descending.

Each viewing record displays:

- Cover
- Title
- Source
- Episode index and total episodes
- Playback progress
- Save time

Playback progress should reuse the existing play-record display semantics where practical: calculate percentage from `play_time / total_time`, and show a readable time/progress label derived from the same fields instead of inventing a separate backend-only meaning.

Initial filters should stay simple:

- Search by username
- Refresh button

More filters such as "online only" or "has viewing records" can be added later if the first version feels crowded.

## Online Status

Do not use the current device `lastUsed` behavior as-is for online status.

Current behavior:

- Login writes `createdAt` and `lastUsed` to the refresh token record.
- `lastUsed` is updated only when the refresh token is verified.
- Access tokens last 4 hours and refresh only near expiry, so `lastUsed` can remain equal to login time even while the user is actively watching.

Add a lightweight activity endpoint and client-side ping:

- `POST /api/auth/activity`
- Runs only for authenticated non-localStorage sessions with a valid `tokenId`.
- Updates the current device refresh-token `lastUsed` to `Date.now()`.
- Sends only while the document is visible (`document.visibilityState === 'visible'`).
- Sends once when the page becomes visible again if the previous successful ping is older than 60 seconds.
- Fails silently on the client.
- Sends at roughly 60-second intervals.

Do not add click, scroll, or playback-progress event tracking in the first version. Page visibility plus a throttled ping is accurate enough for an MVP and avoids noisy writes.

Status thresholds:

- Last active within 2 minutes: `在线`
- Last active within 10 minutes: `X 分钟前`
- Older than 10 minutes: formatted timestamp such as `2026-06-16 09:45`
- No known activity: `从未活跃`

This also improves the existing device management panel because the same `lastUsed` field becomes more accurate.

## Backend API

Add `GET /api/admin/user-activity`.

Supported query params:

- `page`, default `1`
- `limit`, default `20`
- `search`, optional username search

It returns paginated overview rows for users visible to the current operator:

- `username`
- `role`
- `banned`
- `lastActiveAt`
- `isOnline`
- `playRecordCount`
- `latestPlayRecord`
  - `title`
  - `episode`
  - `sourceName`
  - `progressPercent`
  - `saveTime`
- `total`
- `page`
- `limit`
- `totalPages`

`latestPlayRecord` is intentionally a compact summary for the overview. Full play-record objects are returned only by the detail endpoint.

Add `GET /api/admin/user-activity/[username]`.

It returns detail data for one visible target user:

- User summary:
  - `username`
  - `role`
  - `banned`
  - `lastActiveAt`
  - `playRecordCount`
- `records`, sorted by newest `save_time`

Both endpoints should use `Cache-Control: no-store`.

## Permissions

Use the same permission model as existing admin user/device management.

- Owner can view all users.
- Admin can view ordinary users and themself.
- Ordinary users cannot access the page or APIs.

If storage type is `localstorage`, return a clear unsupported response because there is no real multi-user database.

## Data Flow

Overview request:

1. Read current auth cookie.
2. Resolve operator role.
3. Load a paginated set of visible users via existing user-list storage methods.
4. For each visible user:
   - Load all play records with `db.getAllPlayRecords(username)`.
   - Find the latest record by `save_time`.
   - Load devices with `getUserDevices(username)`.
   - Compute the newest `lastUsed` across devices.
5. Sort the returned overview rows server-side by `lastActiveAt` descending, with users lacking activity last.
6. Return compact rows.

Detail request:

1. Read current auth cookie.
2. Resolve operator role.
3. Validate target user visibility.
4. Load target user's play records.
5. Return sorted records.

Activity ping:

1. Read current auth cookie.
2. Require `username`, `tokenId`, and `refreshToken`.
3. Update only the current token record's `lastUsed`.
4. Return `{ ok: true }`.

## Error Handling

- Unauthorized: return `401`.
- Insufficient permission: return `401`.
- Missing target username: return `400`.
- Unknown target user: return `404`.
- localStorage mode: return `400` with an unsupported message.
- Activity ping failure: client logs at most to console and retries on the next interval.
- Empty viewing history: show `暂无观看记录`.

## Performance Notes

Keep the first implementation compact.

- Do not return all users' full viewing history in the overview.
- Load full records only when a user is selected.
- Use pagination for the user overview and default to 20 users per page.
- The activity ping interval should be around 60 seconds and should pause while the page is hidden to avoid noisy writes.

The first version can tolerate bounded per-page lookups for play records and devices because the overview is paginated. If user counts become large or the overview becomes slow, add storage-level summary helpers such as `getLatestPlayRecord(username)` and `getLatestUserActivity(username)`, or a small summary cache.

The MVP should not perform a full scan of every visible user only to provide globally perfect `lastActiveAt` ordering across all pages. If global activity ordering becomes necessary, add a storage-level activity index or summary cache first.

## Testing

Unit/API tests should cover:

- Owner can list all visible users.
- Admin can list ordinary users and themself.
- Admin cannot view owner or other admins.
- Ordinary user is rejected.
- localStorage mode returns unsupported.
- Overview computes latest active time from the newest device `lastUsed`.
- Overview computes latest play record by newest `save_time`.
- Overview sorts by `lastActiveAt` descending.
- Overview returns compact `latestPlayRecord` data rather than a full play-record object.
- Detail returns records sorted newest first.
- Activity ping updates only the current device token's `lastUsed`.
- Activity ping does not run while the document is hidden.

Manual verification should cover:

- User menu shows `用户动态` only for owner/admin.
- `/admin/user-activity` renders the overview list.
- Selecting a user opens their viewing records.
- Device management "最后活跃" becomes more current after the activity ping runs.
