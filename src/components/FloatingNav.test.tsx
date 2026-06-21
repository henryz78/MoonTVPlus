import { render, screen } from '@testing-library/react';

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
});
