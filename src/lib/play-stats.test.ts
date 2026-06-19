import { getUserDevices } from '@/lib/refresh-token';

import { db } from './db';
import { getOnlineCount, getPlayStats } from './play-stats';

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

const NOW = new Date('2026-06-18T20:00:00.000Z').getTime();
const ONE_HOUR_AGO = NOW - 60 * 60 * 1000;
const TWO_DAYS_AGO = NOW - 2 * 24 * 60 * 60 * 1000;

const user = (username: string, role: 'owner' | 'admin' | 'user') => ({
  username,
  role,
  banned: false,
  created_at: 1,
});

const record = (title: string, saveTime: number, playTime = 50) => ({
  title,
  source_name: 'source',
  cover: '',
  year: '',
  index: 1,
  total_episodes: 10,
  play_time: playTime,
  total_time: 100,
  save_time: saveTime,
  search_title: '',
});

describe('play stats helpers', () => {
  const originalUsername = process.env.USERNAME;
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERNAME = 'owner';
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    (getUserDevices as jest.Mock).mockResolvedValue([]);
    (db.getUserInfoV2 as jest.Mock).mockImplementation(async (username) => {
      if (username === 'admin') return { role: 'admin', banned: false };
      if (username === 'alice') return { role: 'user', banned: false };
      if (username === 'bob') return { role: 'user', banned: false };
      return null;
    });
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
    if (originalUsername === undefined) {
      delete process.env.USERNAME;
    } else {
      process.env.USERNAME = originalUsername;
    }
  });

  it('lets owner stats include the owner even when the user list omits it', async () => {
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('alice', 'user')],
      total: 1,
    });
    (db.getAllPlayRecords as jest.Mock).mockImplementation(async (username) => {
      if (username === 'owner') {
        return { 'source+owner': record('站长片单', ONE_HOUR_AGO) };
      }
      return { 'source+alice': record('沙丘', TWO_DAYS_AGO) };
    });
    (getUserDevices as jest.Mock).mockImplementation(async (username) =>
      username === 'owner' ? [{ lastUsed: ONE_HOUR_AGO }] : []
    );

    const result = await getPlayStats({ operatorUsername: 'owner' });

    expect(result.viewerRole).toBe('owner');
    expect(result.totalUsers).toBe(2);
    expect(result.totalPlayRecords).toBe(2);
    expect(result.todayPlayRecords).toBe(1);
    expect(result.topTitles.map((item) => item.title)).toEqual([
      '站长片单',
      '沙丘',
    ]);
  });

  it('filters admin stats to self and ordinary users', async () => {
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [
        user('owner', 'owner'),
        user('admin', 'admin'),
        user('alice', 'user'),
      ],
      total: 3,
    });
    (db.getAllPlayRecords as jest.Mock).mockResolvedValue({});

    const result = await getPlayStats({ operatorUsername: 'admin' });

    expect(result.userRanking.map((item) => item.username).sort()).toEqual([
      'admin',
      'alice',
    ]);
  });

  it('limits normal user stats to the current user', async () => {
    (db.getAllPlayRecords as jest.Mock).mockResolvedValue({
      'source+alice': record('我的电影', ONE_HOUR_AGO),
    });

    const result = await getPlayStats({ operatorUsername: 'alice' });

    expect(result.viewerRole).toBe('user');
    expect(result.totalUsers).toBe(1);
    expect(result.userRanking).toHaveLength(1);
    expect(result.userRanking[0].username).toBe('alice');
    expect(result.recentRecords[0].username).toBe('alice');
  });

  it('returns online count without exposing usernames', async () => {
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('alice', 'user'), user('bob', 'user')],
      total: 2,
    });
    (db.getAllPlayRecords as jest.Mock).mockResolvedValue({});
    (getUserDevices as jest.Mock).mockImplementation(async (username) =>
      username === 'alice' ? [{ lastUsed: NOW - 30_000 }] : []
    );

    await expect(getOnlineCount()).resolves.toBe(1);
  });

  it('keeps a recently active user online across a missed ping', async () => {
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('alice', 'user')],
      total: 1,
    });
    (db.getAllPlayRecords as jest.Mock).mockResolvedValue({});
    (getUserDevices as jest.Mock).mockImplementation(async (username) =>
      username === 'alice' ? [{ lastUsed: NOW - 3 * 60_000 }] : []
    );

    await expect(getOnlineCount()).resolves.toBe(1);
  });
});
