/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getUserActivityOverview } from '@/lib/admin-user-activity';
import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'nodejs';

function errorStatus(error: unknown) {
  const status = (error as { status?: number })?.status;
  return typeof status === 'number' ? status : 500;
}

export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '本地存储模式不支持用户动态查询' },
      { status: 400 }
    );
  }

  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = (searchParams.get('search') || '').trim();

    const result = await getUserActivityOverview({
      operatorUsername: authInfo.username,
      page,
      limit,
      search,
    });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) {
      console.error('获取用户动态失败:', error);
    }
    return NextResponse.json(
      { error: (error as Error).message || '获取用户动态失败' },
      { status }
    );
  }
}
