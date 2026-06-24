import { fetchWithAuth } from './db.client';
import {
  RealWatchTimeTracker,
  WatchTimeReportQueue,
  getUnacceptedWatchSeconds,
  reportWatchTime,
} from './watch-time.client';

jest.mock('./db.client', () => ({
  fetchWithAuth: jest.fn(),
}));

describe('RealWatchTimeTracker', () => {
  it('counts visible playing wall-clock seconds', () => {
    const tracker = new RealWatchTimeTracker();

    tracker.start({
      now: 1_000,
      position: 10,
      playing: true,
      visible: true,
      playbackRate: 1,
    });

    expect(
      tracker.tick({
        now: 21_000,
        position: 30,
        playing: true,
        visible: true,
        playbackRate: 1,
      })
    ).toBe(20);
  });

  it('accumulates frequent subsecond timeupdate ticks', () => {
    const tracker = new RealWatchTimeTracker();

    tracker.start({
      now: 1_000,
      position: 10,
      playing: true,
      visible: true,
      playbackRate: 1,
    });

    let total = 0;
    for (let index = 1; index <= 40; index += 1) {
      total += tracker.tick({
        now: 1_000 + index * 500,
        position: 10 + index * 0.5,
        playing: true,
        visible: true,
        playbackRate: 1,
      });
    }

    expect(total).toBe(20);
  });

  it('does not turn a seek jump into watch seconds', () => {
    const tracker = new RealWatchTimeTracker();

    tracker.start({
      now: 1_000,
      position: 10,
      playing: true,
      visible: true,
      playbackRate: 1,
    });
    tracker.reset({
      now: 11_000,
      position: 3600,
      playing: true,
      visible: true,
      playbackRate: 1,
    });

    expect(
      tracker.tick({
        now: 21_000,
        position: 3602,
        playing: true,
        visible: true,
        playbackRate: 1,
      })
    ).toBe(2);
  });

  it('skips hidden or paused time', () => {
    const tracker = new RealWatchTimeTracker();

    tracker.start({
      now: 1_000,
      position: 10,
      playing: true,
      visible: true,
      playbackRate: 1,
    });

    expect(
      tracker.tick({
        now: 21_000,
        position: 30,
        playing: false,
        visible: true,
        playbackRate: 1,
      })
    ).toBe(0);

    expect(
      tracker.tick({
        now: 41_000,
        position: 50,
        playing: true,
        visible: false,
        playbackRate: 1,
      })
    ).toBe(0);
  });
});

describe('reportWatchTime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchWithAuth as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ acceptedSeconds: 15, totalWatchSeconds: 15 }),
    });
  });

  it('uses the auth-aware fetch path so expired tokens can be refreshed', async () => {
    await reportWatchTime({
      source: 'source',
      id: 'movie',
      title: '沙丘',
      sourceName: '测试源',
      episode: 1,
      totalEpisodes: 1,
      totalTime: 7200,
      progressTime: 30,
      deltaSeconds: 15,
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/watch-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'source',
        id: 'movie',
        title: '沙丘',
        sourceName: '测试源',
        episode: 1,
        totalEpisodes: 1,
        totalTime: 7200,
        progressTime: 30,
        deltaSeconds: 15,
      }),
    });
  });

  it('throws when the watch-time API rejects the report', async () => {
    (fetchWithAuth as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    });

    await expect(
      reportWatchTime({
        source: 'source',
        id: 'movie',
        title: '沙丘',
        sourceName: '测试源',
        episode: 1,
        totalEpisodes: 1,
        totalTime: 7200,
        progressTime: 30,
        deltaSeconds: 15,
      })
    ).rejects.toThrow('Internal Server Error');
  });

  it('throws when a successful response does not include accepted seconds', async () => {
    (fetchWithAuth as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await expect(
      reportWatchTime({
        source: 'source',
        id: 'movie',
        title: '沙丘',
        sourceName: '测试源',
        episode: 1,
        totalEpisodes: 1,
        totalTime: 7200,
        progressTime: 30,
        deltaSeconds: 15,
      })
    ).rejects.toThrow('Invalid watch time response');
  });
});

describe('getUnacceptedWatchSeconds', () => {
  it('keeps the seconds that the server did not accept', () => {
    expect(getUnacceptedWatchSeconds(45, 20)).toBe(25);
    expect(getUnacceptedWatchSeconds(45, 45)).toBe(0);
    expect(getUnacceptedWatchSeconds(45, undefined)).toBe(0);
  });
});

