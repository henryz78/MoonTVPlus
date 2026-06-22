import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  getAllTimeWatchLeaderboard,
  getWeeklyWatchLeaderboard,
} from '@/lib/watch-rewards';

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
  getAllTimeWatchLeaderboard: jest.fn(),
  getWeeklyWatchLeaderboard: jest.fn(),
}));

const makeRequest = (url: string) =>
  ({
    url,
  } as Parameters<typeof GET>[0]);

describe('GET /api/watch-leaderboard', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'alice' });
    (getWeeklyWatchLeaderboard as jest.Mock).mockResolvedValue({
      type: 'weekly',
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
      rows: [],
    });
    (getAllTimeWatchLeaderboard as jest.Mock).mockResolvedValue({
      type: 'all-time',
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
      rows: [],
    });
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

    const response = await GET(
      makeRequest('https://example.com/api/watch-leaderboard')
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: '本地存储模式不支持观影排行榜' });
    expect(getWeeklyWatchLeaderboard).not.toHaveBeenCalled();
  });

  it('rejects missing auth', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue(null);

    const response = await GET(
      makeRequest('https://example.com/api/watch-leaderboard')
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns weekly leaderboard by default', async () => {
    const response = await GET(
      makeRequest('https://example.com/api/watch-leaderboard?page=2&limit=20')
    );

    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(getWeeklyWatchLeaderboard).toHaveBeenCalledWith({
      viewerUsername: 'alice',
      page: 2,
      limit: 10,
    });
  });

  it('returns all-time leaderboard when requested', async () => {
    const response = await GET(
      makeRequest('https://example.com/api/watch-leaderboard?type=all-time')
    );

    expect(response.status).toBe(200);
    expect(getAllTimeWatchLeaderboard).toHaveBeenCalledWith({
      viewerUsername: 'alice',
      page: 1,
      limit: 10,
    });
  });
});
