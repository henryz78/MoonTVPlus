import { WatchRoomServer } from './watch-room-server';

describe('WatchRoomServer heartbeat', () => {
  it('responds with heartbeat:pong even before joining a room', () => {
    const ioHandlers = new Map<string, (...args: any[]) => void>();
    const socketHandlers = new Map<string, (...args: any[]) => void>();
    const socket = {
      id: 'socket-1',
      on: jest.fn((event: string, handler: (...args: any[]) => void) => {
        socketHandlers.set(event, handler);
      }),
      emit: jest.fn(),
      to: jest.fn(() => ({ emit: jest.fn() })),
      join: jest.fn(),
      leave: jest.fn(),
    };
    const io = {
      on: jest.fn((event: string, handler: (...args: any[]) => void) => {
        ioHandlers.set(event, handler);
      }),
      to: jest.fn(() => ({ emit: jest.fn() })),
    };

    const server = new WatchRoomServer(io as any);
    ioHandlers.get('connection')?.(socket);
    socketHandlers.get('heartbeat')?.();

    expect(socket.emit).toHaveBeenCalledWith(
      'heartbeat:pong',
      expect.objectContaining({ timestamp: expect.any(Number) })
    );

    server.destroy();
  });
});
