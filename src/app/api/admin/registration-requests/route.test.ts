import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';

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

jest.mock('@/lib/db', () => ({
  db: {
    getUserInfoV2: jest.fn(),
    getAllRegistrationRequests: jest.fn(),
  },
}));

const makeRequest = (url: string) =>
  ({
    url,
  } as Parameters<typeof GET>[0]);

describe('GET /api/admin/registration-requests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    process.env.USERNAME = 'owner';
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'owner' });
    (db.getAllRegistrationRequests as jest.Mock).mockResolvedValue([
      {
        id: 'reg_1',
        username: 'alice',
        passwordHash: 'secret',
        status: 'pending',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
  });

  it('rejects localStorage mode', async () => {
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'localstorage';

    const response = await GET(
      makeRequest('https://example.com/api/admin/registration-requests')
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: '本地存储模式不支持注册审批' });
  });

  it('rejects non-admin users', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'bob' });
    (db.getUserInfoV2 as jest.Mock).mockResolvedValue({
      role: 'user',
      banned: false,
    });

    const response = await GET(
      makeRequest('https://example.com/api/admin/registration-requests')
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: '权限不足' });
  });

  it('lists requests without passwordHash', async () => {
    const response = await GET(
      makeRequest(
        'https://example.com/api/admin/registration-requests?status=pending'
      )
    );

    expect(response.status).toBe(200);
    expect(db.getAllRegistrationRequests).toHaveBeenCalledWith('pending');
    expect(response.body).toEqual({
      requests: [
        {
          id: 'reg_1',
          username: 'alice',
          status: 'pending',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
  });
});
