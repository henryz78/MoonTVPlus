/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

/**
 * GET /api/watch-room-auth
 *
 * 需要登录才能访问的接口，返回观影室外部服务器的认证信息
 * 这样可以避免将敏感的 externalServerAuth 暴露给未登录用户
 */
export async function GET(request: NextRequest) {
  console.log('watch-room-auth called: ', request.url);

  // 从 cookie 获取用户信息
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  const watchRoomConfig =
    storageType === 'localstorage'
      ? {
          Enabled: process.env.WATCH_ROOM_ENABLED === 'true',
          ServerType:
            process.env.WATCH_ROOM_SERVER_TYPE === 'external'
              ? 'external'
              : 'internal',
          ExternalServerAuth: process.env.WATCH_ROOM_EXTERNAL_SERVER_AUTH,
        }
      : (await getConfig()).WatchRoomConfig;

  const externalServerSecret =
    watchRoomConfig?.Enabled && watchRoomConfig.ServerType === 'external'
      ? watchRoomConfig.ExternalServerAuth
      : null;

  return NextResponse.json(
    {
      externalServerAuth: externalServerSecret || null,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
