import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import UserActivityPage from './page';

const NOW = 1_800_000_000_000;
const THREE_HOURS_AGO = NOW - 3 * 60 * 60 * 1000;

jest.mock('@/components/PageLayout', () => {
  return function MockPageLayout({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  };
});

describe('UserActivityPage', () => {
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.clearAllMocks();
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    window.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/admin/user-activity/alice')) {
        return {
          ok: true,
          json: async () => ({
            user: {
              username: 'alice',
              role: 'user',
              banned: false,
              lastActiveAt: THREE_HOURS_AGO,
              playRecordCount: 1,
              currentReward: {
                level: 1,
                title: '本周观影者',
                minSeconds: 3600,
              },
              currentRankTitle: '周榜季军',
            },
            records: [
              {
                key: 'source+movie',
                title: '沙丘',
                source_name: 'source',
                cover: '',
                index: 1,
                total_episodes: 2,
                play_time: 30,
                total_time: 60,
                save_time: 1_700_000_000_000,
              },
            ],
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          users: [
            {
              username: 'alice',
              role: 'user',
              banned: false,
              lastActiveAt: THREE_HOURS_AGO,
              isOnline: false,
              playRecordCount: 1,
              currentReward: {
                level: 1,
                title: '本周观影者',
                minSeconds: 3600,
              },
              currentRankTitle: '周榜季军',
              latestPlayRecord: {
                title: '沙丘',
                episode: 1,
                sourceName: 'source',
                progressPercent: 50,
                saveTime: 1_700_000_000_000,
              },
            },
            {
              username: 'bob',
              role: 'user',
              banned: false,
              lastActiveAt: null,
              isOnline: false,
              playRecordCount: 0,
              currentReward: null,
              currentRankTitle: null,
              latestPlayRecord: null,
            },
          ],
          total: 2,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      } as Response;
    });
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it('loads overview rows and opens a user detail panel', async () => {
    render(<UserActivityPage />);

    expect(await screen.findByText('用户动态')).toBeInTheDocument();
    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByTitle('普通头像')).toHaveTextContent('B');
    expect(screen.getByText('3 小时前在线')).toBeInTheDocument();
    expect(screen.getByText('本周观影者')).toBeInTheDocument();
    expect(screen.getByText('周榜季军')).toBeInTheDocument();
    expect(screen.getByText('沙丘 · 第 1 集 · 50%')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '查看详情' })[0]);

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        '/api/admin/user-activity/alice',
        { cache: 'no-store' }
      );
    });
    expect(
      screen.getByText(/最近活跃：3 小时前在线 · 精确时间：/)
    ).toBeInTheDocument();
    expect(await screen.findByText('source · 第 1 / 2 集')).toBeInTheDocument();
    expect(screen.getByText(/进度 50%/)).toBeInTheDocument();
    expect(screen.getAllByText('本周观影者')).toHaveLength(2);
    expect(screen.getAllByText('周榜季军')).toHaveLength(2);
  });
});
