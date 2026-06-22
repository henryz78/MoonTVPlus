import { AdminConfig } from '@/lib/admin.types';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';

import { GET } from './route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromCookie: jest.fn(),
}));

jest.mock('@/lib/config', () => ({
  getConfig: jest.fn(),
}));

const makeConfig = (): AdminConfig =>
  ({
    ConfigFile: '{}',
    ConfigSubscribtion: {
      URL: '',
      AutoUpdate: false,
      LastCheck: '',
    },
    SiteConfig: {
      SiteName: 'HYTV',
      Announcement: '',
      SearchDownstreamMaxPage: 5,
      SiteInterfaceCacheTime: 7200,
    },
    UserConfig: { Users: [] },
    SourceConfig: [],
    CustomCategories: [],
    LiveConfig: [],
    WatchRoomConfig: {
      Enabled: true,
      ServerType: 'external',
      ExternalServerUrl: 'wss://watch-room.example.com',
      ExternalServerAuth: 'secret',
    },
  } as unknown as AdminConfig);

describe('GET /api/watch-room-auth', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    jest.clearAllMocks();
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'user' });
    (getConfig as jest.Mock).mockResolvedValue(makeConfig());
  });

  afterEach(() => {
    if (originalStorageType === undefined) {
      delete process.env.NEXT_PUBLIC_STORAGE_TYPE;
    } else {
      process.env.NEXT_PUBLIC_STORAGE_TYPE = originalStorageType;
    }
  });

  it('returns the configured auth value for the official external server', async () => {
    const response = await GET({
      url: 'https://example.com/api/watch-room-auth',
    } as Parameters<typeof GET>[0]);
    const body = (
      response as unknown as { body: { externalServerAuth: string } }
    ).body;

    expect(response.status).toBe(200);
    expect(body.externalServerAuth).toBe('secret');
  });

  it('rejects guests', async () => {
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue(null);

    const response = await GET({
      url: 'https://example.com/api/watch-room-auth',
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns null auth when watch room is disabled', async () => {
    (getConfig as jest.Mock).mockResolvedValue({
      ...makeConfig(),
      WatchRoomConfig: {
        Enabled: false,
        ServerType: 'external',
        ExternalServerUrl: 'wss://watch-room.example.com',
        ExternalServerAuth: 'secret',
      },
    });

    const response = await GET({
      url: 'https://example.com/api/watch-room-auth',
    } as Parameters<typeof GET>[0]);
    const body = (
      response as unknown as { body: { externalServerAuth: string | null } }
    ).body;

    expect(response.status).toBe(200);
    expect(body.externalServerAuth).toBeNull();
  });

  it('returns null auth when internal watch room is selected', async () => {
    (getConfig as jest.Mock).mockResolvedValue({
      ...makeConfig(),
      WatchRoomConfig: {
        Enabled: true,
        ServerType: 'internal',
        ExternalServerUrl: 'wss://watch-room.example.com',
        ExternalServerAuth: 'secret',
      },
    });

    const response = await GET({
      url: 'https://example.com/api/watch-room-auth',
    } as Parameters<typeof GET>[0]);
    const body = (
      response as unknown as { body: { externalServerAuth: string | null } }
    ).body;

    expect(response.status).toBe(200);
    expect(body.externalServerAuth).toBeNull();
  });
});
