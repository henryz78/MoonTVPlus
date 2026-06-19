import { render, screen, waitFor } from '@testing-library/react';

import { SiteProvider } from '@/components/SiteProvider';

import BooksHomePage from './page';

describe('BooksHomePage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'RUNTIME_CONFIG', {
      value: { BOOKS_ENABLED: true },
      configurable: true,
    });
    window.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ sources: [] }),
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the configured site name in the library badge', async () => {
    render(
      <SiteProvider siteName='HYTV'>
        <BooksHomePage />
      </SiteProvider>
    );

    expect(screen.getByText('HYTV Reading Library')).toBeInTheDocument();
    await waitFor(() => expect(window.fetch).toHaveBeenCalled());
  });
});
