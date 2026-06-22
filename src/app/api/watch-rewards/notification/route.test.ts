import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  getCurrentWatchReward,
  getWeeklyWatchNotification,
  markWeeklyWatchNotificationRead,
} from '@/lib/watch-rewards';

import { GET as GET_CURRENT } from '../current/route';
import { POST as POST_READ } from '../notification/read/route';
import { GET } from './route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
    }),
  },
}));

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromCookie: jest.fn(),
}));

jest.mock('@/lib/watch-rewards', () => ({
  getCurrentWatchReward: jest.fn(),
  getWeeklyWatchNotification: jest.fn(),
  markWeeklyWatchNotificationRead: jest.fn(),
}));

const makeRequest = () =>
  ({ url: 'https://example.com' } as Parameters<typeof GET>[0]);

describe('watch reward notification APIs', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'alice' });
    (getWeeklyWatchNotification as jest.Mock).mockResolvedValue({
      weekLabel: '2026-06-15 - 2026-06-21',
      rank: 1,
      reward: { level: 3, title: '本周追剧达人', minSeconds: 25200 },
    });
    (getCurrentWatchReward as jest.Mock).mockResolvedValue({
      weekLabel: '2026-06-15 - 2026-06-21',
      rank: 1,
      reward: { level: 3, title: '本周追剧达人', minSeconds: 25200 },
    });
  });

  afterEach(() => {
    if (originalStorageType === undefined) {
      delete process.env.NEXT_PUBLIC_STORAGE_TYPE;
    } else {
      process.env.NEXT_PUBLIC_STORAGE_TYPE = originalStorageType;
    }
  });

  it('returns the pending weekly notification', async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      notification: {
        weekLabel: '2026-06-15 - 2026-06-21',
        rank: 1,
        reward: { level: 3, title: '本周追剧达人', minSeconds: 25200 },
      },
    });
    expect(getWeeklyWatchNotification).toHaveBeenCalledWith('alice');
  });

  it('marks the pending notification as read', async () => {
    const response = await POST_READ({
      url: 'https://example.com',
      json: async () => ({ settlementId: 'weekly-2026-06-15' }),
    } as Parameters<typeof POST_READ>[0]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(markWeeklyWatchNotificationRead).toHaveBeenCalledWith(
      'alice',
      'weekly-2026-06-15'
    );
  });

  it('returns the current active reward', async () => {
    const response = await GET_CURRENT(makeRequest());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      reward: {
        weekLabel: '2026-06-15 - 2026-06-21',
        rank: 1,
        reward: { level: 3, title: '本周追剧达人', minSeconds: 25200 },
      },
    });
    expect(getCurrentWatchReward).toHaveBeenCalledWith('alice');
  });

  it('rejects missing auth', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue(null);

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
    expect(getWeeklyWatchNotification).not.toHaveBeenCalled();
  });
});
