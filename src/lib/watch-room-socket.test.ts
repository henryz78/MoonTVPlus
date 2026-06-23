type Handler = (...args: unknown[]) => void;

interface FakeSocket {
  connected: boolean;
  io: {
    on: jest.Mock;
    off: jest.Mock;
  };
  on: jest.Mock;
  once: jest.Mock;
  off: jest.Mock;
  emit: jest.Mock;
  connect: jest.Mock;
  disconnect: jest.Mock;
  dispatch: (event: string, ...args: unknown[]) => void;
  dispatchIo: (event: string, ...args: unknown[]) => void;
}

function createFakeSocket() {
  const handlers = new Map<string, Set<Handler>>();
  const ioHandlers = new Map<string, Set<Handler>>();

  const addHandler = (
    store: Map<string, Set<Handler>>,
    event: string,
    handler: Handler
  ) => {
    const eventHandlers = store.get(event) ?? new Set<Handler>();
    eventHandlers.add(handler);
    store.set(event, eventHandlers);
  };

  const removeHandlers = (store: Map<string, Set<Handler>>, event: string) => {
    store.delete(event);
  };

  const dispatch = (
    store: Map<string, Set<Handler>>,
    event: string,
    ...args: unknown[]
  ) => {
    const eventHandlers = Array.from(store.get(event) ?? []);
    eventHandlers.forEach((handler) => handler(...args));
  };

  const socket: FakeSocket = {
    connected: false,
    io: {
      on: jest.fn((event: string, handler: Handler) => {
        addHandler(ioHandlers, event, handler);
      }),
      off: jest.fn((event: string) => {
        removeHandlers(ioHandlers, event);
      }),
    },
    on: jest.fn((event: string, handler: Handler) => {
      addHandler(handlers, event, handler);
    }),
    once: jest.fn((event: string, handler: Handler) => {
      const wrapped = (...args: unknown[]) => {
        handlers.get(event)?.delete(wrapped);
        handler(...args);
      };
      addHandler(handlers, event, wrapped);
    }),
    off: jest.fn((event: string) => {
      removeHandlers(handlers, event);
    }),
    emit: jest.fn(),
    connect: jest.fn(() => {
      socket.connected = true;
      dispatch(handlers, 'connect');
    }),
    disconnect: jest.fn(() => {
      socket.connected = false;
      dispatch(handlers, 'disconnect', 'io client disconnect');
    }),
    dispatch(event: string, ...args: unknown[]) {
      if (event === 'connect') {
        socket.connected = true;
      }
      dispatch(handlers, event, ...args);
    },
    dispatchIo(event: string, ...args: unknown[]) {
      dispatch(ioHandlers, event, ...args);
    },
  };

  return socket;
}

let mockSocket: ReturnType<typeof createFakeSocket>;

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => {
    mockSocket = createFakeSocket();
    return mockSocket;
  }),
}));

describe('watchRoomSocketManager', () => {
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('keeps sending heartbeat without warning when the server does not reply with heartbeat:pong', async () => {
    const { watchRoomSocketManager } = await import('./watch-room-socket');

    const connection = watchRoomSocketManager.connect({
      enabled: true,
      serverType: 'external',
      externalServerUrl: 'wss://watch-room.example.com',
      externalServerAuth: 'secret',
    });

    mockSocket.dispatch('connect');
    await connection;

    jest.advanceTimersByTime(20_000);

    expect(mockSocket.emit).toHaveBeenCalledWith('heartbeat');
    expect(warnSpy).not.toHaveBeenCalledWith(
      '[WatchRoom] Heartbeat timeout detected, last response was',
      expect.any(Number),
      'ms ago'
    );

    watchRoomSocketManager.disconnect();
  });
});

export {};
