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
    createUserV2: jest.fn(),
    setUserEmail: jest.fn(),
    findUserByEmail: jest.fn(),
    findRegistrationRequestByUsername: jest.fn(),
    findRegistrationRequestByEmail: jest.fn(),
    createRegistrationRequest: jest.fn(),
    updateRegistrationRequest: jest.fn(),
    addNotification: jest.fn(),
  },
}));

jest.mock('@/lib/lock', () => ({
  lockManager: {
    acquire: jest.fn(),
  },
}));

jest.mock('@/lib/registration-email-code', () => ({
  verifyRegistrationEmailCode: jest.fn(),
  consumeRegistrationEmailCode: jest.fn(),
}));

jest.mock('@/lib/registration-approval', () => ({
  hashRegistrationPassword: jest.fn(() => 'hashed-password'),
  createPendingRegistrationRequest: jest.fn(),
}));

const makeRequest = (body: unknown) =>
  ({
    json: async () => body,
  } as Parameters<typeof POST>[0]);

const baseConfig = (siteConfig: Record<string, unknown> = {}) => ({
  SiteConfig: {
    SiteName: 'HYTV',
    EnableRegistration: true,
    RequireRegistrationInviteCode: false,
    RegistrationRequireTurnstile: false,
    RegistrationRequireEmailVerification: false,
    RegistrationRequireApproval: false,
    RegistrationEmailDomainAllowlist: [],
    RegistrationBlockEmailAliases: false,
    DefaultUserTags: ['default'],
    ...siteConfig,
  },
  UserConfig: { Users: [] },
});

describe('POST /api/register', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    process.env.USERNAME = 'owner';

    const { getConfig } = await import('@/lib/config');
    const { db } = await import('@/lib/db');
    const { lockManager } = await import('@/lib/lock');
    const approval = await import('@/lib/registration-approval');

    (getConfig as jest.Mock).mockResolvedValue(baseConfig());
    (lockManager.acquire as jest.Mock).mockResolvedValue(jest.fn());
    (db.checkUserExistV2 as jest.Mock).mockResolvedValue(false);
    (db.findUserByEmail as jest.Mock).mockResolvedValue(null);
    (db.findRegistrationRequestByUsername as jest.Mock).mockResolvedValue(null);
    (db.findRegistrationRequestByEmail as jest.Mock).mockResolvedValue(null);
    (approval.createPendingRegistrationRequest as jest.Mock).mockResolvedValue({
      id: 'reg_1',
      username: 'alice',
      status: 'pending',
    });
  });

  it('keeps direct registration behavior when new switches are disabled', async () => {
    const { db } = await import('@/lib/db');

    const response = await POST(
      makeRequest({ username: 'alice', password: 'secret123' })
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, message: '注册成功' });
    expect(db.createUserV2).toHaveBeenCalledWith('alice', 'secret123', 'user', [
      'default',
    ]);
  });

  it('requires and consumes a valid email code before direct registration', async () => {
    const { getConfig } = await import('@/lib/config');
    const { db } = await import('@/lib/db');
    const emailCode = await import('@/lib/registration-email-code');

    (getConfig as jest.Mock).mockResolvedValue(
      baseConfig({
        RegistrationRequireEmailVerification: true,
        RegistrationEmailDomainAllowlist: ['gmail.com'],
      })
    );
    (emailCode.verifyRegistrationEmailCode as jest.Mock).mockResolvedValue(
      true
    );

    const response = await POST(
      makeRequest({
        username: 'alice',
        password: 'secret123',
        email: 'Alice@GMAIL.COM',
        emailCode: '123456',
      })
    );

    expect(response.status).toBe(200);
    expect(emailCode.verifyRegistrationEmailCode).toHaveBeenCalledWith(db, {
      username: 'alice',
      normalizedEmail: 'alice@gmail.com',
      code: '123456',
    });
    expect(emailCode.consumeRegistrationEmailCode).toHaveBeenCalledWith(db, {
      username: 'alice',
      normalizedEmail: 'alice@gmail.com',
    });
    expect(db.setUserEmail).toHaveBeenCalledWith('alice', 'Alice@gmail.com');
  });

  it('submits approval request instead of creating a user when approval is enabled', async () => {
    const { getConfig } = await import('@/lib/config');
    const { db } = await import('@/lib/db');
    const approval = await import('@/lib/registration-approval');

    (getConfig as jest.Mock).mockResolvedValue(
      baseConfig({
        RegistrationRequireApproval: true,
        RegistrationApprovalQuestion: '你是谁？',
      })
    );

    const response = await POST(
      makeRequest({
        username: 'alice',
        password: 'secret123',
        approvalAnswer: '朋友邀请',
      })
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      pendingApproval: true,
      message: '申请已提交，请等待管理员审核',
    });
    expect(db.createUserV2).not.toHaveBeenCalled();
    expect(approval.createPendingRegistrationRequest).toHaveBeenCalledWith(
      db,
      expect.any(Object),
      expect.objectContaining({
        username: 'alice',
        passwordHash: 'hashed-password',
        approvalAnswer: '朋友邀请',
      })
    );
  });

  it('rejects invalid email code when email verification is enabled', async () => {
    const { getConfig } = await import('@/lib/config');
    const { db } = await import('@/lib/db');
    const emailCode = await import('@/lib/registration-email-code');

    (getConfig as jest.Mock).mockResolvedValue(
      baseConfig({ RegistrationRequireEmailVerification: true })
    );
    (emailCode.verifyRegistrationEmailCode as jest.Mock).mockResolvedValue(
      false
    );

    const response = await POST(
      makeRequest({
        username: 'alice',
        password: 'secret123',
        email: 'alice@gmail.com',
        emailCode: '000000',
      })
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: '邮箱验证码错误或已过期' });
    expect(db.createUserV2).not.toHaveBeenCalled();
  });

  it('checks Turnstile before verifying email code', async () => {
    const { getConfig } = await import('@/lib/config');
    const emailCode = await import('@/lib/registration-email-code');

    (getConfig as jest.Mock).mockResolvedValue(
      baseConfig({
        RegistrationRequireEmailVerification: true,
        RegistrationRequireTurnstile: true,
        TurnstileSecretKey: 'secret',
      })
    );

    const response = await POST(
      makeRequest({
        username: 'alice',
        password: 'secret123',
        email: 'alice@gmail.com',
        emailCode: '123456',
      })
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: '请完成人机验证' });
    expect(emailCode.verifyRegistrationEmailCode).not.toHaveBeenCalled();
  });
});
