import { RealWatchTimeTracker } from './watch-time.client';

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
