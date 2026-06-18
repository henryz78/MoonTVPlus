import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import {
  approveRegistrationRequest,
  rejectRegistrationRequest,
} from '@/lib/registration-approval';

import { GET, POST } from './route';

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

jest.mock('@/lib/config', () => ({
  getConfig: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {
    getUserInfoV2: jest.fn(),
    getRegistrationRequest: jest.fn(),
  },
}));

jest.mock('@/lib/registration-approval', () => ({
  approveRegistrationRequest: jest.fn(),
  rejectRegistrationRequest: jest.fn(),
}));

const makeRequest = (body?: unknown) =>
  ({
    json: async () => body,
  } as Parameters<typeof POST>[0]);

const params = { params: { id: 'reg_1' } };

describe('/api/admin/registration-requests/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    process.env.USERNAME = 'owner';
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'owner' });
    (getConfig as jest.Mock).mockResolvedValue({
      SiteConfig: {},
      UserConfig: { Users: [] },
    });
    (db.getRegistrationRequest as jest.Mock).mockResolvedValue({
      id: 'reg_1',
      username: 'alice',
      passwordHash: 'secret',
      status: 'pending',
      createdAt: 1,
      updatedAt: 1,
    });
    (approveRegistrationRequest as jest.Mock).mockResolvedValue({
      id: 'reg_1',
      username: 'alice',
      passwordHash: 'secret',
      status: 'approved',
      createdAt: 1,
      updatedAt: 2,
    });
    (rejectRegistrationRequest as jest.Mock).mockResolvedValue({
      id: 'reg_1',
      username: 'alice',
      passwordHash: 'secret',
      status: 'rejected',
      createdAt: 1,
      updatedAt: 2,
      rejectReason: '资料不完整',
    });
  });

  it('returns detail without passwordHash', async () => {
    const response = await GET(makeRequest(), params);
    const body = response.body as any;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      request: {
        id: 'reg_1',
        username: 'alice',
        status: 'pending',
        createdAt: 1,
        updatedAt: 1,
      },
    });
  });

  it('approves a request', async () => {
    const response = await POST(makeRequest({ action: 'approve' }), params);
    const body = response.body as any;

    expect(response.status).toBe(200);
    expect(approveRegistrationRequest).toHaveBeenCalledWith(
      db,
      expect.any(Object),
      'reg_1',
      'owner'
    );
    expect(body.request.passwordHash).toBeUndefined();
    expect(body.request.status).toBe('approved');
  });

  it('rejects a request with reason', async () => {
    const response = await POST(
      makeRequest({ action: 'reject', reason: '资料不完整' }),
      params
    );
    const body = response.body as any;

    expect(response.status).toBe(200);
    expect(rejectRegistrationRequest).toHaveBeenCalledWith(
      db,
      'reg_1',
      'owner',
      '资料不完整'
    );
    expect(body.request.passwordHash).toBeUndefined();
    expect(body.request.status).toBe('rejected');
  });
});
