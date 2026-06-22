import { AdminConfig } from '@/lib/admin.types';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

import { POST } from './route';

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
  setCachedConfig: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {
    getUserInfoV2: jest.fn(),
    saveAdminConfig: jest.fn(),
  },
}));

const makeRequest = (body: Record<string, unknown>) =>
  ({
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Parameters<typeof POST>[0]);

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
      Enabled: false,
      ServerType: 'internal',
      ExternalServerUrl: '',
      ExternalServerAuth: '',
    },
  } as unknown as AdminConfig);

describe('POST /api/admin/watch-room', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    jest.clearAllMocks();
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({
      username: 'admin',
      role: 'admin',
    });
    (getConfig as jest.Mock).mockResolvedValue(makeConfig());
    (db.getUserInfoV2 as jest.Mock).mockResolvedValue({
      username: 'admin',
      role: 'admin',
      banned: false,
    });
  });

  afterEach(() => {
    if (originalStorageType === undefined) {
      delete process.env.NEXT_PUBLIC_STORAGE_TYPE;
    } else {
      process.env.NEXT_PUBLIC_STORAGE_TYPE = originalStorageType;
    }
  });

  it('saves the watch room config into admin config', async () => {
    const response = await POST(
      makeRequest({
        Enabled: true,
        ServerType: 'external',
        ExternalServerUrl: 'wss://watch-room.example.com',
        ExternalServerAuth: 'secret',
      })
    );

    expect(response.status).toBe(200);
    expect(db.saveAdminConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        WatchRoomConfig: {
          Enabled: true,
          ServerType: 'external',
          ExternalServerUrl: 'wss://watch-room.example.com',
          ExternalServerAuth: 'secret',
        },
      })
    );
  });

  it('rejects localstorage mode because admin settings need server storage', async () => {
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'localstorage';

    const response = await POST(
      makeRequest({
        Enabled: true,
        ServerType: 'external',
      })
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: '不支持本地存储进行管理员配置',
    });
  });

  it('rejects banned admins from changing watch room config', async () => {
    (db.getUserInfoV2 as jest.Mock).mockResolvedValue({
      username: 'admin',
      role: 'admin',
      banned: true,
    });

    const response = await POST(
      makeRequest({
        Enabled: true,
        ServerType: 'external',
      })
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: '权限不足' });
    expect(db.saveAdminConfig).not.toHaveBeenCalled();
  });
});
