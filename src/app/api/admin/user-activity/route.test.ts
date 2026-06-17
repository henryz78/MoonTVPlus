import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  getUserActivityDetail,
  getUserActivityOverview,
} from '@/lib/admin-user-activity';

import { GET as GET_DETAIL } from './[username]/route';
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

jest.mock('@/lib/admin-user-activity', () => ({
  getUserActivityDetail: jest.fn(),
  getUserActivityOverview: jest.fn(),
}));

const makeRequest = (url: string) =>
  ({
    url,
  } as Parameters<typeof GET>[0]);

describe('GET /api/admin/user-activity', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'owner' });
    (getUserActivityOverview as jest.Mock).mockResolvedValue({
      users: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
    (getUserActivityDetail as jest.Mock).mockResolvedValue({
      user: {
        username: 'alice',
        role: 'user',
        banned: false,
        lastActiveAt: null,
        playRecordCount: 0,
      },
      records: [],
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
      makeRequest('https://example.com/api/admin/user-activity')
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: '本地存储模式不支持用户动态查询' });
    expect(getUserActivityOverview).not.toHaveBeenCalled();
  });

  it('rejects missing auth', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue(null);

    const response = await GET(
      makeRequest('https://example.com/api/admin/user-activity')
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
    expect(getUserActivityOverview).not.toHaveBeenCalled();
  });

  it('returns overview data with normalized query params', async () => {
    const response = await GET(
      makeRequest(
        'https://example.com/api/admin/user-activity?page=2&limit=30&search=ali'
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(response.body).toEqual({
      users: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
    expect(getUserActivityOverview).toHaveBeenCalledWith({
      operatorUsername: 'owner',
      page: 2,
      limit: 30,
      search: 'ali',
    });
  });

  it('uses service error status for overview failures', async () => {
    (getUserActivityOverview as jest.Mock).mockRejectedValue(
      Object.assign(new Error('权限不足'), { status: 401 })
    );

    const response = await GET(
      makeRequest('https://example.com/api/admin/user-activity')
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: '权限不足' });
  });

  it('returns detail data for one target username', async () => {
    const response = await GET_DETAIL(
      makeRequest('https://example.com/api/admin/user-activity/alice'),
      { params: { username: 'alice' } }
    );

    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(getUserActivityDetail).toHaveBeenCalledWith({
      operatorUsername: 'owner',
      targetUsername: 'alice',
    });
  });

  it('rejects missing detail target username', async () => {
    const response = await GET_DETAIL(
      makeRequest('https://example.com/api/admin/user-activity/%20'),
      { params: { username: ' ' } }
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: '缺少目标用户名' });
    expect(getUserActivityDetail).not.toHaveBeenCalled();
  });

  it('uses service error status for detail failures', async () => {
    (getUserActivityDetail as jest.Mock).mockRejectedValue(
      Object.assign(new Error('目标用户不存在'), { status: 404 })
    );

    const response = await GET_DETAIL(
      makeRequest('https://example.com/api/admin/user-activity/missing'),
      { params: { username: 'missing' } }
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: '目标用户不存在' });
  });
});
