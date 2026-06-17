import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { touchRefreshTokenLastUsed } from '@/lib/refresh-token';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '本地存储模式不支持活跃状态上报' },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (
    !authInfo?.username ||
    !authInfo.tokenId ||
    !authInfo.refreshToken ||
    !authInfo.refreshExpires
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (Date.now() >= authInfo.refreshExpires) {
    return NextResponse.json(
      { error: 'Refresh token expired' },
      { status: 401 }
    );
  }

  const touched = await touchRefreshTokenLastUsed(
    authInfo.username,
    authInfo.tokenId,
    authInfo.refreshToken
  );

  if (!touched) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
