import { getConfig } from '@/lib/config';

import { db } from './db';
import {
  getAllTimeWatchLeaderboard,
  getCurrentWatchReward,
  getPreviousWeekRange,
  getRewardTier,
  getWeeklyWatchLeaderboard,
  getWeeklyWatchNotification,
  getWeeklyWatchReadKey,
  markWeeklyWatchNotificationRead,
  settlePreviousWeekWatchRewards,
} from './watch-rewards';

jest.mock('./db', () => ({
  db: {
    getUserInfoV2: jest.fn(),
    getUserListV2: jest.fn(),
    getAllPlayRecords: jest.fn(),
    getGlobalValue: jest.fn(),
    setGlobalValue: jest.fn(),
  },
}));

jest.mock('@/lib/config', () => ({
  getConfig: jest.fn(),
}));

const record = (
  title: string,
  saveTime: number,
  playTime: number,
  totalTime = 7200
) => ({
  title,
  source_name: '测试源',
  cover: '',
  year: '',
  index: 1,
  total_episodes: 12,
  play_time: playTime,
  total_time: totalTime,
  save_time: saveTime,
  search_title: '',
});

const user = (username: string, role: 'owner' | 'admin' | 'user' = 'user') => ({
  username,
  role,
  banned: false,
  created_at: 1,
});

