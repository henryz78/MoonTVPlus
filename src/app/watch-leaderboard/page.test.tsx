import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import WatchLeaderboardPage from './page';

jest.mock('@/components/PageLayout', () => {
  return function MockPageLayout({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  };
});

describe('WatchLeaderboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('type=all-time')) {
        return {
          ok: true,
          json: async () => ({
            type: 'all-time',
            page: 1,
            limit: 10,
            total: 1,
            totalPages: 1,
            rows: [
              {
                username: 'Ken',
                rank: 1,
                watchSeconds: 12_600,
                reward: { level: 2, title: '本周影迷', minSeconds: 10_800 },
                rankTitle: '周榜冠军',
                qualified: true,
              },
            ],
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          type: 'weekly',
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          weekLabel: '2026-06-15 - 2026-06-21',
          rewardExpiresAt: 1_800_000_000_000,
          rows: [
            {
              username: 'Henry',
              rank: 1,
              watchSeconds: 66_120,
              reward: { level: 4, title: '本周放映王', minSeconds: 50_400 },
              rankTitle: '周榜冠军',
              qualified: true,
            },
            {
              username: 'Ken',
              rank: 2,
              watchSeconds: 1_200,
              reward: null,
              rankTitle: null,
              qualified: false,
            },
          ],
        }),
      } as Response;
    }) as jest.Mock;
  });

  it('renders weekly leaderboard by default with reward preview', async () => {
    render(<WatchLeaderboardPage />);

    expect(await screen.findByText('观影排行榜')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上周榜' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部榜' })).toBeInTheDocument();
    expect(
      await screen.findByText('2026-06-15 - 2026-06-21')
    ).toBeInTheDocument();
    expect(screen.getByText('Henry')).toBeInTheDocument();
    expect(screen.getByText('周榜冠军')).toBeInTheDocument();
    expect(screen.getAllByText('本周放映王').length).toBeGreaterThan(0);
    expect(screen.getByText('未达标')).toBeInTheDocument();
    expect(screen.getByText('奖励有效期 7 天')).toBeInTheDocument();
    expect(screen.getByText('奖励预览')).toBeInTheDocument();
  });

  it('switches to all-time leaderboard and hides weekly reward preview', async () => {
    render(<WatchLeaderboardPage />);

    await screen.findByText('奖励预览');
    fireEvent.click(screen.getByRole('button', { name: '全部榜' }));

    await waitFor(() => {
      expect(window.fetch).toHaveBeenLastCalledWith(
        '/api/watch-leaderboard?type=all-time&page=1&limit=10',
        { cache: 'no-store' }
      );
    });
    expect(await screen.findByText('3 小时 30 分钟')).toBeInTheDocument();
    expect(screen.queryByText('本周影迷')).not.toBeInTheDocument();
    expect(screen.queryByText('周榜冠军')).not.toBeInTheDocument();
    expect(screen.queryByText('奖励预览')).not.toBeInTheDocument();
  });
});
