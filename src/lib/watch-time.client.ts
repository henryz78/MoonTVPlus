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
  acceptedSeconds: number;
  totalWatchSeconds?: number;
}

export interface WatchTimeReportInput {
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

function reportKey(
  input: Pick<WatchTimeReportInput, 'source' | 'id' | 'episode'>
) {
  return `${input.source}\u0000${input.id}\u0000${input.episode}`;
}

export class WatchTimeReportQueue {
  private reports: WatchTimeReportInput[] = [];
  private inFlight = false;
  private drainRequested = false;

  enqueue(report: WatchTimeReportInput) {
    if (report.deltaSeconds <= 0) return;

    const key = reportKey(report);
    const existing = this.reports.find((item) => reportKey(item) === key);
    if (existing) {
      const deltaSeconds = existing.deltaSeconds + report.deltaSeconds;
      Object.assign(existing, report, { deltaSeconds });
      return;
    }

    this.reports.push({ ...report });
  }

  async flushNext() {
    if (this.inFlight) return;

    const report = this.reports.shift();
    if (!report) return;

    this.inFlight = true;
    try {
      const retryReport = await this.getRetryReport(report);
      if (retryReport) this.requeueFirst(retryReport);
    } finally {
      this.inFlight = false;
      this.flushRequestedDrain();
    }
  }

  async flushAll() {
    if (this.inFlight) {
      this.drainRequested = true;
      return;
    }

    const pending = this.reports.splice(0);
    if (!pending.length) return;

    const retryReports: WatchTimeReportInput[] = [];
    this.inFlight = true;
    try {
      for (const report of pending) {
        const retryReport = await this.getRetryReport(report);
        if (retryReport) retryReports.push(retryReport);
      }
    } finally {
      this.reports = [...retryReports, ...this.reports];
      this.inFlight = false;
      this.flushRequestedDrain();
    }
  }

  private requeueFirst(report: WatchTimeReportInput) {
    if (report.deltaSeconds <= 0) return;
    this.reports.unshift({ ...report });
  }

  private async getRetryReport(report: WatchTimeReportInput) {
    try {
      const result = await reportWatchTime(report);
      const unacceptedSeconds = getUnacceptedWatchSeconds(
        report.deltaSeconds,
        result?.acceptedSeconds
      );
      if (unacceptedSeconds > 0) {
        return { ...report, deltaSeconds: unacceptedSeconds };
      }
      return null;
    } catch {
      return report;
    }
  }

  private flushRequestedDrain() {
    if (!this.drainRequested) return;
    this.drainRequested = false;
    if (this.reports.length > 0) {
      void this.flushAll();
    }
  }
}

export async function reportWatchTime(
  input: WatchTimeReportInput
): Promise<WatchTimeReportResponse | null> {
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

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Invalid watch time response');
  }

  const acceptedSeconds = (body as Partial<WatchTimeReportResponse>)
    ?.acceptedSeconds;
  if (
    typeof acceptedSeconds !== 'number' ||
    !Number.isFinite(acceptedSeconds)
  ) {
    throw new Error('Invalid watch time response');
  }

  return body as WatchTimeReportResponse;
}
