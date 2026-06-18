export interface NormalizedRegistrationEmail {
  email: string;
  normalizedEmail: string;
  localPart: string;
  domain: string;
}

export interface RegistrationEmailValidationOptions {
  domainAllowlist?: string[];
  blockAliases?: boolean;
}

export type RegistrationEmailValidationResult =
  | { ok: true; value: NormalizedRegistrationEmail }
  | { ok: false; error: string };

export function validateRegistrationUsername(username: string) {
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return '用户名只能包含字母、数字、下划线，长度3-20位';
  }
  return null;
}

export function validateRegistrationPassword(password: string) {
  if (password.length < 6) return '密码长度至少为6位';
  return null;
}

export function normalizeEmailForRegistration(
  input: string
): NormalizedRegistrationEmail | null {
  const trimmed = input.trim();
  const match = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(trimmed);
  if (!match) return null;

  const localPart = match[1];
  const domain = match[2].toLowerCase();
  const email = `${localPart}@${domain}`;

  return {
    email,
    normalizedEmail: email.toLowerCase(),
    localPart,
    domain,
  };
}

export function validateRegistrationEmail(
  input: string,
  options: RegistrationEmailValidationOptions
): RegistrationEmailValidationResult {
  const normalized = normalizeEmailForRegistration(input);
  if (!normalized) {
    return { ok: false, error: '邮箱格式错误' };
  }

  if (options.blockAliases) {
    if (normalized.localPart.includes('+')) {
      return { ok: false, error: '邮箱地址不能包含 + 别名' };
    }
    if (
      normalized.localPart.startsWith('.') ||
      normalized.localPart.endsWith('.')
    ) {
      return { ok: false, error: '邮箱地址不能以点号开头或结尾' };
    }
    if (normalized.localPart.includes('..')) {
      return { ok: false, error: '邮箱地址不能包含连续点号' };
    }
  }

  const allowlist = (options.domainAllowlist || [])
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(normalized.domain)) {
    return {
      ok: false,
      error: `当前邮箱域名不在允许列表中，请使用以下域名邮箱：${allowlist.join(
        '、'
      )}`,
    };
  }

  return { ok: true, value: normalized };
}
