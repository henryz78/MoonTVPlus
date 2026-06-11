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
});
