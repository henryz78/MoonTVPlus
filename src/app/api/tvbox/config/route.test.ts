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
    getTvboxSubscribeToken: jest.fn(),
    setTvboxSubscribeToken: jest.fn(),
  },
}));

const makeRequest = (url: string) =>
  ({
    url,
    nextUrl: new URL(url),
  } as Parameters<typeof GET>[0]);

describe('GET /api/tvbox/config', () => {
  const originalEnable = process.env.ENABLE_TVBOX_SUBSCRIBE;
  const originalGlobalToken = process.env.TVBOX_SUBSCRIBE_TOKEN;
  const originalSiteBase = process.env.SITE_BASE;

  beforeEach(() => {
    process.env.ENABLE_TVBOX_SUBSCRIBE = 'true';
    process.env.TVBOX_SUBSCRIBE_TOKEN = 'global-secret-token';
    delete process.env.SITE_BASE;
    jest.clearAllMocks();
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({
      username: 'alice',
    });
    (db.getTvboxSubscribeToken as jest.Mock).mockResolvedValue(
      'user-token-alice'
    );
  });

  afterEach(() => {
    if (originalEnable === undefined) {
      delete process.env.ENABLE_TVBOX_SUBSCRIBE;
    } else {
      process.env.ENABLE_TVBOX_SUBSCRIBE = originalEnable;
    }
    if (originalGlobalToken === undefined) {
      delete process.env.TVBOX_SUBSCRIBE_TOKEN;
    } else {
      process.env.TVBOX_SUBSCRIBE_TOKEN = originalGlobalToken;
    }
    if (originalSiteBase === undefined) {
      delete process.env.SITE_BASE;
    } else {
      process.env.SITE_BASE = originalSiteBase;
    }
  });

  it('builds the subscribe URL with the user token instead of the global token', async () => {
    const response = await GET(
      makeRequest('https://app.example/api/tvbox/config?origin=https://app.example')
    );
    const body = (response as unknown as { body: { url: string } }).body;

    expect(response.status).toBe(200);
    expect(body.url).toContain('token=user-token-alice');
    expect(body.url).not.toContain('global-secret-token');
  });
});
