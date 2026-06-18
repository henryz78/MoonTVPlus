/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import type { RegistrationRequest } from '@/lib/types';

export const runtime = 'nodejs';

type RequestStatus = RegistrationRequest['status'];

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

function parseStatus(value: string | null): RequestStatus | undefined {
  if (!value) return undefined;
  if (value === 'pending' || value === 'approved' || value === 'rejected') {
    return value;
  }
  throw Object.assign(new Error('审批状态参数错误'), { status: 400 });
}

export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '本地存储模式不支持注册审批' },
      { status: 400 }
    );
  }

  try {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const status = parseStatus(searchParams.get('status'));
    const requests = await db.getAllRegistrationRequests(status);

    return NextResponse.json(
      { requests: requests.map(stripPasswordHash) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) {
      console.error('获取注册审批列表失败:', error);
    }
    return NextResponse.json(
      { error: (error as Error).message || '获取注册审批列表失败' },
      { status }
    );
  }
}
