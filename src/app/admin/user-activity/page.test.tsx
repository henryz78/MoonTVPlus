import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import UserActivityPage from './page';

jest.mock('@/components/PageLayout', () => {
  return function MockPageLayout({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  };
});

describe('UserActivityPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
              lastActiveAt: null,
              playRecordCount: 1,
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
              lastActiveAt: null,
              isOnline: false,
              playRecordCount: 1,
              latestPlayRecord: {
                title: '沙丘',
                episode: 1,
                sourceName: 'source',
                progressPercent: 50,
                saveTime: 1_700_000_000_000,
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      } as Response;
    });
  });

  it('loads overview rows and opens a user detail panel', async () => {
    render(<UserActivityPage />);

    expect(await screen.findByText('用户动态')).toBeInTheDocument();
    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('从未活跃')).toBeInTheDocument();
    expect(screen.getByText('沙丘 · 第 1 集 · 50%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        '/api/admin/user-activity/alice',
        { cache: 'no-store' }
      );
    });
    expect(await screen.findByText('source · 第 1 / 2 集')).toBeInTheDocument();
    expect(screen.getByText(/进度 50%/)).toBeInTheDocument();
  });
});
