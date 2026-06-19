/* eslint-disable no-console */

import { NextResponse } from 'next/server';

import { getOnlineCount } from '@/lib/play-stats';

export const runtime = 'nodejs';

export async function GET() {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return new NextResponse(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const onlineCount = await getOnlineCount();
    return NextResponse.json(
      { onlineCount },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('获取在线人数失败:', error);
    return NextResponse.json(
      { onlineCount: 0 },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
