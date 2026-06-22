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

  it('fills the watch room default from the legacy environment switch when missing', () => {
    const originalWatchRoomEnabled = process.env.WATCH_ROOM_ENABLED;
    const originalLiteMode = process.env.MOONTV_LITE;
    try {
      process.env.WATCH_ROOM_ENABLED = 'true';
      delete process.env.MOONTV_LITE;

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

      expect(config.SiteConfig.EnableWatchRoom).toBe(true);
    } finally {
      if (originalWatchRoomEnabled === undefined) {
        delete process.env.WATCH_ROOM_ENABLED;
      } else {
        process.env.WATCH_ROOM_ENABLED = originalWatchRoomEnabled;
      }
      if (originalLiteMode === undefined) {
        delete process.env.MOONTV_LITE;
      } else {
        process.env.MOONTV_LITE = originalLiteMode;
      }
    }
  });
});
