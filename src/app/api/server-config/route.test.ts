import { AdminConfig } from '@/lib/admin.types';
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
      EnableRegistration: false,
      RequireRegistrationInviteCode: false,
      RegistrationRequireEmailVerification: false,
      RegistrationEmailDomainAllowlist: [],
      RegistrationBlockEmailAliases: false,
      RegistrationRequireApproval: false,
      RegistrationApprovalQuestion: '',
      RegistrationRequireTurnstile: false,
      LoginRequireTurnstile: false,
      TurnstileSiteKey: '',
      EnableOIDCLogin: false,
      EnableOIDCRegistration: false,
      OIDCButtonText: '',
      DanmakuAutoLoadDefault: true,
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

describe('GET /api/server-config', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;
  const originalLiteMode = process.env.MOONTV_LITE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    delete process.env.MOONTV_LITE;
    jest.clearAllMocks();
    (getConfig as jest.Mock).mockResolvedValue(makeConfig());
  });

  afterEach(() => {
    if (originalStorageType === undefined) {
      delete process.env.NEXT_PUBLIC_STORAGE_TYPE;
    } else {
      process.env.NEXT_PUBLIC_STORAGE_TYPE = originalStorageType;
    }

    if (originalLiteMode === undefined) {
      delete process.env.MOONTV_LITE;
    } else {
      process.env.MOONTV_LITE = originalLiteMode;
    }
  });

  it('returns public watch room config from admin config without auth secret', async () => {
    const response = await GET({
      url: 'https://example.com/api/server-config',
    } as Parameters<typeof GET>[0]);
    const body = (
      response as unknown as { body: { WatchRoom: Record<string, unknown> } }
    ).body;

    expect(response.status).toBe(200);
    expect(body.WatchRoom).toEqual({
      enabled: true,
      serverType: 'external',
      externalServerUrl: 'wss://watch-room.example.com',
    });
    expect(body.WatchRoom).not.toHaveProperty('externalServerAuth');
  });

  it('disables watch room in lite mode', async () => {
    process.env.MOONTV_LITE = 'true';

    const response = await GET({
      url: 'https://example.com/api/server-config',
    } as Parameters<typeof GET>[0]);
    const body = (
      response as unknown as { body: { WatchRoom: Record<string, unknown> } }
    ).body;

    expect(body.WatchRoom).toEqual({
      enabled: false,
      serverType: 'external',
      externalServerUrl: undefined,
    });
  });

  it('hides external server URL when watch room is disabled', async () => {
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
      url: 'https://example.com/api/server-config',
    } as Parameters<typeof GET>[0]);
    const body = (
      response as unknown as { body: { WatchRoom: Record<string, unknown> } }
    ).body;

    expect(body.WatchRoom).toEqual({
      enabled: false,
      serverType: 'external',
      externalServerUrl: undefined,
    });
  });

  it('hides external server URL when internal watch room is selected', async () => {
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
      url: 'https://example.com/api/server-config',
    } as Parameters<typeof GET>[0]);
    const body = (
      response as unknown as { body: { WatchRoom: Record<string, unknown> } }
    ).body;

    expect(body.WatchRoom).toEqual({
      enabled: true,
      serverType: 'internal',
      externalServerUrl: undefined,
    });
  });
});
