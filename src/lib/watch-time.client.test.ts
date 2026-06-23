import { fetchWithAuth } from './db.client';
import { RealWatchTimeTracker, reportWatchTime } from './watch-time.client';

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
    (fetchWithAuth as jest.Mock).mockResolvedValue({ ok: true });
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
});
