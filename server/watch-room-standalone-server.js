#!/usr/bin/env node

// 独立的观影室服务器
// 使用方式: node watch-room-standalone-server.js --port 3001 --auth YOUR_SECRET_KEY

import { createServer } from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import { Server } from 'socket.io';
import { WatchRoomServer } from '../lib/watch-room-server';

const args = process.argv.slice(2);
const port = parseInt(args[args.indexOf('--port') + 1] || '3001');
const authKey = args[args.indexOf('--auth') + 1] || '';

if (!authKey) {
  console.error('Error: --auth parameter is required');
  console.log('Usage: node watch-room-standalone-server.js --port 3001 --auth YOUR_SECRET_KEY');
  process.exit(1);
}

const httpServer = createServer();

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function verifyAccessToken(token) {
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra) return false;

  const expected = encodeBase64Url(
    createHmac('sha256', authKey).update(payload).digest()
  );
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padding =
      normalized.length % 4 === 0
        ? ''
        : '='.repeat(4 - (normalized.length % 4));
    const data = JSON.parse(
      Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
    );
    return Boolean(data.username) && data.expiresAt >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.use((socket, next) => {
  const headerToken = String(
    socket.handshake.headers.authorization || ''
  ).replace(/^Bearer\s+/i, '');
  const token = socket.handshake.auth?.token || headerToken;

  if (token === authKey || verifyAccessToken(token)) {
    next();
    return;
  }

  console.log('[WatchRoom] Unauthorized connection attempt');
  next(new Error('Unauthorized'));
});

// 初始化观影室服务器
const watchRoomServer = new WatchRoomServer(io);

httpServer.listen(port, () => {
  console.log(`[WatchRoom] Standalone server running on port ${port}`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n[WatchRoom] Shutting down...');
  watchRoomServer.destroy();
  httpServer.close(() => {
    console.log('[WatchRoom] Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n[WatchRoom] Shutting down...');
  watchRoomServer.destroy();
  httpServer.close(() => {
    console.log('[WatchRoom] Server closed');
    process.exit(0);
  });
});
