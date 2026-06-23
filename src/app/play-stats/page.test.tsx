import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import PlayStatsPage from './page';

const NOW = 1_800_000_000_000;

jest.mock('@/components/PageLayout', () => {
  return function MockPageLayout({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  };
});

describe('PlayStatsPage', () => {
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.clearAllMocks();
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    window.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        viewerRole: 'admin',
        totalUsers: 2,
        onlineUsers: 1,
        totalPlayRecords: 6,
        totalWatchSeconds: 18_300,
        todayActiveUsers: 1,
        last7DaysActiveUsers: 2,
        todayPlayRecords: 3,
        last7DaysPlayRecords: 6,
        todayWatchSeconds: 7_200,
        last7DaysWatchSeconds: 18_300,
        lastWatchAt: NOW - 30_000,
        topTitles: [
          {
            title: '识骨寻踪第一季',
            count: 3,
            watchSeconds: 3_600,
            latestSaveTime: NOW - 30_000,
          },
        ],
        userRanking: [
          {
            username: 'alice',
            role: 'user',
            playRecordCount: 6,
            watchSeconds: 5_400,
            lastActiveAt: NOW - 30_000,
            isOnline: true,
            latestPlayRecord: {
              username: 'alice',
              title: '识骨寻踪第一季',
              episode: 1,
              sourceName: 'source',
              progressPercent: 67,
              saveTime: NOW - 30_000,
            },
          },
        ],
        recentRecords: [
          {
            username: 'alice',
            title: '识骨寻踪第一季',
            episode: 1,
            sourceName: 'source',
            progressPercent: 67,
            watchSeconds: 5_400,
            saveTime: NOW - 30_000,
          },
        ],
      }),
    })) as jest.Mock;
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it('loads and renders play stats sections', async () => {
    render(<PlayStatsPage />);

    expect(await screen.findByText('播放统计')).toBeInTheDocument();
    expect(await screen.findByText('可见用户')).toBeInTheDocument();
    expect(screen.getByText('在线 1 人')).toBeInTheDocument();
    expect(screen.getByText('观看记录')).toBeInTheDocument();
    expect(screen.getByText('今日 3 条')).toBeInTheDocument();
    expect(screen.getByText('总观看时长')).toBeInTheDocument();
    expect(screen.getByText('5 小时 5 分钟')).toBeInTheDocument();
    expect(
      screen.getByText('今日 2 小时 · 近 7 天 5 小时 5 分钟')
    ).toBeInTheDocument();
    expect(screen.getByText('最近观看最多')).toBeInTheDocument();
    expect(screen.getAllByText(/识骨寻踪第一季/).length).toBeGreaterThan(0);
    expect(screen.getByText('已看 1 小时')).toBeInTheDocument();
    expect(screen.queryByText('用户排行')).not.toBeInTheDocument();
    expect(screen.queryByText('6 条 · 1 小时 30 分钟')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '刷新' }));

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps title sections shrinkable on narrow screens', async () => {
    render(<PlayStatsPage />);

    expect(await screen.findByText('最近观看最多')).toBeInTheDocument();

    expect(screen.getByText('最近观看最多').closest('section')).toHaveClass(
      'min-w-0',
      'overflow-hidden'
    );
    expect(screen.getByText('1. 识骨寻踪第一季')).toHaveClass('break-words');
  });

  it('shows seconds for short watch durations', async () => {
    window.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        viewerRole: 'user',
        totalPlayRecords: 1,
        totalWatchSeconds: 95,
        todayPlayRecords: 1,
        last7DaysPlayRecords: 1,
        todayWatchSeconds: 95,
        last7DaysWatchSeconds: 95,
        lastWatchAt: NOW - 30_000,
        latestRecord: {
          title: '短片',
          episode: 1,
          sourceName: 'source',
          progressPercent: 10,
          watchSeconds: 95,
          saveTime: NOW - 30_000,
        },
        recentRecords: [],
      }),
    })) as jest.Mock;

    render(<PlayStatsPage />);

    expect(await screen.findByText('1 分钟 35 秒')).toBeInTheDocument();
    expect(
      screen.getByText('今日 1 分钟 35 秒 · 近 7 天 1 分钟 35 秒')
    ).toBeInTheDocument();
  });

  it('uses neutral copy while stats are loading', () => {
    window.fetch = jest.fn(
      () => new Promise<Response>(() => undefined)
    ) as jest.Mock;

    render(<PlayStatsPage />);

    expect(screen.getByText('查看观看记录和播放时长')).toBeInTheDocument();
    expect(
      screen.queryByText('查看可见范围内的观看记录和活跃概况')
    ).not.toBeInTheDocument();
  });

  it('renders normal users as a personal watch summary', async () => {
    window.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        viewerRole: 'user',
        totalPlayRecords: 2,
        totalWatchSeconds: 7_200,
        todayPlayRecords: 1,
        last7DaysPlayRecords: 2,
        todayWatchSeconds: 3_600,
        last7DaysWatchSeconds: 7_200,
        lastWatchAt: NOW - 30_000,
        latestRecord: {
          title: '我的电影',
          episode: 3,
          sourceName: 'source',
          progressPercent: 80,
          watchSeconds: 3_600,
          saveTime: NOW - 30_000,
        },
        recentRecords: [
          {
            title: '我的电影',
            episode: 3,
            sourceName: 'source',
            progressPercent: 80,
            watchSeconds: 3_600,
            saveTime: NOW - 30_000,
          },
        ],
      }),
    })) as jest.Mock;

    render(<PlayStatsPage />);

    expect(await screen.findByText('播放统计')).toBeInTheDocument();
    expect(
      await screen.findByText('查看自己的观看记录和播放时长')
    ).toBeInTheDocument();
    expect(screen.queryByText('可见用户')).not.toBeInTheDocument();
    expect(screen.queryByText('活跃用户')).not.toBeInTheDocument();
    expect(screen.queryByText('最近观看最多')).not.toBeInTheDocument();
    expect(screen.getByText('观看记录')).toBeInTheDocument();
    expect(screen.getByText('总观看时长')).toBeInTheDocument();
    expect(screen.getByText('上次观看')).toBeInTheDocument();
    expect(screen.getByText('最近观看')).toBeInTheDocument();
    expect(screen.getByText('最近观看记录')).toBeInTheDocument();
    expect(screen.getAllByText(/我的电影/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/用户：/)).not.toBeInTheDocument();
  });
});
