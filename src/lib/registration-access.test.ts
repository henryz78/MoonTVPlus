import {
  normalizeEmailForRegistration,
  validateRegistrationEmail,
  validateRegistrationUsername,
} from './registration-access';
import type { AdminConfig } from './admin.types';
import type { NotificationType, RegistrationRequest } from './types';

describe('registration access validation', () => {
  it('rejects email domains outside the allowlist and includes allowed domains', () => {
    const result = validateRegistrationEmail('user@example.com', {
      domainAllowlist: ['gmail.com', 'outlook.com'],
      blockAliases: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected email validation to fail');
    expect(result.error).toBe(
      '当前邮箱域名不在允许列表中，请使用以下域名邮箱：gmail.com、outlook.com'
    );
  });

  it.each([
    ['name+tag@gmail.com', '邮箱地址不能包含 + 别名'],
    ['.name@gmail.com', '邮箱地址不能以点号开头或结尾'],
    ['name.@gmail.com', '邮箱地址不能以点号开头或结尾'],
    ['na..me@gmail.com', '邮箱地址不能包含连续点号'],
  ])('rejects alias-like email %s', (email, message) => {
    const result = validateRegistrationEmail(email, {
      domainAllowlist: [],
      blockAliases: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected email validation to fail');
    expect(result.error).toBe(message);
  });

  it('normalizes email domain and full lookup value', () => {
    expect(normalizeEmailForRegistration(' User@GMAIL.COM ')).toEqual({
      email: 'User@gmail.com',
      normalizedEmail: 'user@gmail.com',
      localPart: 'User',
      domain: 'gmail.com',
    });
  });

  it('keeps existing username validation text', () => {
    expect(validateRegistrationUsername('ab')).toBe(
      '用户名只能包含字母、数字、下划线，长度3-20位'
    );
    expect(validateRegistrationUsername('valid_user')).toBeNull();
  });

  it('exposes registration approval config and types', () => {
    const config = {
      RegistrationRequireEmailVerification: true,
      RegistrationEmailDomainAllowlist: ['gmail.com'],
      RegistrationBlockEmailAliases: true,
      RegistrationRequireApproval: true,
      RegistrationApprovalQuestion: '你是谁？',
    } satisfies Partial<AdminConfig['SiteConfig']>;

    const request: RegistrationRequest = {
      id: 'req_1',
      username: 'alice',
      passwordHash: 'hash',
      email: 'alice@gmail.com',
      normalizedEmail: 'alice@gmail.com',
      approvalQuestion: config.RegistrationApprovalQuestion,
      approvalAnswer: '朋友邀请',
      status: 'pending',
      createdAt: 1,
      updatedAt: 1,
    };

    const notificationType: NotificationType = 'registration_request';

    expect(request.status).toBe('pending');
    expect(notificationType).toBe('registration_request');
  });
});
