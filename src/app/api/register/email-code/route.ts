/* eslint-disable no-console */
import { NextResponse, type NextRequest } from 'next/server';

import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { EmailService } from '@/lib/email.service';
import { getRegistrationEmailCodeTemplate } from '@/lib/email.templates';
import {
  validateRegistrationEmail,
  validateRegistrationUsername,
} from '@/lib/registration-access';
import {
  createRegistrationEmailCode,
  generateRegistrationEmailCode,
  getRegistrationEmailCodeCooldown,
} from '@/lib/registration-email-code';

export const runtime = 'nodejs';

async function verifyTurnstileToken(
  token: string,
  secretKey: string
): Promise<boolean> {
  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secret: secretKey,
          response: token,
        }),
      }
    );

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('Turnstile验证失败:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: 'localStorage模式不支持注册功能' },
      { status: 400 }
    );
  }

  try {
    const config = await getConfig();
    const siteConfig = config.SiteConfig;

    if (!siteConfig.EnableRegistration) {
      return NextResponse.json({ error: '注册功能未开启' }, { status: 403 });
    }

    if (!siteConfig.RegistrationRequireEmailVerification) {
      return NextResponse.json({ error: '邮箱验证未开启' }, { status: 400 });
    }

    if (!config.EmailConfig?.enabled) {
      return NextResponse.json(
        { error: '服务器未启用邮件服务，暂时无法发送验证码' },
        { status: 500 }
      );
    }

    const { username, email, inviteCode, turnstileToken } =
      await request.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
    }

    const usernameError = validateRegistrationUsername(username);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }

    if (username === process.env.USERNAME) {
      return NextResponse.json({ error: '该用户名不可用' }, { status: 409 });
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: '邮箱不能为空' }, { status: 400 });
    }

    if (inviteCode !== undefined && typeof inviteCode !== 'string') {
      return NextResponse.json({ error: '邀请码格式错误' }, { status: 400 });
    }

    if (siteConfig.RequireRegistrationInviteCode) {
      const expectedInviteCode = (
        siteConfig.RegistrationInviteCode || ''
      ).trim();
      if (!expectedInviteCode) {
        return NextResponse.json(
          { error: '服务器未配置邀请码' },
          { status: 500 }
        );
      }

      if (!inviteCode || inviteCode.trim() !== expectedInviteCode) {
        return NextResponse.json({ error: '邀请码错误' }, { status: 400 });
      }
    }

    if (siteConfig.RegistrationRequireTurnstile) {
      if (!turnstileToken || typeof turnstileToken !== 'string') {
        return NextResponse.json({ error: '请完成人机验证' }, { status: 400 });
      }

      if (!siteConfig.TurnstileSecretKey) {
        console.error('Turnstile Secret Key未配置');
        return NextResponse.json({ error: '服务器配置错误' }, { status: 500 });
      }

      const isValid = await verifyTurnstileToken(
        turnstileToken,
        siteConfig.TurnstileSecretKey
      );
      if (!isValid) {
        return NextResponse.json(
          { error: '人机验证失败，请重试' },
          { status: 400 }
        );
      }
    }

    const emailResult = validateRegistrationEmail(email, {
      domainAllowlist: siteConfig.RegistrationEmailDomainAllowlist || [],
      blockAliases: siteConfig.RegistrationBlockEmailAliases || false,
    });
    if (!emailResult.ok) {
      return NextResponse.json({ error: emailResult.error }, { status: 400 });
    }

    if (await db.checkUserExistV2(username)) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
    }

    if (await db.findRegistrationRequestByUsername(username)) {
      return NextResponse.json(
        { error: '该用户名已有待审批申请，请等待管理员审核' },
        { status: 409 }
      );
    }

    if (await db.findUserByEmail(emailResult.value.normalizedEmail)) {
      return NextResponse.json({ error: '该邮箱已被使用' }, { status: 409 });
    }

    if (
      await db.findRegistrationRequestByEmail(emailResult.value.normalizedEmail)
    ) {
      return NextResponse.json(
        { error: '该邮箱已有待审批申请，请等待管理员审核' },
        { status: 409 }
      );
    }

    const cooldownMs = await getRegistrationEmailCodeCooldown(db, {
      username,
      normalizedEmail: emailResult.value.normalizedEmail,
    });
    if (cooldownMs > 0) {
      return NextResponse.json(
        {
          error: `请稍后再获取验证码（约 ${Math.ceil(cooldownMs / 1000)} 秒）`,
        },
        { status: 429 }
      );
    }

    const code = generateRegistrationEmailCode();
    const siteName = siteConfig.SiteName || 'MoonTVPlus';
    await EmailService.send(config.EmailConfig, {
      to: emailResult.value.email,
      subject: `${siteName} 注册验证码`,
      html: getRegistrationEmailCodeTemplate(code, siteName),
    });
    await createRegistrationEmailCode(db, {
      username,
      normalizedEmail: emailResult.value.normalizedEmail,
      code,
    });

    return NextResponse.json({ ok: true, message: '验证码已发送' });
  } catch (error) {
    console.error('发送注册邮箱验证码失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
