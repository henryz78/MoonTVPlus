import type { AdminConfig } from './admin.types';
import type { Notification, RegistrationRequest } from './types';
import {
  approveRegistrationRequest,
  createPendingRegistrationRequest,
  hashRegistrationPassword,
  rejectRegistrationRequest,
} from './registration-approval';

class MemoryApprovalStore {
  requests = new Map<string, RegistrationRequest>();
  users = new Map<string, { passwordHash: string; email?: string }>();
  notifications = new Map<string, Notification[]>();

  async getAllRegistrationRequests(status?: RegistrationRequest['status']) {
    return Array.from(this.requests.values()).filter(
      (request) => !status || request.status === status
    );
  }

  async getRegistrationRequest(id: string) {
    return this.requests.get(id) || null;
  }

  async createRegistrationRequest(request: RegistrationRequest) {
    this.requests.set(request.id, request);
  }

  async updateRegistrationRequest(
    id: string,
    updates: Partial<RegistrationRequest>
  ) {
    const current = this.requests.get(id);
    if (!current) return;
    this.requests.set(id, { ...current, ...updates });
  }

  async findRegistrationRequestByUsername(username: string) {
    return (
      Array.from(this.requests.values()).find(
        (request) =>
          request.username === username && request.status === 'pending'
      ) || null
    );
  }

  async findRegistrationRequestByEmail(normalizedEmail: string) {
    return (
      Array.from(this.requests.values()).find(
        (request) =>
          request.normalizedEmail === normalizedEmail &&
          request.status === 'pending'
      ) || null
    );
  }

  async checkUserExistV2(username: string) {
    return this.users.has(username);
  }

  async findUserByEmail(email: string) {
    for (const [username, user] of Array.from(this.users.entries())) {
      if (user.email?.toLowerCase() === email) return username;
    }
    return null;
  }

  async createUserWithHashedPassword(
    username: string,
    passwordHash: string,
    _role: 'owner' | 'admin' | 'user',
    _createdAt: number,
    _tags?: string[],
    _oidcSub?: string,
    _enabledApis?: string[],
    _banned?: boolean,
    email?: string
  ) {
    this.users.set(username, { passwordHash, email });
  }

  async addNotification(username: string, notification: Notification) {
    this.notifications.set(username, [
      ...(this.notifications.get(username) || []),
      notification,
    ]);
  }
}

const baseConfig = (): AdminConfig =>
  ({
    SiteConfig: {
      SiteName: 'HYTV',
      RegistrationApprovalQuestion: '你是谁？',
      DefaultUserTags: ['default'],
    },
    UserConfig: {
      Users: [
        { username: 'owner', role: 'owner' },
        { username: 'admin', role: 'admin' },
        { username: 'regular', role: 'user' },
      ],
    },
  } as AdminConfig);

describe('registration approval service', () => {
  const originalOwner = process.env.USERNAME;

  beforeEach(() => {
    process.env.USERNAME = 'owner';
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalOwner === undefined) {
      delete process.env.USERNAME;
    } else {
      process.env.USERNAME = originalOwner;
    }
  });

  it('hashes registration passwords with sha256 hex', () => {
    expect(hashRegistrationPassword('secret123')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRegistrationPassword('secret123')).toBe(
      hashRegistrationPassword('secret123')
    );
  });

  it('creates a pending request and notifies owner plus admins', async () => {
    const store = new MemoryApprovalStore();

    const request = await createPendingRegistrationRequest(
      store,
      baseConfig(),
      {
        username: 'alice',
        passwordHash: 'hash',
        email: 'Alice@gmail.com',
        normalizedEmail: 'alice@gmail.com',
        approvalAnswer: '朋友邀请',
      }
    );

    expect(request).toEqual(
      expect.objectContaining({
        username: 'alice',
        passwordHash: 'hash',
        email: 'Alice@gmail.com',
        normalizedEmail: 'alice@gmail.com',
        approvalQuestion: '你是谁？',
        approvalAnswer: '朋友邀请',
        status: 'pending',
      })
    );
    expect(store.requests.get(request.id)).toEqual(request);
    expect(store.notifications.get('owner')?.[0]).toEqual(
      expect.objectContaining({
        type: 'registration_request',
        title: '新的注册审批申请',
        message: 'alice 提交了注册申请',
      })
    );
    expect(store.notifications.get('admin')).toHaveLength(1);
    expect(store.notifications.get('regular')).toBeUndefined();
  });

  it('rejects duplicate pending usernames and emails', async () => {
    const store = new MemoryApprovalStore();
    await createPendingRegistrationRequest(store, baseConfig(), {
      username: 'alice',
      passwordHash: 'hash',
      normalizedEmail: 'alice@gmail.com',
    });

    await expect(
      createPendingRegistrationRequest(store, baseConfig(), {
        username: 'alice',
        passwordHash: 'other',
      })
    ).rejects.toMatchObject({ message: '用户名已提交审批', status: 409 });

    await expect(
      createPendingRegistrationRequest(store, baseConfig(), {
        username: 'bob',
        passwordHash: 'other',
        normalizedEmail: 'alice@gmail.com',
      })
    ).rejects.toMatchObject({ message: '该邮箱已提交审批', status: 409 });
  });

  it('approves a pending request by creating the user and marking reviewed', async () => {
    const store = new MemoryApprovalStore();
    const request = await createPendingRegistrationRequest(
      store,
      baseConfig(),
      {
        username: 'alice',
        passwordHash: 'hash',
        email: 'Alice@gmail.com',
        normalizedEmail: 'alice@gmail.com',
      }
    );

    const approved = await approveRegistrationRequest(
      store,
      baseConfig(),
      request.id,
      'owner'
    );

    expect(store.users.get('alice')).toEqual({
      passwordHash: 'hash',
      email: 'Alice@gmail.com',
    });
    expect(approved.status).toBe('approved');
    expect(approved.reviewedBy).toBe('owner');
  });

  it('rejects a pending request without creating a user', async () => {
    const store = new MemoryApprovalStore();
    const request = await createPendingRegistrationRequest(
      store,
      baseConfig(),
      {
        username: 'alice',
        passwordHash: 'hash',
      }
    );

    const rejected = await rejectRegistrationRequest(
      store,
      request.id,
      'admin',
      '资料不完整'
    );

    expect(store.users.has('alice')).toBe(false);
    expect(rejected).toEqual(
      expect.objectContaining({
        status: 'rejected',
        reviewedBy: 'admin',
        rejectReason: '资料不完整',
      })
    );
  });
});
