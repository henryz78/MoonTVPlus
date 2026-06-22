import { NextRequest } from 'next/server';
import { getAuthInfoFromCookie } from './auth';
import { generateTvboxToken } from './tvbox-token';

/**
 * 获取用于代理的 token。
 * 带请求上下文时使用当前用户 token，避免把全局订阅 token 下发到客户端。
 */
export async function getProxyToken(request?: NextRequest): Promise<string | null> {
  if (request) {
    const authInfo = getAuthInfoFromCookie(request);
    if (authInfo && authInfo.username) {
      try {
        const { db } = await import('./db');
        let userToken = await db.getTvboxSubscribeToken(authInfo.username);
        if (!userToken) {
          userToken = generateTvboxToken();
          await db.setTvboxSubscribeToken(authInfo.username, userToken);
        }
        if (userToken) {
          return userToken;
        }
      } catch (error) {
        // 忽略错误，继续
      }
    }
  }

  return process.env.TVBOX_SUBSCRIBE_TOKEN || null;
}
