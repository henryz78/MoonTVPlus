import { act, render } from '@testing-library/react';

import { TokenRefreshManager } from './TokenRefreshManager';

describe('TokenRefreshManager', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'RUNTIME_CONFIG', {
      value: { STORAGE_TYPE: 'redis' },
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not refresh or retry when the background activity ping returns 401', async () => {
    const originalFetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/refresh')) {
        return { ok: true, status: 200 } as Response;
      }

      return {
        ok: false,
        status: 401,
        clone: () => ({
          text: async () => 'Unauthorized',
        }),
      } as Response;
    });
    window.fetch = originalFetch as typeof window.fetch;

    render(<TokenRefreshManager />);
    await act(async () => {
      await Promise.resolve();
    });

    const response = await window.fetch('/api/auth/activity', {
      method: 'POST',
    });

    expect(response.status).toBe(401);
    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(originalFetch).toHaveBeenCalledWith('/api/auth/activity', {
      method: 'POST',
    });
  });
});