describe('watch rewards', () => {
  const originalUsername = process.env.USERNAME;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERNAME = 'owner';
    (getConfig as jest.Mock).mockResolvedValue({
      SiteConfig: {
        LeaderboardOwnerParticipates: false,
      },
    });
    (db.getUserInfoV2 as jest.Mock).mockImplementation(async (username) => {
      if (username === 'admin') return { role: 'admin', banned: false };
      if (username === 'owner') return { role: 'owner', banned: false };
      return { role: 'user', banned: false };
    });
    (db.getGlobalValue as jest.Mock).mockImplementation(async (key) => {
      if (String(key).startsWith('watch_rewards.read.')) return null;
      return null;
    });
  });

  afterEach(() => {
    if (originalUsername === undefined) {
      delete process.env.USERNAME;
    } else {
      process.env.USERNAME = originalUsername;
    }
  });

  it('selects reward tiers from watch seconds', () => {
    expect(getRewardTier(59 * 60)).toBeNull();
    expect(getRewardTier(60 * 60)).toMatchObject({
      level: 1,
      title: '本周观影者',
    });
    expect(getRewardTier(3 * 60 * 60)).toMatchObject({
      level: 2,
      title: '本周影迷',
    });
    expect(getRewardTier(7 * 60 * 60)).toMatchObject({
      level: 3,
      title: '本周追剧达人',
    });
    expect(getRewardTier(14 * 60 * 60)).toMatchObject({
      level: 4,
      title: '本周放映王',
    });
  });

  it('returns the previous local natural week', () => {
    const now = new Date('2026-06-22T12:00:00').getTime();

    expect(getPreviousWeekRange(now)).toEqual({
      startAt: new Date('2026-06-15T00:00:00').getTime(),
      endAt: new Date('2026-06-22T00:00:00').getTime() - 1,
      label: '2026-06-15 - 2026-06-21',
    });
  });

  it('builds all-time ranking and excludes owner by default', async () => {
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('owner', 'owner'), user('alice'), user('bob')],
      total: 3,
    });
    (db.getAllPlayRecords as jest.Mock).mockImplementation(async (username) => {
      if (username === 'owner') {
        return { owner: record('站长电影', Date.now(), 20 * 60 * 60) };
      }
      if (username === 'bob') {
        return { bob: record('沙丘', Date.now(), 2 * 60 * 60) };
      }
      return { alice: record('异形', Date.now(), 90 * 60) };
    });

    const result = await getAllTimeWatchLeaderboard({
      viewerUsername: 'alice',
      page: 1,
      limit: 10,
    });

    expect(result.type).toBe('all-time');
    expect(result.rows.map((row) => row.username)).toEqual(['bob', 'alice']);
    expect(result.rows[0]).toMatchObject({
      rank: 1,
      username: 'bob',
      watchSeconds: 7200,
      reward: null,
      rankTitle: null,
    });
    expect(db.getAllPlayRecords).not.toHaveBeenCalledWith('owner');
  });

  it('includes owner when the site setting enables owner participation', async () => {
    (getConfig as jest.Mock).mockResolvedValue({
      SiteConfig: {
        LeaderboardOwnerParticipates: true,
      },
    });
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('owner', 'owner'), user('alice')],
      total: 2,
    });
    (db.getAllPlayRecords as jest.Mock).mockImplementation(async (username) => {
      if (username === 'owner') {
        return { owner: record('站长电影', Date.now(), 4 * 60 * 60) };
      }
      return { alice: record('异形', Date.now(), 90 * 60) };
    });

    const result = await getAllTimeWatchLeaderboard({
      viewerUsername: 'alice',
      page: 1,
      limit: 10,
    });

    expect(result.rows.map((row) => row.username)).toEqual(['owner', 'alice']);
  });

  it('settles the previous week and keeps under-threshold users visible', async () => {
    const now = new Date('2026-06-22T12:00:00').getTime();
    const inWeek = new Date('2026-06-18T12:00:00').getTime();
    const outsideWeek = new Date('2026-06-14T23:59:00').getTime();

    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('alice'), user('bob')],
      total: 2,
    });
    (db.getAllPlayRecords as jest.Mock).mockImplementation(async (username) => {
      if (username === 'alice') {
        return {
          one: record('沙丘', inWeek, 2 * 60 * 60),
          old: record('旧电影', outsideWeek, 10 * 60 * 60),
        };
      }
      return { one: record('短片', inWeek, 20 * 60) };
    });

    const settlement = await settlePreviousWeekWatchRewards(now);

    expect(settlement.rows).toEqual([
      expect.objectContaining({
        username: 'alice',
        rank: 1,
        reward: expect.objectContaining({ title: '本周观影者' }),
      }),
      expect.objectContaining({
        username: 'bob',
        rank: 2,
        reward: null,
        qualified: false,
      }),
    ]);
    expect(db.setGlobalValue).toHaveBeenCalledWith(
      'watch_rewards.latest_weekly_settlement',
      expect.stringContaining('"weekLabel":"2026-06-15 - 2026-06-21"')
    );
  });

  it('reads current reward from latest unexpired settlement', async () => {
    const settledAt = new Date('2026-06-22T00:10:00').getTime();
    const now = new Date('2026-06-23T12:00:00').getTime();
    (db.getGlobalValue as jest.Mock).mockResolvedValue(
      JSON.stringify({
        id: '2026-06-15',
        settledAt,
        expiresAt: settledAt + 7 * 24 * 60 * 60 * 1000,
        weekStartAt: new Date('2026-06-15T00:00:00').getTime(),
        weekEndAt: new Date('2026-06-22T00:00:00').getTime() - 1,
        weekLabel: '2026-06-15 - 2026-06-21',
        rows: [
          {
            username: 'alice',
            rank: 1,
            watchSeconds: 8 * 60 * 60,
            reward: { level: 3, title: '本周追剧达人', minSeconds: 25200 },
            rankTitle: '周榜冠军',
            qualified: true,
          },
        ],
      })
    );

    await expect(getCurrentWatchReward('alice', now)).resolves.toMatchObject({
      reward: { title: '本周追剧达人', level: 3 },
      rank: 1,
      rankTitle: '周榜冠军',
    });
  });

  it('returns notification once and skips expired settlements', async () => {
    const settledAt = new Date('2026-06-22T00:10:00').getTime();
    const now = new Date('2026-06-23T12:00:00').getTime();
    const rawSettlement = JSON.stringify({
      id: '2026-06-15',
      settledAt,
      expiresAt: settledAt + 7 * 24 * 60 * 60 * 1000,
      weekStartAt: new Date('2026-06-15T00:00:00').getTime(),
      weekEndAt: new Date('2026-06-22T00:00:00').getTime() - 1,
      weekLabel: '2026-06-15 - 2026-06-21',
      rows: [
        {
          username: 'alice',
          rank: 1,
          watchSeconds: 8 * 60 * 60,
          reward: { level: 3, title: '本周追剧达人', minSeconds: 25200 },
          rankTitle: '周榜冠军',
          qualified: true,
        },
      ],
    });
    (db.getGlobalValue as jest.Mock).mockImplementation(async (key) =>
      key === 'watch_rewards.latest_weekly_settlement' ? rawSettlement : null
    );

    await expect(
      getWeeklyWatchNotification('alice', now)
    ).resolves.toMatchObject({
      weekLabel: '2026-06-15 - 2026-06-21',
      rank: 1,
      reward: { title: '本周追剧达人' },
    });

    await markWeeklyWatchNotificationRead('alice', '2026-06-15');

    expect(db.setGlobalValue).toHaveBeenCalledWith(
      getWeeklyWatchReadKey('2026-06-15', 'alice'),
      '1'
    );

    await expect(
      getWeeklyWatchNotification('alice', settledAt + 8 * 24 * 60 * 60 * 1000)
    ).resolves.toBeNull();
  });

  it('uses latest settlement for weekly leaderboard and paginates rows', async () => {
    (db.getGlobalValue as jest.Mock).mockResolvedValue(
      JSON.stringify({
        id: '2026-06-15',
        settledAt: 1,
        expiresAt: 9999999999999,
        weekStartAt: new Date('2026-06-15T00:00:00').getTime(),
        weekEndAt: new Date('2026-06-22T00:00:00').getTime() - 1,
        weekLabel: '2026-06-15 - 2026-06-21',
        rows: Array.from({ length: 12 }, (_, index) => ({
          username: `user-${index + 1}`,
          rank: index + 1,
          watchSeconds: 3600,
          reward: { level: 1, title: '本周观影者', minSeconds: 3600 },
          rankTitle: index === 0 ? '周榜冠军' : null,
          qualified: true,
        })),
      })
    );

    const result = await getWeeklyWatchLeaderboard({
      viewerUsername: 'alice',
      page: 2,
      limit: 10,
      now: new Date('2026-06-23T12:00:00').getTime(),
    });

    expect(result.type).toBe('weekly');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].username).toBe('user-11');
    expect(result.total).toBe(12);
    expect(result.totalPages).toBe(2);
  });

  it('refreshes weekly leaderboard when the stored settlement is stale', async () => {
    const now = new Date('2026-06-22T12:00:00').getTime();
    const inWeek = new Date('2026-06-18T12:00:00').getTime();
    (db.getGlobalValue as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({
        id: 'weekly-old',
        settledAt: 1,
        expiresAt: 2,
        weekStartAt: new Date('2026-06-08T00:00:00').getTime(),
        weekEndAt: new Date('2026-06-15T00:00:00').getTime() - 1,
        weekLabel: '2026-06-08 - 2026-06-14',
        rows: [],
      })
    );
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('alice')],
      total: 1,
    });
    (db.getAllPlayRecords as jest.Mock).mockResolvedValue({
      one: record('沙丘', inWeek, 2 * 60 * 60),
    });

    const result = await getWeeklyWatchLeaderboard({
      viewerUsername: 'alice',
      page: 1,
      limit: 10,
      now,
    });

    expect(result.weekLabel).toBe('2026-06-15 - 2026-06-21');
    expect(result.rows[0].username).toBe('alice');
    expect(db.setGlobalValue).toHaveBeenCalledWith(
      'watch_rewards.latest_weekly_settlement',
      expect.stringContaining('"weekLabel":"2026-06-15 - 2026-06-21"')
    );
  });

  it('keeps all-time leaderboard reward fields empty', async () => {
    const settledAt = new Date('2026-06-22T00:10:00').getTime();
    (db.getGlobalValue as jest.Mock).mockResolvedValue(
      JSON.stringify({
        id: 'weekly-2026-06-15',
        settledAt,
        expiresAt: settledAt + 7 * 24 * 60 * 60 * 1000,
        weekStartAt: new Date('2026-06-15T00:00:00').getTime(),
        weekEndAt: new Date('2026-06-22T00:00:00').getTime() - 1,
        weekLabel: '2026-06-15 - 2026-06-21',
        rows: [
          {
            username: 'alice',
            rank: 1,
            watchSeconds: 8 * 60 * 60,
            reward: { level: 3, title: '本周追剧达人', minSeconds: 25200 },
            rankTitle: '周榜冠军',
            qualified: true,
          },
        ],
      })
    );
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('alice')],
      total: 1,
    });
    (db.getAllPlayRecords as jest.Mock).mockResolvedValue({
      one: record('沙丘', Date.now(), 9 * 60 * 60),
    });

    const result = await getAllTimeWatchLeaderboard({
      viewerUsername: 'alice',
      page: 1,
      limit: 10,
    });

    expect(result.rows[0]).toMatchObject({
      reward: null,
      rankTitle: null,
    });
  });

  it('stores read state in a per-settlement user key', async () => {
    (db.getGlobalValue as jest.Mock).mockImplementation(async (key) => {
      if (key === 'watch_rewards.latest_weekly_settlement') {
        return JSON.stringify({
          id: 'weekly-2026-06-15',
          settledAt: 1,
          expiresAt: 9999999999999,
          weekStartAt: 1,
          weekEndAt: 2,
          weekLabel: '2026-06-15 - 2026-06-21',
          rows: [
            {
              username: 'alice',
              rank: 1,
              watchSeconds: 3600,
              reward: { level: 1, title: '本周观影者', minSeconds: 3600 },
              rankTitle: '周榜冠军',
              qualified: true,
            },
          ],
        });
      }
      return null;
    });

    await markWeeklyWatchNotificationRead('alice', 'weekly-2026-06-15');

    expect(db.setGlobalValue).toHaveBeenCalledWith(
      getWeeklyWatchReadKey('weekly-2026-06-15', 'alice'),
      '1'
    );
  });

  it('does not mark a different settlement as read', async () => {
    (db.getGlobalValue as jest.Mock).mockResolvedValue(
      JSON.stringify({
        id: 'weekly-new',
        settledAt: 1,
        expiresAt: 9999999999999,
        weekStartAt: 1,
        weekEndAt: 2,
        weekLabel: '2026-06-15 - 2026-06-21',
        rows: [],
      })
    );

    await markWeeklyWatchNotificationRead('alice', 'weekly-old');

    expect(db.setGlobalValue).not.toHaveBeenCalled();
  });
});
