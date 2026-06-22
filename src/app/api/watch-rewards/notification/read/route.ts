/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { markWeeklyWatchNotificationRead } from '@/lib/watch-rewards';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '本地存储模式不支持观影奖励' },
      { status: 400 }
    );
  }

  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const settlementId = String(body.settlementId || '').trim();
    if (!settlementId) {
      return NextResponse.json({ error: '缺少结算ID' }, { status: 400 });
    }

    await markWeeklyWatchNotificationRead(authInfo.username, settlementId);
    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('标记观影奖励通知失败:', error);
    return NextResponse.json(
      { error: (error as Error).message || '标记观影奖励通知失败' },
      { status: 500 }
    );
  }
}
