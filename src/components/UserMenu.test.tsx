import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { UpdateStatus } from '@/lib/version_check';

import { UserMenu } from './UserMenu';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromBrowserCookie: jest.fn(),
}));

jest.mock('@/lib/danmaku/api', () => ({
  clearAllDanmakuCache: jest.fn(),
  getDanmakuCacheStats: jest.fn().mockResolvedValue({ totalSize: 0 }),
}));

jest.mock('@/lib/home-banner', () => ({
  HOME_BANNER_HEIGHT_STORAGE_KEY: 'home_banner_height_scale',
  getDefaultHomeBannerHeightScale: jest.fn(() => 'standard'),
  getSavedHomeBannerHeightScale: jest.fn(() => 'standard'),
}));

jest.mock('@/lib/utils', () => ({
  clearBangumiImageFallbackCache: jest.fn(),
}));

jest.mock('./VersionCheckProvider', () => ({
  useVersionCheck: () => ({
    updateStatus: UpdateStatus.NO_UPDATE,
    isChecking: false,
  }),
}));

jest.mock('./DeviceManagementPanel', () => ({
  DeviceManagementPanel: () => null,
}));
jest.mock('./DownloadManagementPanel', () => ({
  DownloadManagementPanel: () => null,
}));
jest.mock('./EmailSettingsPanel', () => ({
  EmailSettingsPanel: () => null,
}));
jest.mock('./FavoritesPanel', () => ({
  FavoritesPanel: () => null,
}));
jest.mock('./NotificationPanel', () => ({
  NotificationPanel: () => null,
}));
jest.mock('./OfflineDownloadPanel', () => ({
  OfflineDownloadPanel: () => null,
}));
jest.mock('./PersonalCenterPanel', () => ({
  PersonalCenterPanel: () => null,
}));
jest.mock('./tv/TVRemotePanel', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('./VersionPanel', () => ({
  VersionPanel: () => null,
}));

describe('UserMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete (window as unknown as { __unreadNotificationCount?: number })
      .__unreadNotificationCount;
    delete (window as unknown as { __loadingNotifications?: boolean })
      .__loadingNotifications;
    (
      window as unknown as { RUNTIME_CONFIG?: Record<string, unknown> }
    ).RUNTIME_CONFIG = {
      STORAGE_TYPE: 'redis',
      DISPLAY_STORAGE_TYPE: 'redis',
    };
    (getAuthInfoFromBrowserCookie as jest.Mock).mockReturnValue({
      username: 'Henry',
      role: 'owner',
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/watch-time/current-week') {
        return {
          ok: true,
          json: async () => ({
            watchSeconds: 5400,
            weekStartAt: 100,
            weekEndAt: 200,
          }),
        } as Response;
      }
      if (url === '/api/watch-rewards/current') {
        return {
          ok: true,
          json: async () => ({ reward: null }),
        } as Response;
      }
      if (url === '/api/notifications') {
        return {
          ok: true,
          json: async () => ({ unreadCount: 0 }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({}),
        text: async () => '',
      } as Response;
    });
  });

  it('shows the signed-in user current-week watch time in the dropdown', async () => {
    render(<UserMenu />);

    fireEvent.click(screen.getByLabelText('User Menu'));

    await waitFor(() => {
      expect(screen.getByText('本周已看')).toBeInTheDocument();
      expect(screen.getByText('1 小时 30 分钟')).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/watch-time/current-week', {
      cache: 'no-store',
    });
  });
});
