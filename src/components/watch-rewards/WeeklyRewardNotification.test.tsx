import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { WeeklyRewardNotification } from './WeeklyRewardNotification';

describe('WeeklyRewardNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/read')) {
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          notification: {
            settlementId: 'weekly-2026-06-15',
            weekLabel: '2026-06-15 - 2026-06-21',
            rank: 1,
            rankTitle: '周榜冠军',
            watchSeconds: 66_120,
            reward: { level: 4, title: '本周放映王', minSeconds: 50_400 },
            expiresAt: 1_800_000_000_000,
          },
        }),
      } as Response;
    }) as jest.Mock;
  });

  it('shows the settlement modal and marks it read', async () => {
    render(<WeeklyRewardNotification />);

    expect(await screen.findByText('上周观影结算')).toBeInTheDocument();
    expect(screen.getByText('2026-06-15 - 2026-06-21')).toBeInTheDocument();
    expect(screen.getByText(/周榜冠军/)).toBeInTheDocument();
    expect(screen.getByText(/本周放映王/)).toBeInTheDocument();
    expect(screen.getByText(/已自动穿戴/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '我知道了' }));

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        '/api/watch-rewards/notification/read',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settlementId: 'weekly-2026-06-15' }),
        }
      );
    });
  });

  it('stays hidden when there is no notification', async () => {
    window.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ notification: null }),
    })) as jest.Mock;

    render(<WeeklyRewardNotification />);

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalled();
    });
    expect(screen.queryByText('上周观影结算')).not.toBeInTheDocument();
  });
});
