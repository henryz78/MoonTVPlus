/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getPlayStats } from '@/lib/play-stats';

export const runtime = 'nodejs';

function errorStatus(error: unknown) {
  const status = (error as { status?: number })?.status;
  return typeof status === 'number' ? status : 500;
}

export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '本地存储模式不支持播放统计' },
      { status: 400 }
    );
  }

  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await getPlayStats({
      operatorUsername: authInfo.username,
    });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) {
      console.error('获取播放统计失败:', error);
    }
    return NextResponse.json(
      { error: (error as Error).message || '获取播放统计失败' },
      { status }
    );
  }
}
