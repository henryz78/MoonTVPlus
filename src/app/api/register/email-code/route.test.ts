import { POST } from './route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/config', () => ({
  getConfig: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {
    checkUserExistV2: jest.fn(),
    findRegistrationRequestByUsername: jest.fn(),
    findRegistrationRequestByEmail: jest.fn(),
    findUserByEmail: jest.fn(),
    getGlobalValue: jest.fn(),
    setGlobalValue: jest.fn(),
    deleteGlobalValue: jest.fn(),
  },
}));

jest.mock('@/lib/email.service', () => ({
  EmailService: { send: jest.fn() },
}));

const makeRequest = (body: unknown) =>
  ({
    json: async () => body,
  } as Parameters<typeof POST>[0]);

describe('POST /api/register/email-code', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
  });

  it('rejects disallowed domains with allowed-domain text', async () => {
    const { getConfig } = await import('@/lib/config');
    (getConfig as jest.Mock).mockResolvedValue({
      SiteConfig: {
        EnableRegistration: true,
        RegistrationRequireEmailVerification: true,
        RegistrationEmailDomainAllowlist: ['gmail.com'],
      },
      EmailConfig: { enabled: true, provider: 'smtp', smtp: {} },
    });

    const response = await POST(
      makeRequest({ username: 'alice', email: 'alice@example.com' })
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: '当前邮箱域名不在允许列表中，请使用以下域名邮箱：gmail.com',
    });
  });

  it('stores a code and sends email for a valid request', async () => {
    const { getConfig } = await import('@/lib/config');
    const { db } = await import('@/lib/db');
    const { EmailService } = await import('@/lib/email.service');

    (getConfig as jest.Mock).mockResolvedValue({
      SiteConfig: {
        SiteName: 'HYTV',
        EnableRegistration: true,
        RegistrationRequireEmailVerification: true,
        RegistrationEmailDomainAllowlist: ['gmail.com'],
      },
      EmailConfig: {
        enabled: true,
        provider: 'smtp',
        smtp: { host: 'smtp.example.com' },
      },
    });
    (db.checkUserExistV2 as jest.Mock).mockResolvedValue(false);
    (db.findRegistrationRequestByUsername as jest.Mock).mockResolvedValue(null);
    (db.findRegistrationRequestByEmail as jest.Mock).mockResolvedValue(null);
    (db.findUserByEmail as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      makeRequest({ username: 'alice', email: 'Alice@GMAIL.COM' })
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, message: '验证码已发送' });
    expect(db.setGlobalValue).toHaveBeenCalled();
    expect(EmailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
      expect.objectContaining({
        to: 'Alice@gmail.com',
        subject: 'HYTV 注册验证码',
      })
    );
  });

  it('rejects repeated sends during cooldown', async () => {
    const { getConfig } = await import('@/lib/config');
    const { db } = await import('@/lib/db');

    (getConfig as jest.Mock).mockResolvedValue({
      SiteConfig: {
        SiteName: 'HYTV',
        EnableRegistration: true,
        RegistrationRequireEmailVerification: true,
        RegistrationEmailDomainAllowlist: ['gmail.com'],
      },
      EmailConfig: {
        enabled: true,
        provider: 'smtp',
        smtp: { host: 'smtp.example.com' },
      },
    });
    (db.checkUserExistV2 as jest.Mock).mockResolvedValue(false);
    (db.findRegistrationRequestByUsername as jest.Mock).mockResolvedValue(null);
    (db.findRegistrationRequestByEmail as jest.Mock).mockResolvedValue(null);
    (db.findUserByEmail as jest.Mock).mockResolvedValue(null);
    (db.getGlobalValue as jest.Mock).mockResolvedValue(
      JSON.stringify({
        code: '123456',
        createdAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      })
    );

    const response = await POST(
      makeRequest({ username: 'alice', email: 'Alice@GMAIL.COM' })
    );

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      error: expect.stringContaining('请稍后再获取验证码'),
    });
    expect(db.setGlobalValue).not.toHaveBeenCalled();
  });
});
