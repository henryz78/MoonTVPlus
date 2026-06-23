import { db } from './db';
import {
  getCurrentWeekWatchTime,
  getUserWatchSeconds,
  getWatchTimeUserKey,
  getWatchTimeEntries,
  recordWatchTime,
} from './watch-time';

jest.mock('./db', () => ({
  db: {
    getGlobalValue: jest.fn(),
    setGlobalValue: jest.fn(),
  },
}));

const NOW = new Date('2026-06-18T20:00:00.000Z').getTime();

describe('watch time ledger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.getGlobalValue as jest.Mock).mockResolvedValue(null);
  });

  it('clamps a seeked progress report to the real report window', async () => {
    const result = await recordWatchTime(
      {
        username: 'alice',
        source: 'source',
        id: 'movie',
        title: '沙丘',
        sourceName: '测试源',
        episode: 1,
        totalEpisodes: 1,
        totalTime: 7200,
        progressTime: 3600,
        deltaSeconds: 3600,
      },
      NOW
    );

    expect(result.acceptedSeconds).toBe(60);
    expect(result.totalWatchSeconds).toBe(60);
    expect(db.setGlobalValue).toHaveBeenCalledWith(
      getWatchTimeUserKey('alice'),
      expect.stringContaining('"watchSeconds":60')
    );
  });

  it('limits repeated reports by elapsed server time', async () => {
    (db.getGlobalValue as jest.Mock).mockResolvedValue(
      JSON.stringify({
        version: 1,
        updatedAt: NOW,
        entries: {
          'source+movie:1': {
            key: 'source+movie:1',
            source: 'source',
            id: 'movie',
            title: '沙丘',
            sourceName: '测试源',
            cover: '',
            year: '',
            episode: 1,
            totalEpisodes: 1,
            totalTime: 7200,
            progressTime: 20,
            watchSeconds: 20,
            dailySeconds: { '2026-06-18': 20 },
            firstWatchedAt: NOW,
            lastWatchedAt: NOW,
            lastReportedAt: NOW,
          },
        },
      })
    );

    const result = await recordWatchTime(
      {
        username: 'alice',
        source: 'source',
        id: 'movie',
        title: '沙丘',
        sourceName: '测试源',
        episode: 1,
        totalEpisodes: 1,
        totalTime: 7200,
        progressTime: 3600,
        deltaSeconds: 60,
      },
      NOW + 10_000
    );

    expect(result.acceptedSeconds).toBe(15);
    expect(result.totalWatchSeconds).toBe(35);
  });

  it('keeps watch seconds independent from play record deletion', async () => {
    (db.getGlobalValue as jest.Mock).mockResolvedValue(
      JSON.stringify({
        version: 1,
        updatedAt: NOW,
        entries: {
          'source+movie:1': {
            key: 'source+movie:1',
            source: 'source',
            id: 'movie',
            title: '沙丘',
            sourceName: '测试源',
            cover: '',
            year: '',
            episode: 1,
            totalEpisodes: 1,
            totalTime: 7200,
            progressTime: 3600,
            watchSeconds: 3600,
            dailySeconds: { '2026-06-18': 3600 },
            firstWatchedAt: NOW,
            lastWatchedAt: NOW,
            lastReportedAt: NOW,
          },
        },
      })
    );

    await expect(getUserWatchSeconds('alice')).resolves.toBe(3600);
    await expect(getWatchTimeEntries('alice')).resolves.toHaveLength(1);
    expect(db.getGlobalValue).toHaveBeenCalledWith(
      getWatchTimeUserKey('alice')
    );
  });

  it('sums only daily buckets inside the requested range', async () => {
    (db.getGlobalValue as jest.Mock).mockResolvedValue(
      JSON.stringify({
        version: 1,
        updatedAt: NOW,
        entries: {
          'source+movie:1': {
            key: 'source+movie:1',
            source: 'source',
            id: 'movie',
            title: '沙丘',
            sourceName: '测试源',
            cover: '',
            year: '',
            episode: 1,
            totalEpisodes: 1,
            totalTime: 7200,
            progressTime: 3600,
            watchSeconds: 11_400,
            dailySeconds: {
              '2026-06-14': 7200,
              '2026-06-18': 3600,
              '2026-06-21': 600,
            },
            firstWatchedAt: NOW,
            lastWatchedAt: NOW,
            lastReportedAt: NOW,
          },
        },
      })
    );

    await expect(
      getUserWatchSeconds('alice', {
        startAt: new Date('2026-06-15T00:00:00').getTime(),
        endAt: new Date('2026-06-22T00:00:00').getTime() - 1,
      })
    ).resolves.toBe(4200);
  });

  it('returns the authenticated user current-week watch seconds', async () => {
    (db.getGlobalValue as jest.Mock).mockResolvedValue(
      JSON.stringify({
        version: 1,
        updatedAt: NOW,
        entries: {
          'source+movie:1': {
            key: 'source+movie:1',
            source: 'source',
            id: 'movie',
            title: '沙丘',
            sourceName: '测试源',
            cover: '',
            year: '',
            episode: 1,
            totalEpisodes: 1,
            totalTime: 7200,
            progressTime: 3600,
            watchSeconds: 11_400,
            dailySeconds: {
              '2026-06-14': 7200,
              '2026-06-15': 1800,
              '2026-06-18': 3600,
            },
            firstWatchedAt: NOW,
            lastWatchedAt: NOW,
            lastReportedAt: NOW,
          },
        },
      })
    );

    await expect(getCurrentWeekWatchTime('alice', NOW)).resolves.toEqual({
      watchSeconds: 5400,
      weekStartAt: new Date('2026-06-15T00:00:00').getTime(),
      weekEndAt: NOW,
    });
  });
});
