import { getAuthInfoFromCookie } from '@/lib/auth';
import { touchRefreshTokenLastUsed } from '@/lib/refresh-token';

import { POST } from './route';

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

jest.mock('@/lib/refresh-token', () => ({
  touchRefreshTokenLastUsed: jest.fn(),
}));

const makeRequest = () => ({}) as Parameters<typeof POST>[0];

describe('POST /api/auth/activity', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({
      username: 'alice',
      tokenId: 'token-1',
      refreshToken: 'refresh-1',
      refreshExpires: Date.now() + 60_000,
    });
    (touchRefreshTokenLastUsed as jest.Mock).mockResolvedValue(true);
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

    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: '本地存储模式不支持活跃状态上报' });
    expect(touchRefreshTokenLastUsed).not.toHaveBeenCalled();
  });

  it('rejects missing auth fields', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'alice' });

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
    expect(touchRefreshTokenLastUsed).not.toHaveBeenCalled();
  });

  it('rejects expired refresh token metadata', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({
      username: 'alice',
      tokenId: 'token-1',
      refreshToken: 'refresh-1',
      refreshExpires: Date.now() - 1,
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Refresh token expired' });
    expect(touchRefreshTokenLastUsed).not.toHaveBeenCalled();
  });

  it('updates the current device lastUsed', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(touchRefreshTokenLastUsed).toHaveBeenCalledWith('alice', 'token-1');
  });

  it('returns unauthorized when the token record cannot be touched', async () => {
    (touchRefreshTokenLastUsed as jest.Mock).mockResolvedValue(false);

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });
});
