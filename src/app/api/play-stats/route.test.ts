import { getAuthInfoFromCookie } from '@/lib/auth';
import { getOnlineCount, getPlayStats } from '@/lib/play-stats';

import { GET } from './route';
import { GET as GET_ONLINE_COUNT } from '../online-count/route';

jest.mock('next/server', () => ({
  NextResponse: class MockNextResponse {
    body: unknown;
    status: number;
    headers: Record<string, string>;

    constructor(
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = init?.headers ?? {};
    }

    static json(
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) {
      return {
        body,
        status: init?.status ?? 200,
        headers: init?.headers ?? {},
      };
    }
  },
}));

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromCookie: jest.fn(),
}));

jest.mock('@/lib/play-stats', () => ({
  getOnlineCount: jest.fn(),
  getPlayStats: jest.fn(),
}));

const makeRequest = (url: string) =>
  ({
    url,
  } as Parameters<typeof GET>[0]);

describe('GET /api/play-stats', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'alice' });
    (getPlayStats as jest.Mock).mockResolvedValue({
      viewerRole: 'user',
      totalUsers: 1,
      onlineUsers: 1,
      totalPlayRecords: 2,
      todayActiveUsers: 1,
      last7DaysActiveUsers: 1,
      todayPlayRecords: 1,
      last7DaysPlayRecords: 2,
      lastWatchAt: 100,
      topTitles: [],
      userRanking: [],
      recentRecords: [],
    });
    (getOnlineCount as jest.Mock).mockResolvedValue(3);
  });

  afterEach(() => {
    if (originalStorageType === undefined) {
      delete process.env.NEXT_PUBLIC_STORAGE_TYPE;
    } else {
      process.env.NEXT_PUBLIC_STORAGE_TYPE = originalStorageType;
    }
  });

  it('rejects localStorage mode for play stats', async () => {
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'localstorage';

    const response = await GET(
      makeRequest('https://example.com/api/play-stats')
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: '本地存储模式不支持播放统计' });
    expect(getPlayStats).not.toHaveBeenCalled();
  });

  it('rejects missing auth for play stats', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue(null);

    const response = await GET(
      makeRequest('https://example.com/api/play-stats')
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
    expect(getPlayStats).not.toHaveBeenCalled();
  });

  it('returns scoped play stats for the authenticated user', async () => {
    const response = await GET(
      makeRequest('https://example.com/api/play-stats')
    );

    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(getPlayStats).toHaveBeenCalledWith({ operatorUsername: 'alice' });
    expect(response.body).toMatchObject({
      viewerRole: 'user',
      totalUsers: 1,
      totalPlayRecords: 2,
    });
  });

  it('returns only the online count for public homepage use', async () => {
    const response = await GET_ONLINE_COUNT();

    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(response.body).toEqual({ onlineCount: 3 });
  });

  it('hides online count in localStorage mode', async () => {
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'localstorage';

    const response = await GET_ONLINE_COUNT();

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(getOnlineCount).not.toHaveBeenCalled();
  });
});
