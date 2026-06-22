import { GET } from './route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));

jest.mock('@/lib/anime-subscription', () => ({
  checkAnimeSubscriptions: jest.fn(),
}));
jest.mock('@/lib/config', () => ({
  getConfig: jest.fn(),
  refineConfig: jest.fn((config) => config),
}));
jest.mock('@/lib/db', () => ({
  db: {},
  getStorage: jest.fn(),
}));
jest.mock('@/lib/email.service', () => ({
  EmailService: { send: jest.fn() },
}));
jest.mock('@/lib/email.templates', () => ({
  getBatchFavoriteUpdateEmailTemplate: jest.fn(),
  getBatchMangaUpdateEmailTemplate: jest.fn(),
}));
jest.mock('@/lib/fetchVideoDetail', () => ({
  fetchVideoDetail: jest.fn(),
}));
jest.mock('@/lib/live', () => ({
  getLastGlobalLiveRefreshTime: jest.fn(),
  getLiveRefreshIntervalHours: jest.fn(),
  refreshLiveChannels: jest.fn(),
  setLastGlobalLiveRefreshTime: jest.fn(),
}));
jest.mock('@/lib/openlist-refresh', () => ({
  startOpenListRefresh: jest.fn(),
}));
jest.mock('@/lib/suwayomi.client', () => ({
  getSuwayomiConfig: jest.fn(),
  loginWithSimpleAuth: jest.fn(),
  SuwayomiClient: jest.fn(),
}));
jest.mock('@/lib/watch-rewards', () => ({
  settlePreviousWeekWatchRewards: jest.fn(),
}));

describe('GET /api/cron/[password]', () => {
  const originalCronPassword = process.env.CRON_PASSWORD;
  const originalPassword = process.env.PASSWORD;

  afterEach(() => {
    if (originalCronPassword === undefined) delete process.env.CRON_PASSWORD;
    else process.env.CRON_PASSWORD = originalCronPassword;

    if (originalPassword === undefined) delete process.env.PASSWORD;
    else process.env.PASSWORD = originalPassword;
  });

  it('does not accept the public legacy default password', async () => {
    delete process.env.CRON_PASSWORD;
    delete process.env.PASSWORD;

    const response = await GET(
      { url: 'https://example.com/api/cron/mtvpls' } as Parameters<typeof GET>[0],
      { params: { password: 'mtvpls' } }
    );

    expect(response.status).toBe(503);
  });
});
