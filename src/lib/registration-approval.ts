import { createHash, randomUUID } from 'crypto';

import type { AdminConfig } from './admin.types';
import type { Notification, RegistrationRequest } from './types';

export interface RegistrationApprovalStore {
  getRegistrationRequest(id: string): Promise<RegistrationRequest | null>;
  createRegistrationRequest(request: RegistrationRequest): Promise<void>;
  updateRegistrationRequest(
    id: string,
    updates: Partial<RegistrationRequest>
  ): Promise<void>;
  findRegistrationRequestByUsername(
    username: string
  ): Promise<RegistrationRequest | null>;
  findRegistrationRequestByEmail(
    normalizedEmail: string
  ): Promise<RegistrationRequest | null>;
  checkUserExistV2(username: string): Promise<boolean>;
  findUserByEmail(normalizedEmail: string): Promise<string | null>;
  createUserWithHashedPassword(
    userName: string,
    passwordHash: string,
    role: 'owner' | 'admin' | 'user',
    createdAt: number,
    tags?: string[],
    oidcSub?: string,
    enabledApis?: string[],
    banned?: boolean,
    email?: string
  ): Promise<void>;
  addNotification(userName: string, notification: Notification): Promise<void>;
}

export interface PendingRegistrationInput {
  username: string;
  passwordHash: string;
  email?: string;
  normalizedEmail?: string;
  approvalAnswer?: string;
}

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

export function hashRegistrationPassword(password: string) {
  return createHash('sha256').update(password).digest('hex');
}

function adminRecipients(config: AdminConfig) {
  const recipients = new Set<string>();
  if (process.env.USERNAME) recipients.add(process.env.USERNAME);

  for (const user of config.UserConfig?.Users || []) {
    if (user.role === 'owner' || user.role === 'admin') {
      recipients.add(user.username);
    }
  }

  return Array.from(recipients).filter(Boolean);
}

async function assertNoUserOrPendingRequest(
  store: RegistrationApprovalStore,
  input: { username: string; normalizedEmail?: string }
) {
  if (await store.checkUserExistV2(input.username)) {
    throw httpError('用户名已存在', 409);
  }

  const pendingUsername = await store.findRegistrationRequestByUsername(
    input.username
  );
  if (pendingUsername) {
    throw httpError('用户名已提交审批', 409);
  }

  if (input.normalizedEmail) {
    const existingEmailUser = await store.findUserByEmail(
      input.normalizedEmail
    );
    if (existingEmailUser) {
      throw httpError('该邮箱已被使用', 409);
    }

    const pendingEmail = await store.findRegistrationRequestByEmail(
      input.normalizedEmail
    );
    if (pendingEmail) {
      throw httpError('该邮箱已提交审批', 409);
    }
  }
}

async function assertNoExistingUser(
  store: RegistrationApprovalStore,
  input: { username: string; normalizedEmail?: string }
) {
  if (await store.checkUserExistV2(input.username)) {
    throw httpError('用户名已存在', 409);
  }

  if (input.normalizedEmail) {
    const existingEmailUser = await store.findUserByEmail(
      input.normalizedEmail
    );
    if (existingEmailUser) {
      throw httpError('该邮箱已被使用', 409);
    }
  }
}

export async function createPendingRegistrationRequest(
  store: RegistrationApprovalStore,
  config: AdminConfig,
  input: PendingRegistrationInput
) {
  await assertNoUserOrPendingRequest(store, input);

  const now = Date.now();
  const request: RegistrationRequest = {
    id: `reg_${randomUUID()}`,
    username: input.username,
    passwordHash: input.passwordHash,
    email: input.email,
    normalizedEmail: input.normalizedEmail,
    approvalQuestion: config.SiteConfig.RegistrationApprovalQuestion?.trim(),
    approvalAnswer: input.approvalAnswer?.trim(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await store.createRegistrationRequest(request);

  await Promise.all(
    adminRecipients(config).map((username) =>
      store.addNotification(username, {
        id: `registration_request_${request.id}_${now}`,
        type: 'registration_request',
        title: '新的注册审批申请',
        message: `${input.username} 提交了注册申请`,
        timestamp: now,
        read: false,
        metadata: { requestId: request.id, username: input.username },
      })
    )
  );

  return request;
}

async function getPendingRequest(
  store: RegistrationApprovalStore,
  requestId: string
) {
  const request = await store.getRegistrationRequest(requestId);
  if (!request) {
    throw httpError('注册申请不存在', 404);
  }
  if (request.status !== 'pending') {
    throw httpError('注册申请已处理', 409);
  }
  return request;
}

export async function approveRegistrationRequest(
  store: RegistrationApprovalStore,
  config: AdminConfig,
  requestId: string,
  reviewer: string
) {
  const request = await getPendingRequest(store, requestId);
  await assertNoExistingUser(store, {
    username: request.username,
    normalizedEmail: request.normalizedEmail,
  });

  const now = Date.now();
  await store.createUserWithHashedPassword(
    request.username,
    request.passwordHash,
    'user',
    now,
    config.SiteConfig.DefaultUserTags?.length
      ? config.SiteConfig.DefaultUserTags
      : undefined,
    undefined,
    undefined,
    false,
    request.email
  );

  const updates: Partial<RegistrationRequest> = {
    status: 'approved',
    updatedAt: now,
    reviewedAt: now,
    reviewedBy: reviewer,
  };
  await store.updateRegistrationRequest(requestId, updates);

  return { ...request, ...updates };
}

export async function rejectRegistrationRequest(
  store: RegistrationApprovalStore,
  requestId: string,
  reviewer: string,
  reason?: string
) {
  const request = await getPendingRequest(store, requestId);
  const now = Date.now();
  const updates: Partial<RegistrationRequest> = {
    status: 'rejected',
    updatedAt: now,
    reviewedAt: now,
    reviewedBy: reviewer,
    rejectReason: reason?.trim() || undefined,
  };
  await store.updateRegistrationRequest(requestId, updates);

  return { ...request, ...updates };
}
