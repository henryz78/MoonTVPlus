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
export const WATCH_TIME_REPORT_INTERVAL_MS = 15_000;

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
  private pendingSeconds = 0;

  start(state: WatchTimeTrackerState) {
    this.lastState = state;
    this.pendingSeconds = 0;
  }

  reset(state: WatchTimeTrackerState) {
    this.lastState = state;
    this.pendingSeconds = 0;
  }

  tick(state: WatchTimeTrackerState) {
    if (!this.lastState) {
      this.lastState = state;
      return 0;
    }

    const previous = this.lastState;
    this.lastState = state;

    if (!canCount(previous) || !canCount(state)) {
      this.pendingSeconds = 0;
      return 0;
    }

    const elapsedSeconds = Math.max(0, (state.now - previous.now) / 1000);
    if (elapsedSeconds <= 0) return 0;

    const positionDelta = Math.max(0, state.position - previous.position);
    const plausiblePositionDelta =
      elapsedSeconds * Math.max(previous.playbackRate, state.playbackRate) + 2;

    const countableSeconds = Math.min(
      elapsedSeconds,
      positionDelta,
      plausiblePositionDelta,
      MAX_TICK_SECONDS
    );
    this.pendingSeconds += countableSeconds;

    const wholeSeconds = Math.floor(this.pendingSeconds);
    this.pendingSeconds -= wholeSeconds;
    return wholeSeconds;
  }
}

export interface WatchTimeReportResponse {
  acceptedSeconds?: number;
  totalWatchSeconds?: number;
}

export function getUnacceptedWatchSeconds(
  deltaSeconds: number,
  acceptedSeconds: number | undefined
) {
  if (!Number.isFinite(acceptedSeconds)) return 0;

  const requested = Math.max(0, Math.floor(deltaSeconds));
  const accepted = Math.max(0, Math.floor(acceptedSeconds || 0));
  return Math.max(0, requested - accepted);
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
}): Promise<WatchTimeReportResponse | null> {
  if (input.deltaSeconds <= 0) return null;

  const response = await fetchWithAuth('/api/watch-time', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let message = `Watch time report failed: ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // Keep the status-based message when the response body is not JSON.
    }
    throw new Error(message);
  }

  try {
    return (await response.json()) as WatchTimeReportResponse;
  } catch {
    return null;
  }
}
