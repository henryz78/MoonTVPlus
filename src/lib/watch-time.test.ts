import { db } from './db';
import { lockManager } from './lock';
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
    lockManager.clear();
    (db.getGlobalValue as jest.Mock).mockResolvedValue(null);
  });

  it('accepts a first report up to the startup catch-up window', async () => {
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
        progressTime: 300,
        deltaSeconds: 300,
      },
      NOW
    );

    expect(result.acceptedSeconds).toBe(300);
    expect(result.totalWatchSeconds).toBe(300);
    expect(db.setGlobalValue).toHaveBeenCalledWith(
      getWatchTimeUserKey('alice'),
      expect.stringContaining('"watchSeconds":300')
    );
  });

  it('caps a huge first report to the startup catch-up window', async () => {
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

    expect(result.acceptedSeconds).toBe(300);
    expect(result.totalWatchSeconds).toBe(300);
  });

  it('limits a new entry report after the user already has watch-time history', async () => {
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
            progressTime: 300,
            watchSeconds: 300,
            dailySeconds: { '2026-06-18': 300 },
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
        id: 'another-movie',
        title: '星际穿越',
        sourceName: '测试源',
        episode: 1,
        totalEpisodes: 1,
        totalTime: 7200,
        progressTime: 300,
        deltaSeconds: 300,
      },
      NOW + 60_000
    );

    expect(result.acceptedSeconds).toBe(60);
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

  it('serializes concurrent reports for the same user ledger', async () => {
    let storedLedger: string | null = null;
    (db.getGlobalValue as jest.Mock).mockImplementation(
      async () => storedLedger
    );
    (db.setGlobalValue as jest.Mock).mockImplementation(async (_key, value) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      storedLedger = value;
    });

    await Promise.all([
      recordWatchTime(
        {
          username: 'alice',
          source: 'source',
          id: 'movie',
          title: '沙丘',
          sourceName: '测试源',
          episode: 1,
          totalEpisodes: 1,
          totalTime: 7200,
          progressTime: 10,
          deltaSeconds: 10,
        },
        NOW
      ),
      recordWatchTime(
        {
          username: 'alice',
          source: 'source',
          id: 'movie',
          title: '沙丘',
          sourceName: '测试源',
          episode: 1,
          totalEpisodes: 1,
          totalTime: 7200,
          progressTime: 30,
          deltaSeconds: 20,
        },
        NOW + 20_000
      ),
    ]);

    const ledger = JSON.parse(storedLedger || '{}');
    expect(ledger.entries['source+movie:1'].watchSeconds).toBe(30);
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
