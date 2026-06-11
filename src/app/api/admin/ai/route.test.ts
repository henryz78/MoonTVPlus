import { DEFAULT_AI_SYSTEM_PROMPT } from '@/lib/ai-defaults';
import { AdminConfig } from '@/lib/admin.types';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig, setCachedConfig } from '@/lib/config';
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
    AIConfig: {
      Enabled: false,
      Provider: 'custom',
      EnableDecisionModel: false,
      EnableWebSearch: false,
      EnableHomepageEntry: true,
      EnableVideoCardEntry: true,
      EnablePlayPageEntry: true,
      EnableAIComments: false,
      SystemPrompt: 'old custom prompt',
    },
  } as unknown as AdminConfig);

const makeAIConfigBody = (systemPrompt: string) => ({
  Enabled: true,
  Provider: 'custom',
  CustomApiKey: 'key',
  CustomBaseURL: 'https://example.com/v1',
  CustomModel: 'model',
  EnableDecisionModel: true,
  DecisionProvider: 'custom',
  DecisionCustomModel: 'decision-model',
  EnableWebSearch: false,
  EnableHomepageEntry: true,
  EnableVideoCardEntry: true,
  EnablePlayPageEntry: true,
  EnableAIComments: false,
  Temperature: 0.7,
  MaxTokens: 1000,
  SystemPrompt: systemPrompt,
  EnableStreaming: true,
});

describe('POST /api/admin/ai', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;
  const originalUsername = process.env.USERNAME;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    process.env.USERNAME = 'owner';
    jest.clearAllMocks();
    (getAuthInfoFromCookie as jest.Mock).mockReturnValue({ username: 'owner' });
    (getConfig as jest.Mock).mockResolvedValue(makeConfig());
  });

  afterEach(() => {
    if (originalStorageType === undefined) {
      delete process.env.NEXT_PUBLIC_STORAGE_TYPE;
    } else {
      process.env.NEXT_PUBLIC_STORAGE_TYPE = originalStorageType;
    }

    if (originalUsername === undefined) {
      delete process.env.USERNAME;
    } else {
      process.env.USERNAME = originalUsername;
    }
  });

  it('saves the visible default system prompt when the submitted prompt is blank', async () => {
    const response = await POST(makeRequest(makeAIConfigBody('   ')));

    expect(response.status).toBe(200);
    expect(db.saveAdminConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        AIConfig: expect.objectContaining({
          SystemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
        }),
      })
    );
    expect(setCachedConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        AIConfig: expect.objectContaining({
          SystemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
        }),
      })
    );
  });
});
