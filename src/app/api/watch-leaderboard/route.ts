/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  getAllTimeWatchLeaderboard,
  getWeeklyWatchLeaderboard,
} from '@/lib/watch-rewards';

export const runtime = 'nodejs';

function parsePage(value: string | null) {
  const page = Number(value || 1);
  return Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
}

function parseLimit(value: string | null) {
  const limit = Number(value || 10);
  if (!Number.isFinite(limit)) return 10;
  return Math.min(10, Math.max(1, Math.floor(limit)));
}

function errorStatus(error: unknown) {
  const status = (error as { status?: number })?.status;
  return typeof status === 'number' ? status : 500;
}

export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '本地存储模式不支持观影排行榜' },
      { status: 400 }
    );
  }

  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const type =
      url.searchParams.get('type') === 'all-time' ? 'all-time' : 'weekly';
    const input = {
      viewerUsername: authInfo.username,
      page: parsePage(url.searchParams.get('page')),
      limit: parseLimit(url.searchParams.get('limit')),
    };
    const result =
      type === 'all-time'
        ? await getAllTimeWatchLeaderboard(input)
        : await getWeeklyWatchLeaderboard(input);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) {
      console.error('获取观影排行榜失败:', error);
    }
    return NextResponse.json(
      { error: (error as Error).message || '获取观影排行榜失败' },
      { status }
    );
  }
}
