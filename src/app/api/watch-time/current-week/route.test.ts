import { getAuthInfoFromCookie } from '@/lib/auth';
import { getCurrentWeekWatchTime } from '@/lib/watch-time';

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

jest.mock('@/lib/watch-time', () => ({
  getCurrentWeekWatchTime: jest.fn(),
}));

const makeRequest = (url: string) =>
  ({
    url,
  } as Parameters<typeof GET>[0]);

describe('GET /api/watch-time/current-week', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'alice' });
    (getCurrentWeekWatchTime as jest.Mock).mockResolvedValue({
      watchSeconds: 5400,
      weekStartAt: 100,
      weekEndAt: 200,
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
      makeRequest('https://example.com/api/watch-time/current-week')
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: '本地存储模式不支持观影时长统计',
    });
    expect(getCurrentWeekWatchTime).not.toHaveBeenCalled();
  });

  it('rejects missing auth', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue(null);

    const response = await GET(
      makeRequest('https://example.com/api/watch-time/current-week')
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns current-week watch time for the authenticated user', async () => {
    const response = await GET(
      makeRequest('https://example.com/api/watch-time/current-week')
    );

    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(getCurrentWeekWatchTime).toHaveBeenCalledWith('alice');
    expect(response.body).toEqual({
      watchSeconds: 5400,
      weekStartAt: 100,
      weekEndAt: 200,
    });
  });
});
