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
    expect(canViewTargetUsername('admin', 'admin', 'other-admin', 'admin')).toBe(
      false
    );
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
    (db.getAllPlayRecords as jest.Mock).mockImplementation(
      async (username) => ({
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
      })
    );
    (getUserDevices as jest.Mock).mockImplementation(async (username) =>
      username === 'alice'
        ? [
            {
              tokenId: 'a',
              deviceInfo: 'Chrome',
              createdAt: 1,
              lastUsed: 100,
              expiresAt: 9999,
            },
          ]
        : [
            {
              tokenId: 'b',
              deviceInfo: 'Chrome',
              createdAt: 1,
              lastUsed: 200,
              expiresAt: 9999,
            },
          ]
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

  it('sorts users without activity after users with activity', async () => {
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [user('inactive', 'user'), user('active', 'user')],
      total: 2,
    });
    (db.getAllPlayRecords as jest.Mock).mockResolvedValue({});
    (getUserDevices as jest.Mock).mockImplementation(async (username) =>
      username === 'active'
        ? [
            {
              tokenId: 'a',
              deviceInfo: 'Chrome',
              createdAt: 1,
              lastUsed: 100,
              expiresAt: 9999,
            },
          ]
        : []
    );

    const result = await getUserActivityOverview({
      operatorUsername: 'owner',
      page: 1,
      limit: 20,
      search: '',
    });

    expect(result.users.map((item) => item.username)).toEqual([
      'active',
      'inactive',
    ]);
    expect(result.users[1].lastActiveAt).toBeNull();
  });

  it('filters admin overview to ordinary users and self', async () => {
    (db.getUserInfoV2 as jest.Mock).mockResolvedValue({
      role: 'admin',
      banned: false,
    });
    (db.getUserListV2 as jest.Mock).mockResolvedValue({
      users: [
        user('owner', 'owner'),
        user('admin', 'admin'),
        user('alice', 'user'),
      ],
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

    expect(result.users.map((item) => item.username).sort()).toEqual([
      'admin',
      'alice',
    ]);
  });

  it('returns detail records sorted newest first with user summary', async () => {
    (db.getUserInfoV2 as jest.Mock).mockResolvedValue({
      role: 'user',
      banned: false,
      created_at: 1,
    });
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

    expect(result.records.map((record) => record.title)).toEqual([
      'New',
      'Old',
    ]);
    expect(result.user).toEqual({
      username: 'alice',
      role: 'user',
      banned: false,
      lastActiveAt: null,
      playRecordCount: 2,
    });
  });
});
