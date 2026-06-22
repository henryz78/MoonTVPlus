import { fireEvent, render, screen } from '@testing-library/react';

import FloatingNav from './FloatingNav';
import { SiteProvider } from './SiteProvider';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => ({
    toString: () => '',
  }),
}));

describe('FloatingNav', () => {
  it('uses server-provided runtime config for the initial nav items', () => {
    render(
      <SiteProvider
        siteName='MoonTVPlus'
        runtimeConfig={{ LIVE_ENABLED: false }}
      >
        <FloatingNav />
      </SiteProvider>
    );

    expect(screen.getByLabelText('首页')).toBeInTheDocument();
    expect(screen.queryByLabelText('电视直播')).not.toBeInTheDocument();
  });

  it('keeps primary nav items visible and hides more when overflow is empty', () => {
    render(
      <SiteProvider
        siteName='MoonTVPlus'
        runtimeConfig={{
          LIVE_ENABLED: false,
          WEB_LIVE_ENABLED: false,
          PRIVATE_LIBRARY_ENABLED: false,
          ADVANCED_RECOMMENDATION_ENABLED: false,
          CUSTOM_CATEGORIES: [],
        }}
      >
        <FloatingNav />
      </SiteProvider>
    );

    for (const label of ['首页', '搜索', '电影', '剧集', '动漫', '综艺']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: '更多' })).not.toBeInTheDocument();
  });

  it('shows feature-gated items from the more button', () => {
    render(
      <SiteProvider
        siteName='MoonTVPlus'
        runtimeConfig={{
          LIVE_ENABLED: false,
          WEB_LIVE_ENABLED: true,
          PRIVATE_LIBRARY_ENABLED: true,
          ADVANCED_RECOMMENDATION_ENABLED: false,
          CUSTOM_CATEGORIES: [],
        }}
      >
        <FloatingNav />
      </SiteProvider>
    );

    expect(screen.queryByLabelText('网络直播')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('私人影库')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '更多' }));

    expect(screen.getByLabelText('网络直播')).toBeInTheDocument();
    expect(screen.getByLabelText('私人影库')).toBeInTheDocument();
  });
});
