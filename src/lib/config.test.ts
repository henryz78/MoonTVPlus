import { AdminConfig } from './admin.types';
import { configSelfCheck } from './config';

jest.mock('@/lib/db', () => ({
  db: {},
}));

describe('configSelfCheck AI defaults', () => {
  const owner = process.env.USERNAME;

  beforeEach(() => {
    process.env.USERNAME = 'owner';
  });

  afterEach(() => {
    if (owner === undefined) {
      delete process.env.USERNAME;
    } else {
      process.env.USERNAME = owner;
    }
  });

  it('fills the visible AI system prompt default when missing', () => {
    const config = configSelfCheck({
      ConfigFile: '{}',
      ConfigSubscribtion: {
        URL: '',
        AutoUpdate: false,
        LastCheck: '',
      },
      SiteConfig: {
        SiteName: 'Test',
        Announcement: '',
        SearchDownstreamMaxPage: 5,
        SiteInterfaceCacheTime: 7200,
      },
      UserConfig: { Users: [] },
      SourceConfig: [],
      CustomCategories: [],
      LiveConfig: [],
      AIConfig: {
        Enabled: false,
        Provider: 'custom',
        EnableDecisionModel: false,
        EnableWebSearch: false,
        EnableHomepageEntry: true,
        EnableVideoCardEntry: true,
        EnablePlayPageEntry: true,
        EnableAIComments: false,
      },
    } as unknown as AdminConfig);

    expect(config.AIConfig?.SystemPrompt).toContain(
      '你是 MoonTVPlus 的 AI 影视助手'
    );
  });

  it('fills the announcement force-read default when missing', () => {
    const config = configSelfCheck({
      ConfigFile: '{}',
      ConfigSubscribtion: {
        URL: '',
        AutoUpdate: false,
        LastCheck: '',
      },
      SiteConfig: {
        SiteName: 'Test',
        Announcement: '公告内容',
        SearchDownstreamMaxPage: 5,
        SiteInterfaceCacheTime: 7200,
      },
      UserConfig: { Users: [] },
      SourceConfig: [],
      CustomCategories: [],
      LiveConfig: [],
    } as unknown as AdminConfig);

    expect(config.SiteConfig.AnnouncementForceRead).toBe(false);
  });

  it('fills the owner leaderboard participation default when missing', () => {
    const config = configSelfCheck({
      ConfigFile: '{}',
      ConfigSubscribtion: {
        URL: '',
        AutoUpdate: false,
        LastCheck: '',
      },
      SiteConfig: {
        SiteName: 'Test',
        Announcement: '公告内容',
        SearchDownstreamMaxPage: 5,
        SiteInterfaceCacheTime: 7200,
      },
      UserConfig: { Users: [] },
      SourceConfig: [],
      CustomCategories: [],
      LiveConfig: [],
    } as unknown as AdminConfig);

    expect(config.SiteConfig.LeaderboardOwnerParticipates).toBe(false);
  });

  it('fills watch room config from legacy environment variables when missing', () => {
    const originalWatchRoomEnabled = process.env.WATCH_ROOM_ENABLED;
    const originalWatchRoomServerType = process.env.WATCH_ROOM_SERVER_TYPE;
    const originalWatchRoomExternalServerUrl =
      process.env.WATCH_ROOM_EXTERNAL_SERVER_URL;
    const originalWatchRoomExternalServerAuth =
      process.env.WATCH_ROOM_EXTERNAL_SERVER_AUTH;

    try {
      process.env.WATCH_ROOM_ENABLED = 'true';
      process.env.WATCH_ROOM_SERVER_TYPE = 'external';
      process.env.WATCH_ROOM_EXTERNAL_SERVER_URL =
        'wss://watch-room.example.com';
      process.env.WATCH_ROOM_EXTERNAL_SERVER_AUTH = 'secret';

      const config = configSelfCheck({
        ConfigFile: '{}',
        ConfigSubscribtion: {
          URL: '',
          AutoUpdate: false,
          LastCheck: '',
        },
        SiteConfig: {
          SiteName: 'Test',
          Announcement: '公告内容',
          SearchDownstreamMaxPage: 5,
          SiteInterfaceCacheTime: 7200,
        },
        UserConfig: { Users: [] },
        SourceConfig: [],
        CustomCategories: [],
        LiveConfig: [],
      } as unknown as AdminConfig);

      expect(config.WatchRoomConfig).toEqual({
        Enabled: true,
        ServerType: 'external',
        ExternalServerUrl: 'wss://watch-room.example.com',
        ExternalServerAuth: 'secret',
      });
    } finally {
      if (originalWatchRoomEnabled === undefined) {
        delete process.env.WATCH_ROOM_ENABLED;
      } else {
        process.env.WATCH_ROOM_ENABLED = originalWatchRoomEnabled;
      }
      if (originalWatchRoomServerType === undefined) {
        delete process.env.WATCH_ROOM_SERVER_TYPE;
      } else {
        process.env.WATCH_ROOM_SERVER_TYPE = originalWatchRoomServerType;
      }
      if (originalWatchRoomExternalServerUrl === undefined) {
        delete process.env.WATCH_ROOM_EXTERNAL_SERVER_URL;
      } else {
        process.env.WATCH_ROOM_EXTERNAL_SERVER_URL =
          originalWatchRoomExternalServerUrl;
      }
      if (originalWatchRoomExternalServerAuth === undefined) {
        delete process.env.WATCH_ROOM_EXTERNAL_SERVER_AUTH;
      } else {
        process.env.WATCH_ROOM_EXTERNAL_SERVER_AUTH =
          originalWatchRoomExternalServerAuth;
      }
    }
  });
});
