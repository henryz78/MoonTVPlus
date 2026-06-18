/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { lockManager } from '@/lib/lock';
import {
  validateRegistrationEmail,
  validateRegistrationPassword,
  validateRegistrationUsername,
} from '@/lib/registration-access';
import {
  consumeRegistrationEmailCode,
  verifyRegistrationEmailCode,
} from '@/lib/registration-email-code';
import {
  createPendingRegistrationRequest,
  hashRegistrationPassword,
} from '@/lib/registration-approval';

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

function storageType() {
  return (
    (process.env.NEXT_PUBLIC_STORAGE_TYPE as
      | 'localstorage'
      | 'redis'
      | 'upstash'
      | 'kvrocks'
      | 'd1'
      | 'postgres'
      | undefined) || 'localstorage'
  );
}

export async function POST(req: NextRequest) {
  try {
    if (storageType() === 'localstorage') {
      return NextResponse.json(
        { error: 'localStorage模式不支持注册功能' },
        { status: 400 }
      );
    }

    const config = await getConfig();
    const siteConfig = config.SiteConfig;

    if (!siteConfig.EnableRegistration) {
      return NextResponse.json({ error: '注册功能未开启' }, { status: 403 });
    }

    const {
      username,
      password,
      inviteCode,
      turnstileToken,
      email,
      emailCode,
      approvalAnswer,
    } = await req.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
    }
    if (inviteCode !== undefined && typeof inviteCode !== 'string') {
      return NextResponse.json({ error: '邀请码格式错误' }, { status: 400 });
    }
    if (email !== undefined && typeof email !== 'string') {
      return NextResponse.json({ error: '邮箱格式错误' }, { status: 400 });
    }
    if (emailCode !== undefined && typeof emailCode !== 'string') {
      return NextResponse.json(
        { error: '邮箱验证码格式错误' },
        { status: 400 }
      );
    }
    if (approvalAnswer !== undefined && typeof approvalAnswer !== 'string') {
      return NextResponse.json({ error: '审批回答格式错误' }, { status: 400 });
    }

    const usernameError = validateRegistrationUsername(username);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }

    const passwordError = validateRegistrationPassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    if (username === process.env.USERNAME) {
      return NextResponse.json({ error: '该用户名不可用' }, { status: 409 });
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

    const needsEmailVerification =
      siteConfig.RegistrationRequireEmailVerification || false;
    const needsApproval = siteConfig.RegistrationRequireApproval || false;
    const approvalQuestion = (
      siteConfig.RegistrationApprovalQuestion || ''
    ).trim();

    if (needsEmailVerification && !email) {
      return NextResponse.json({ error: '邮箱不能为空' }, { status: 400 });
    }

    const emailResult =
      needsEmailVerification || email
        ? validateRegistrationEmail(email || '', {
            domainAllowlist: siteConfig.RegistrationEmailDomainAllowlist || [],
            blockAliases: siteConfig.RegistrationBlockEmailAliases || false,
          })
        : null;

    if (emailResult && !emailResult.ok) {
      return NextResponse.json({ error: emailResult.error }, { status: 400 });
    }

    if (needsEmailVerification && (!emailCode || !emailCode.trim())) {
      return NextResponse.json({ error: '请输入邮箱验证码' }, { status: 400 });
    }

    if (
      needsApproval &&
      approvalQuestion &&
      (!approvalAnswer || !approvalAnswer.trim())
    ) {
      return NextResponse.json({ error: '请回答审批问题' }, { status: 400 });
    }

    let releaseLock: (() => void) | null = null;
    try {
      releaseLock = await lockManager.acquire(`register:${username}`);
    } catch {
      return NextResponse.json(
        { error: '服务器繁忙，请稍后重试' },
        { status: 503 }
      );
    }

    try {
      if (await db.checkUserExistV2(username)) {
        return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
      }

      if (await db.findRegistrationRequestByUsername(username)) {
        return NextResponse.json(
          { error: '该用户名已有待审批申请，请等待管理员审核' },
          { status: 409 }
        );
      }

      if (emailResult?.ok) {
        if (await db.findUserByEmail(emailResult.value.normalizedEmail)) {
          return NextResponse.json(
            { error: '该邮箱已被使用' },
            { status: 409 }
          );
        }

        if (
          await db.findRegistrationRequestByEmail(
            emailResult.value.normalizedEmail
          )
        ) {
          return NextResponse.json(
            { error: '该邮箱已有待审批申请，请等待管理员审核' },
            { status: 409 }
          );
        }
      }

      if (siteConfig.RegistrationRequireTurnstile) {
        if (!turnstileToken) {
          return NextResponse.json(
            { error: '请完成人机验证' },
            { status: 400 }
          );
        }

        if (!siteConfig.TurnstileSecretKey) {
          console.error('Turnstile Secret Key未配置');
          return NextResponse.json(
            { error: '服务器配置错误' },
            { status: 500 }
          );
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

      if (needsEmailVerification && emailResult?.ok) {
        const validCode = await verifyRegistrationEmailCode(db, {
          username,
          normalizedEmail: emailResult.value.normalizedEmail,
          code: emailCode,
        });
        if (!validCode) {
          return NextResponse.json(
            { error: '邮箱验证码错误或已过期' },
            { status: 400 }
          );
        }
      }

      if (needsApproval) {
        await createPendingRegistrationRequest(db, config, {
          username,
          passwordHash: hashRegistrationPassword(password),
          email: emailResult?.ok ? emailResult.value.email : undefined,
          normalizedEmail: emailResult?.ok
            ? emailResult.value.normalizedEmail
            : undefined,
          approvalAnswer: approvalAnswer?.trim(),
        });

        if (needsEmailVerification && emailResult?.ok) {
          await consumeRegistrationEmailCode(db, {
            username,
            normalizedEmail: emailResult.value.normalizedEmail,
          });
        }

        return NextResponse.json({
          ok: true,
          pendingApproval: true,
          message: '申请已提交，请等待管理员审核',
        });
      }

      try {
        const defaultTags =
          siteConfig.DefaultUserTags && siteConfig.DefaultUserTags.length > 0
            ? siteConfig.DefaultUserTags
            : undefined;

        await db.createUserV2(username, password, 'user', defaultTags);

        if (emailResult?.ok) {
          await db.setUserEmail(username, emailResult.value.email);
        }

        if (needsEmailVerification && emailResult?.ok) {
          await consumeRegistrationEmailCode(db, {
            username,
            normalizedEmail: emailResult.value.normalizedEmail,
          });
        }

        return NextResponse.json({ ok: true, message: '注册成功' });
      } catch (err: any) {
        console.error('创建用户失败', err);
        if (err.message === '用户已存在') {
          return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
        }
        return NextResponse.json(
          { error: '注册失败，请稍后重试' },
          { status: 500 }
        );
      }
    } finally {
      if (releaseLock) {
        releaseLock();
      }
    }
  } catch (error: any) {
    console.error('注册接口异常', error);
    const status =
      typeof error.status === 'number' && error.status >= 400
        ? error.status
        : 500;
    return NextResponse.json(
      { error: status === 500 ? '服务器错误' : error.message },
      { status }
    );
  }
}