describe('WatchTimeReportQueue', () => {
  const makeReport = (
    input: Partial<Parameters<WatchTimeReportQueue['enqueue']>[0]> = {}
  ) => ({
    source: input.source || 'source',
    id: input.id || 'movie',
    title: input.title || '沙丘',
    sourceName: input.sourceName || '测试源',
    episode: input.episode || 1,
    totalEpisodes: input.totalEpisodes || 1,
    totalTime: input.totalTime || 7200,
    progressTime: input.progressTime || 30,
    deltaSeconds: input.deltaSeconds || 15,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retries unaccepted seconds with the original report identity first', async () => {
    (fetchWithAuth as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ acceptedSeconds: 20, totalWatchSeconds: 20 }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ acceptedSeconds: 999, totalWatchSeconds: 999 }),
      });

    const queue = new WatchTimeReportQueue();
    queue.enqueue(
      makeReport({ id: 'old-movie', episode: 1, deltaSeconds: 45 })
    );
    await queue.flushNext();

    queue.enqueue(
      makeReport({ id: 'new-movie', episode: 2, deltaSeconds: 10 })
    );
    await queue.flushNext();
    await queue.flushNext();

    const sentBodies = (fetchWithAuth as jest.Mock).mock.calls.map((call) =>
      JSON.parse(call[1].body)
    );

    expect(sentBodies).toEqual([
      expect.objectContaining({
        id: 'old-movie',
        episode: 1,
        deltaSeconds: 45,
      }),
      expect.objectContaining({
        id: 'old-movie',
        episode: 1,
        deltaSeconds: 25,
      }),
      expect.objectContaining({
        id: 'new-movie',
        episode: 2,
        deltaSeconds: 10,
      }),
    ]);
  });

  it('keeps the original report queued when the API response is invalid', async () => {
    (fetchWithAuth as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ acceptedSeconds: 15, totalWatchSeconds: 15 }),
      });

    const queue = new WatchTimeReportQueue();
    queue.enqueue(makeReport({ id: 'movie', deltaSeconds: 15 }));

    await queue.flushNext();
    await queue.flushNext();

    const sentBodies = (fetchWithAuth as jest.Mock).mock.calls.map((call) =>
      JSON.parse(call[1].body)
    );

    expect(sentBodies).toEqual([
      expect.objectContaining({ id: 'movie', deltaSeconds: 15 }),
      expect.objectContaining({ id: 'movie', deltaSeconds: 15 }),
    ]);
  });

  it('flushes later queued reports during forced cleanup even when the first report must retry', async () => {
    (fetchWithAuth as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ acceptedSeconds: 15, totalWatchSeconds: 15 }),
      });

    const queue = new WatchTimeReportQueue();
    queue.enqueue(makeReport({ id: 'old-movie', deltaSeconds: 15 }));
    queue.enqueue(makeReport({ id: 'new-movie', deltaSeconds: 15 }));

    await queue.flushAll();
    await queue.flushNext();

    const sentBodies = (fetchWithAuth as jest.Mock).mock.calls.map((call) =>
      JSON.parse(call[1].body)
    );

    expect(sentBodies).toEqual([
      expect.objectContaining({ id: 'old-movie', deltaSeconds: 15 }),
      expect.objectContaining({ id: 'new-movie', deltaSeconds: 15 }),
      expect.objectContaining({ id: 'old-movie', deltaSeconds: 15 }),
    ]);
  });

  it('drains queued reports after the current in-flight report finishes', async () => {
    let resolveFirstResponse: (value: unknown) => void = () => undefined;
    const firstResponse = new Promise((resolve) => {
      resolveFirstResponse = resolve;
    });
    (fetchWithAuth as jest.Mock)
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValue({
        ok: true,
        json: async () => ({ acceptedSeconds: 15, totalWatchSeconds: 15 }),
      });

    const queue = new WatchTimeReportQueue();
    queue.enqueue(makeReport({ id: 'old-movie', deltaSeconds: 15 }));
    queue.enqueue(makeReport({ id: 'new-movie', deltaSeconds: 15 }));

    const firstFlush = queue.flushNext();
    await Promise.resolve();
    await queue.flushAll();

    expect(fetchWithAuth).toHaveBeenCalledTimes(1);

    resolveFirstResponse({
      ok: true,
      json: async () => ({ acceptedSeconds: 15, totalWatchSeconds: 15 }),
    });
    await firstFlush;
    await new Promise((resolve) => setTimeout(resolve, 0));

    const sentBodies = (fetchWithAuth as jest.Mock).mock.calls.map((call) =>
      JSON.parse(call[1].body)
    );

    expect(sentBodies).toEqual([
      expect.objectContaining({ id: 'old-movie', deltaSeconds: 15 }),
      expect.objectContaining({ id: 'new-movie', deltaSeconds: 15 }),
    ]);
  });
});
