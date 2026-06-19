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

  it('refreshes and retries when the background activity ping returns an expired access token', async () => {
    let activityCalls = 0;
    const originalFetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/refresh')) {
        return { ok: true, status: 200 } as Response;
      }

      activityCalls += 1;
      if (activityCalls > 1) {
        return {
          ok: true,
          status: 200,
          clone: () => ({
            text: async () => '',
          }),
        } as Response;
      }

      return {
        ok: false,
        status: 401,
        clone: () => ({
          text: async () => 'Access token expired',
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

    expect(response.status).toBe(200);
    expect(originalFetch).toHaveBeenCalledTimes(3);
    expect(originalFetch).toHaveBeenNthCalledWith(1, '/api/auth/activity', {
      method: 'POST',
    });
    expect(originalFetch).toHaveBeenNthCalledWith(2, '/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    expect(originalFetch).toHaveBeenNthCalledWith(3, '/api/auth/activity', {
      method: 'POST',
    });
  });
});
