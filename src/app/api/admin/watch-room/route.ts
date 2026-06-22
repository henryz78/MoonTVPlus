import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig, setCachedConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

type WatchRoomServerType = 'internal' | 'external';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const username = authInfo.username;

    const body = await request.json();
    const {
      Enabled,
      ServerType,
      ExternalServerUrl,
      ExternalServerAuth,
    } = body as {
      Enabled?: unknown;
      ServerType?: unknown;
      ExternalServerUrl?: unknown;
      ExternalServerAuth?: unknown;
    };

    if (
      typeof Enabled !== 'boolean' ||
      (ServerType !== 'internal' && ServerType !== 'external') ||
      (ExternalServerUrl !== undefined &&
        typeof ExternalServerUrl !== 'string') ||
      (ExternalServerAuth !== undefined &&
        typeof ExternalServerAuth !== 'string')
    ) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    const config = await getConfig();

    if (username !== process.env.USERNAME) {
      const userInfo = await db.getUserInfoV2(username);
      if (
        !userInfo ||
        (userInfo.role !== 'admin' && userInfo.role !== 'owner') ||
        userInfo.banned
      ) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    config.WatchRoomConfig = {
      Enabled,
      ServerType: ServerType as WatchRoomServerType,
      ExternalServerUrl: ExternalServerUrl || '',
      ExternalServerAuth: ExternalServerAuth || '',
    };

    await db.saveAdminConfig(config);
    await setCachedConfig(config);

    return NextResponse.json({ success: true, message: '保存成功' });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
