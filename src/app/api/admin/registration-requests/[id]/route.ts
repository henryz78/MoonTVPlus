/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import {
  approveRegistrationRequest,
  rejectRegistrationRequest,
} from '@/lib/registration-approval';
import type { RegistrationRequest } from '@/lib/types';

export const runtime = 'nodejs';

function stripPasswordHash(request: RegistrationRequest) {
  const { passwordHash: _passwordHash, ...safeRequest } = request;
  return safeRequest;
}

async function requireAdmin(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }

  if (authInfo.username === process.env.USERNAME) {
    return authInfo.username;
  }

  const userInfo = await db.getUserInfoV2(authInfo.username);
  if (!userInfo || userInfo.banned || userInfo.role !== 'admin') {
    throw Object.assign(new Error('权限不足'), { status: 401 });
  }

  return authInfo.username;
}

function errorStatus(error: unknown) {
  const status = (error as { status?: number })?.status;
  return typeof status === 'number' ? status : 500;
}

async function getRequestOrThrow(id: string) {
  const request = await db.getRegistrationRequest(id);
  if (!request) {
    throw Object.assign(new Error('注册申请不存在'), { status: 404 });
  }
  return request;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '本地存储模式不支持注册审批' },
      { status: 400 }
    );
  }

  try {
    await requireAdmin(request);
    const id = decodeURIComponent(params.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: '缺少申请ID' }, { status: 400 });
    }

    const registrationRequest = await getRequestOrThrow(id);
    return NextResponse.json(
      { request: stripPasswordHash(registrationRequest) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) {
      console.error('获取注册审批详情失败:', error);
    }
    return NextResponse.json(
      { error: (error as Error).message || '获取注册审批详情失败' },
      { status }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '本地存储模式不支持注册审批' },
      { status: 400 }
    );
  }

  try {
    const reviewer = await requireAdmin(request);
    const id = decodeURIComponent(params.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: '缺少申请ID' }, { status: 400 });
    }

    const body = await request.json();
    if (body?.action === 'approve') {
      const config = await getConfig();
      const approved = await approveRegistrationRequest(
        db,
        config,
        id,
        reviewer
      );
      return NextResponse.json({ request: stripPasswordHash(approved) });
    }

    if (body?.action === 'reject') {
      const rejected = await rejectRegistrationRequest(
        db,
        id,
        reviewer,
        typeof body.reason === 'string' ? body.reason : undefined
      );
      return NextResponse.json({ request: stripPasswordHash(rejected) });
    }

    return NextResponse.json({ error: '审批操作错误' }, { status: 400 });
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) {
      console.error('处理注册审批失败:', error);
    }
    return NextResponse.json(
      { error: (error as Error).message || '处理注册审批失败' },
      { status }
    );
  }
}
