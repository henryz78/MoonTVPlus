# Weekly Watch Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a weekly watch leaderboard with 7-day rewards, active title/avatar-frame display, and a once-per-settlement user notification.

**Architecture:** Build one server-side reward module that computes weekly and all-time rankings from existing play records. Persist the latest weekly settlement as one JSON value through the existing global key/value store, then expose small authenticated APIs for leaderboard, current reward, and notification read state. Render rewards through a shared client component so the user menu, leaderboard, and admin activity page use the same visual rules.

**Tech Stack:** Next.js App Router, TypeScript, Jest, Testing Library, existing `db` storage facade, existing `PageLayout` and `UserMenu` UI patterns.

---

## File Structure

- Create `src/lib/watch-rewards.ts`: reward tiers, week boundary helpers, play-record duration helpers, leaderboard builders, settlement persistence, notification read state.
- Create `src/lib/watch-rewards.test.ts`: unit tests for weekly boundaries, tier selection, owner exclusion, all-time ranking, weekly settlement, and notification expiry/read behavior.
- Create `src/components/watch-rewards/RewardAvatarFrame.tsx`: compact and normal avatar-frame component with the four accepted frame designs.
- Create `src/components/watch-rewards/RewardAvatarFrame.test.tsx`: render tests for tier class names and title output.
- Create `src/components/watch-rewards/WeeklyRewardNotification.tsx`: global client modal that fetches settlement notice, shows it within 7 days, and marks it read.
- Create `src/app/watch-leaderboard/page.tsx`: public logged-in leaderboard page with `上周榜` and `全部榜` tabs, 10 rows per page, reward preview on weekly tab.
- Create `src/app/watch-leaderboard/page.test.tsx`: page tests for default weekly tab, all-time tab, pagination, and under-threshold display.
- Create `src/app/api/watch-leaderboard/route.ts`: authenticated leaderboard API.
- Create `src/app/api/watch-rewards/current/route.ts`: authenticated current reward API for the logged-in user.
- Create `src/app/api/watch-rewards/notification/route.ts`: authenticated weekly settlement notification API.
- Create `src/app/api/watch-rewards/notification/read/route.ts`: authenticated API to mark the latest settlement notice read.
- Create tests under `src/app/api/watch-leaderboard/route.test.ts` and `src/app/api/watch-rewards/notification/route.test.ts`.
- Modify `src/lib/admin.types.ts`: add `LeaderboardOwnerParticipates?: boolean`.
- Modify `src/lib/config.ts`: default `LeaderboardOwnerParticipates` to `false` during self-check and env bootstrap.
- Modify `src/app/api/admin/site/route.ts`: accept, validate, and save `LeaderboardOwnerParticipates`.
- Modify `src/app/admin/page.tsx`: add a site-setting toggle labeled `站长参与排行榜`.
- Modify `src/app/api/cron/[password]/route.ts`: run weekly settlement during cron after config refresh.
- Modify `src/components/UserMenu.tsx`: add leaderboard menu entry and show active weekly reward beside the user identity.
- Modify `src/app/layout.tsx`: mount `WeeklyRewardNotification` for logged-in pages.
- Modify `src/app/play-stats/page.tsx` and `src/app/play-stats/page.test.tsx`: remove the embedded `用户排行` section because ranking moves to the leaderboard page.
- Modify `src/lib/admin-user-activity.ts`, `src/lib/admin-user-activity.test.ts`, and `src/app/admin/user-activity/page.tsx`: attach current active reward to user rows/details.

## Task 1: Reward Core

**Files:**

