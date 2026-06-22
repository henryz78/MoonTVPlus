import { getUserDevices } from '@/lib/refresh-token';

import { db } from './db';
import { getOnlineCount, getPlayStats } from './play-stats';
import { getUserPresence } from './user-presence';

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

jest.mock('./user-presence', () => ({
  getUserPresence: jest.fn(),
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
    (getUserPresence as jest.Mock).mockResolvedValue(null);
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
    if (result.viewerRole !== 'owner') {
      throw new Error('expected owner stats');
    }
    expect(result.totalUsers).toBe(2);
    expect(result.totalPlayRecords).toBe(2);
    expect(result.totalWatchSeconds).toBe(100);
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

    if (result.viewerRole !== 'admin') {
      throw new Error('expected admin stats');
    }
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
    expect(result).toMatchObject({
      totalPlayRecords: 1,
      totalWatchSeconds: 50,
      todayPlayRecords: 1,
      last7DaysPlayRecords: 1,
      todayWatchSeconds: 50,
      last7DaysWatchSeconds: 50,
      lastWatchAt: ONE_HOUR_AGO,
      latestRecord: {
        title: '我的电影',
        episode: 1,
        sourceName: 'source',
        progressPercent: 50,
        watchSeconds: 50,
        saveTime: ONE_HOUR_AGO,
      },
    });
    expect(result).not.toHaveProperty('totalUsers');
    expect(result).not.toHaveProperty('onlineUsers');
    expect(result).not.toHaveProperty('todayActiveUsers');
    expect(result).not.toHaveProperty('topTitles');
    expect(result).not.toHaveProperty('userRanking');
    expect(result.recentRecords[0]).not.toHaveProperty('username');
  });

  it('sums watch duration with sane bounds per user and title', async () => {
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('alice', 'user'), user('bob', 'user')],
      total: 2,
    });
    (db.getAllPlayRecords as jest.Mock).mockImplementation(async (username) => {
      if (username === 'alice') {
        return {
          a: { ...record('沙丘', ONE_HOUR_AGO, 120), total_time: 180 },
          b: { ...record('沙丘', ONE_HOUR_AGO, 999), total_time: 300 },
        };
      }
      return {
        c: record('异形', TWO_DAYS_AGO, -30),
      };
    });

    const result = await getPlayStats({ operatorUsername: 'owner' });

    if (result.viewerRole !== 'owner') {
      throw new Error('expected owner stats');
    }
    expect(result.totalWatchSeconds).toBe(420);
    expect(result.last7DaysWatchSeconds).toBe(420);
    expect(result.todayWatchSeconds).toBe(420);
    expect(
      result.userRanking.find((item) => item.username === 'alice')
    ).toMatchObject({
      watchSeconds: 420,
    });
    expect(
      result.userRanking.find((item) => item.username === 'bob')
    ).toMatchObject({
      watchSeconds: 0,
    });
    expect(
      result.topTitles.find((item) => item.title === '沙丘')
    ).toMatchObject({
      watchSeconds: 420,
    });
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

  it('counts users online from presence even when device activity is missing', async () => {
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('alice', 'user'), user('bob', 'user')],
      total: 2,
    });
    (db.getAllPlayRecords as jest.Mock).mockResolvedValue({});
    (getUserDevices as jest.Mock).mockResolvedValue([]);
    (getUserPresence as jest.Mock).mockImplementation(async (username) =>
      username === 'alice' ? NOW - 30_000 : null
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
