import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordWatchTime } from '@/lib/watch-time';

import { POST } from './route';

jest.mock('next/server', () => ({
  NextResponse: class MockNextResponse {
    body: unknown;
    status: number;

    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }

    static json(body: unknown, init?: { status?: number }) {
      return {
        body,
        status: init?.status ?? 200,
      };
    }
  },
}));

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromCookie: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {
    getUserInfoV2: jest.fn(),
  },
}));

jest.mock('@/lib/watch-time', () => ({
  recordWatchTime: jest.fn(),
}));

const makeRequest = (body: unknown) =>
  ({
    json: async () => body,
  } as Parameters<typeof POST>[0]);

describe('POST /api/watch-time', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'alice' });
    (db.getUserInfoV2 as jest.Mock).mockResolvedValue({
      role: 'user',
      banned: false,
    });
    (recordWatchTime as jest.Mock).mockResolvedValue({
      acceptedSeconds: 20,
      totalWatchSeconds: 120,
    });
  });

  it('rejects missing auth', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue(null);

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
    expect(recordWatchTime).not.toHaveBeenCalled();
  });

  it('records an authenticated watch-time report', async () => {
    const response = await POST(
      makeRequest({
        source: 'source',
        id: 'movie',
        title: '沙丘',
        sourceName: '测试源',
        episode: 1,
        totalEpisodes: 1,
        totalTime: 7200,
        progressTime: 3600,
        deltaSeconds: 20,
      })
    );

    expect(response.status).toBe(200);
    expect(recordWatchTime).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'alice',
        source: 'source',
        id: 'movie',
        title: '沙丘',
        deltaSeconds: 20,
      })
    );
    expect(response.body).toEqual({
      success: true,
      acceptedSeconds: 20,
      totalWatchSeconds: 120,
    });
  });
});
