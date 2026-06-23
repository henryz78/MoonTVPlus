import { fetchWithAuth } from './db.client';

export interface WatchTimeTrackerState {
  now: number;
  position: number;
  playing: boolean;
  visible: boolean;
  playbackRate: number;
}

const MIN_PLAYBACK_RATE = 0.5;
const MAX_PLAYBACK_RATE = 2;
const MAX_TICK_SECONDS = 60;

function canCount(state: WatchTimeTrackerState) {
  return (
    state.playing &&
    state.visible &&
    state.playbackRate >= MIN_PLAYBACK_RATE &&
    state.playbackRate <= MAX_PLAYBACK_RATE
  );
}

export class RealWatchTimeTracker {
  private lastState: WatchTimeTrackerState | null = null;

  start(state: WatchTimeTrackerState) {
    this.lastState = state;
  }

  reset(state: WatchTimeTrackerState) {
    this.lastState = state;
  }

  tick(state: WatchTimeTrackerState) {
    if (!this.lastState) {
      this.lastState = state;
      return 0;
    }

    const previous = this.lastState;
    this.lastState = state;

    if (!canCount(previous) || !canCount(state)) {
      return 0;
    }

    const elapsedSeconds = Math.max(
      0,
      Math.floor((state.now - previous.now) / 1000)
    );
    if (elapsedSeconds <= 0) return 0;

    const positionDelta = Math.max(0, state.position - previous.position);
    const plausiblePositionDelta = Math.ceil(
      elapsedSeconds * Math.max(previous.playbackRate, state.playbackRate) + 2
    );

    return Math.min(
      elapsedSeconds,
      positionDelta,
      plausiblePositionDelta,
      MAX_TICK_SECONDS
    );
  }
}

export async function reportWatchTime(input: {
  source: string;
  id: string;
  title: string;
  sourceName: string;
  cover?: string;
  year?: string;
  episode: number;
  totalEpisodes: number;
  totalTime: number;
  progressTime: number;
  deltaSeconds: number;
}) {
  if (input.deltaSeconds <= 0) return;

  await fetchWithAuth('/api/watch-time', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