- Create: `src/lib/watch-rewards.ts`
- Test: `src/lib/watch-rewards.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests covering:

```ts
expect(getRewardTier(59 * 60)).toBeNull();
expect(getRewardTier(60 * 60)?.title).toBe('本周观影者');
expect(getRewardTier(3 * 60 * 60)?.title).toBe('本周影迷');
expect(getRewardTier(7 * 60 * 60)?.title).toBe('本周追剧达人');
expect(getRewardTier(14 * 60 * 60)?.title).toBe('本周放映王');
```

Add a weekly-boundary test:

```ts
const now = new Date('2026-06-22T12:00:00.000Z').getTime();
expect(getPreviousWeekRange(now)).toMatchObject({
  startAt: new Date('2026-06-15T00:00:00.000').getTime(),
  endAt: new Date('2026-06-22T00:00:00.000').getTime() - 1,
});
```

Add leaderboard tests using mocked `db.getUserListV2`, `db.getAllPlayRecords`, `db.getGlobalValue`, `db.setGlobalValue`, and `getConfig()`:

```ts
const result = await getAllTimeWatchLeaderboard({
  viewerUsername: 'alice',
  page: 1,
  limit: 10,
});
expect(result.rows.map((row) => row.username)).toEqual(['bob', 'alice']);
expect(result.rows[0]).toMatchObject({
  rank: 1,
  watchSeconds: 7200,
  reward: { title: '本周观影者', level: 1 },
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\lib\watch-rewards.test.ts --runInBand
```

Expected: fails because `src/lib/watch-rewards.ts` does not exist.

- [ ] **Step 3: Implement minimal reward core**

Implement exported types and functions:

```ts
export const WEEKLY_REWARD_TIERS = [
  { level: 4, minSeconds: 14 * 3600, title: '本周放映王' },
  { level: 3, minSeconds: 7 * 3600, title: '本周追剧达人' },
  { level: 2, minSeconds: 3 * 3600, title: '本周影迷' },
  { level: 1, minSeconds: 1 * 3600, title: '本周观影者' },
] as const;
```

Expose:

```ts
export function getRewardTier(seconds: number): WatchReward | null;
export function getPreviousWeekRange(now?: number): WatchWeekRange;
export async function getWeeklyWatchLeaderboard(
  input: LeaderboardInput
): Promise<WatchLeaderboardResult>;
export async function getAllTimeWatchLeaderboard(
  input: LeaderboardInput
): Promise<WatchLeaderboardResult>;
export async function settlePreviousWeekWatchRewards(
  now?: number
): Promise<WeeklyWatchSettlement>;
export async function getCurrentWatchReward(
  username: string,
  now?: number
): Promise<CurrentWatchReward | null>;
export async function getWeeklyWatchNotification(
  username: string,
  now?: number
): Promise<WeeklyWatchNotification | null>;
export async function markWeeklyWatchNotificationRead(
  username: string
): Promise<void>;
```

Use `getConfig().SiteConfig.LeaderboardOwnerParticipates === true` to decide whether `process.env.USERNAME` participates.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\lib\watch-rewards.test.ts --runInBand
```

Expected: all tests pass.

## Task 2: Site Config Toggle

**Files:**

- Modify: `src/lib/admin.types.ts`
- Modify: `src/lib/config.ts`
- Modify: `src/app/api/admin/site/route.ts`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Write failing config tests**

Extend `src/lib/config.test.ts`:

```ts
expect(
  configSelfCheck({ ...minimalConfig, SiteConfig: {} as any }).SiteConfig
    .LeaderboardOwnerParticipates
).toBe(false);
```

- [ ] **Step 2: Run config test and verify RED**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\lib\config.test.ts --runInBand
```

Expected: fails because the field is missing.

- [ ] **Step 3: Add config support**

Add `LeaderboardOwnerParticipates?: boolean` to `AdminConfig.SiteConfig`, set the self-check default to `false`, include it in admin site route body parsing/validation/save, and add a toggle under the site config section:

```tsx
<label className='flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700'>
  <span>
    <span className='block text-sm font-medium text-gray-900 dark:text-gray-100'>
      站长参与排行榜
    </span>
    <span className='mt-1 block text-xs text-gray-500 dark:text-gray-400'>
      开启后站长账号会进入周榜和全部榜统计
    </span>
  </span>
  <input
    type='checkbox'
    checked={siteSettings.LeaderboardOwnerParticipates || false}
    onChange={(e) =>
      setSiteSettings({
        ...siteSettings,
        LeaderboardOwnerParticipates: e.target.checked,
      })
    }
  />
</label>
```

- [ ] **Step 4: Run config test and typecheck target files**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\lib\config.test.ts --runInBand
.\node_modules\.bin\tsc.cmd --noEmit --incremental false
```

Expected: tests pass and typecheck reaches zero errors.

## Task 3: Leaderboard And Notification APIs

**Files:**

- Create: `src/app/api/watch-leaderboard/route.ts`
- Create: `src/app/api/watch-leaderboard/route.test.ts`
- Create: `src/app/api/watch-rewards/current/route.ts`
- Create: `src/app/api/watch-rewards/notification/route.ts`
- Create: `src/app/api/watch-rewards/notification/read/route.ts`
- Create: `src/app/api/watch-rewards/notification/route.test.ts`
- Modify: `src/app/api/cron/[password]/route.ts`

- [ ] **Step 1: Write failing API tests**

Test `/api/watch-leaderboard`:

```ts
const request = new NextRequest(
  'http://localhost/api/watch-leaderboard?type=weekly&page=1'
);
const response = await GET(request);
expect(response.status).toBe(200);
expect(await response.json()).toMatchObject({ type: 'weekly', page: 1 });
```

Test notification read flow:

```ts
const response = await GET(
  new NextRequest('http://localhost/api/watch-rewards/notification')
);
expect(await response.json()).toMatchObject({
  notification: { weekLabel: expect.any(String), reward: expect.anything() },
});
await POST(
  new NextRequest('http://localhost/api/watch-rewards/notification/read', {
    method: 'POST',
  })
);
expect(markWeeklyWatchNotificationRead).toHaveBeenCalledWith('alice');
```

- [ ] **Step 2: Run API tests and verify RED**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\app\api\watch-leaderboard\route.test.ts src\app\api\watch-rewards\notification\route.test.ts --runInBand
```

Expected: fails because routes are missing.

- [ ] **Step 3: Implement APIs**

Implement route behavior:

- Require non-local storage.
- Require auth cookie username.
- `type=weekly` uses `getWeeklyWatchLeaderboard`.
- `type=all-time` uses `getAllTimeWatchLeaderboard`.
- Clamp page to at least 1 and limit to 10.
- Notification GET returns `{ notification }`.
- Notification read POST returns `{ ok: true }`.
- Current reward GET returns `{ reward }`.
- Cron imports and awaits `settlePreviousWeekWatchRewards()` after `refreshConfig()`.

- [ ] **Step 4: Run API tests and verify GREEN**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\app\api\watch-leaderboard\route.test.ts src\app\api\watch-rewards\notification\route.test.ts --runInBand
```

Expected: tests pass.

## Task 4: Shared Reward UI

**Files:**

- Create: `src/components/watch-rewards/RewardAvatarFrame.tsx`
- Create: `src/components/watch-rewards/RewardAvatarFrame.test.tsx`

- [ ] **Step 1: Write failing UI tests**

```ts
render(
  <RewardAvatarFrame
    label='H'
    reward={{ level: 4, title: '本周放映王', minSeconds: 50400 }}
    size='compact'
  />
);
expect(screen.getByText('H')).toBeInTheDocument();
expect(screen.getByTitle('本周放映王')).toHaveClass('reward-frame-level-4');
```

- [ ] **Step 2: Run UI test and verify RED**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\components\watch-rewards\RewardAvatarFrame.test.tsx --runInBand
```

Expected: fails because the component is missing.

- [ ] **Step 3: Implement component**

Implement a component with `size='compact' | 'normal'`, class names `reward-frame-level-1` through `reward-frame-level-4`, and inline scoped CSS for the accepted green/blue/purple/gold frame visuals.

- [ ] **Step 4: Run UI test and verify GREEN**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\components\watch-rewards\RewardAvatarFrame.test.tsx --runInBand
```

Expected: tests pass.

## Task 5: Leaderboard Page And Menu Entry

**Files:**

- Create: `src/app/watch-leaderboard/page.tsx`
- Create: `src/app/watch-leaderboard/page.test.tsx`
- Modify: `src/components/UserMenu.tsx`

- [ ] **Step 1: Write failing page test**

Mock `fetch` and assert:

```ts
expect(await screen.findByText('观影排行榜')).toBeInTheDocument();
expect(screen.getByRole('button', { name: '上周榜' })).toBeInTheDocument();
expect(screen.getByText('奖励有效期 7 天')).toBeInTheDocument();
expect(screen.getByText('未达标')).toBeInTheDocument();
```

- [ ] **Step 2: Run page test and verify RED**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\app\watch-leaderboard\page.test.tsx --runInBand
```

Expected: fails because the page is missing.

- [ ] **Step 3: Implement page and menu**

Implement:

- Page title `观影排行榜`.
- Tabs `上周榜` and `全部榜`.
- 10 rows per page.
- Weekly tab displays complete weekly users returned by API, `未达标` below 1 hour, and reward preview at bottom.
- All-time tab hides reward preview.
- Rank styles use muted gold, silver, bronze accents for rank 1-3.
- Add a `排行榜` row in the user menu near `播放统计`.

- [ ] **Step 4: Run page test and verify GREEN**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\app\watch-leaderboard\page.test.tsx --runInBand
```

Expected: tests pass.

## Task 6: Remove Embedded User Ranking From Play Stats

**Files:**

- Modify: `src/app/play-stats/page.tsx`
- Modify: `src/app/play-stats/page.test.tsx`

- [ ] **Step 1: Update tests first**

Change the play-stats test to assert `用户排行` is absent and `最近观看最多` remains shrinkable.

- [ ] **Step 2: Run play-stats page test and verify RED**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\app\play-stats\page.test.tsx --runInBand
```

Expected: fails while the old ranking section still renders.

- [ ] **Step 3: Remove the `用户排行`/`我的概况` section**

Keep stat cards, top titles, and recent records. Remove unused imports/types after the JSX removal.

- [ ] **Step 4: Run page test and verify GREEN**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\app\play-stats\page.test.tsx --runInBand
```

Expected: tests pass.

## Task 7: Current Reward Display And Settlement Modal

**Files:**

- Create: `src/components/watch-rewards/WeeklyRewardNotification.tsx`
- Create: `src/components/watch-rewards/WeeklyRewardNotification.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/UserMenu.tsx`
- Modify: `src/lib/admin-user-activity.ts`
- Modify: `src/lib/admin-user-activity.test.ts`
- Modify: `src/app/admin/user-activity/page.tsx`

- [ ] **Step 1: Write failing tests**

Modal test:

```ts
expect(await screen.findByText('上周观影结算')).toBeInTheDocument();
expect(screen.getByText(/已自动穿戴/)).toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: '我知道了' }));
expect(fetch).toHaveBeenCalledWith(
  '/api/watch-rewards/notification/read',
  expect.objectContaining({ method: 'POST' })
);
```

Admin activity test:

```ts
expect(result.users[0].currentReward).toMatchObject({
  title: '本周影迷',
  level: 2,
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\components\watch-rewards\WeeklyRewardNotification.test.tsx src\lib\admin-user-activity.test.ts --runInBand
```

Expected: fails because modal and reward fields are missing.

- [ ] **Step 3: Implement display**

Add:

- `WeeklyRewardNotification` mounted in layout.
- User menu fetch to `/api/watch-rewards/current` and display active title/frame near username.
- Admin activity overview/detail `currentReward`.
- Admin page render for current reward under user identity where space allows.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\components\watch-rewards\WeeklyRewardNotification.test.tsx src\lib\admin-user-activity.test.ts --runInBand
```

Expected: tests pass.

## Task 8: Final Verification And Review

**Files:**

- All changed files

- [ ] **Step 1: Run focused tests**

Run:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src\lib\watch-rewards.test.ts src\app\api\watch-leaderboard\route.test.ts src\app\api\watch-rewards\notification\route.test.ts src\components\watch-rewards\RewardAvatarFrame.test.tsx src\components\watch-rewards\WeeklyRewardNotification.test.tsx src\app\watch-leaderboard\page.test.tsx src\app\play-stats\page.test.tsx src\lib\admin-user-activity.test.ts src\lib\config.test.ts --runInBand
```

Expected: all focused tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit --incremental false
```

Expected: zero TypeScript errors.

- [ ] **Step 3: Request code review**

Use `superpowers:requesting-code-review` with:

- Description: weekly watch rewards, leaderboard, active rewards, settlement notification.
- Requirements: all confirmed product decisions in `docs/superpowers/specs/2026-06-21-weekly-watch-rewards-design.md`.
- Base SHA: commit before implementation.
- Head SHA: implementation commit.

- [ ] **Step 4: Apply valid review feedback**

Fix critical and important feedback, rerun focused tests and typecheck.

- [ ] **Step 5: Commit and push after verification**

Commit message:

```bash
git commit -m "feat: add weekly watch rewards"
```

Push the active branch after verifying branch target with current remote state.
