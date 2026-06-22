/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordWatchTime } from '@/lib/watch-time';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (authInfo.username !== process.env.USERNAME) {
      const userInfoV2 = await db.getUserInfoV2(authInfo.username);
      if (!userInfoV2) {
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
      if (userInfoV2.banned) {
        return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
      }
    }

    const body = await request.json();
    const result = await recordWatchTime({
      username: authInfo.username,
      source: body.source,
      id: body.id,
      title: body.title,
      sourceName: body.sourceName,
      cover: body.cover,
      year: body.year,
      episode: body.episode,
      totalEpisodes: body.totalEpisodes,
      totalTime: body.totalTime,
      progressTime: body.progressTime,
      deltaSeconds: body.deltaSeconds,
    });

    return NextResponse.json(
      {
        success: true,
        acceptedSeconds: result.acceptedSeconds,
        totalWatchSeconds: result.totalWatchSeconds,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('记录观看时长失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
