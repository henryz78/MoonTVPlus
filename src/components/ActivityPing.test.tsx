import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { act, render } from '@testing-library/react';

import ActivityPing from './ActivityPing';

jest.mock('@/lib/auth', () => ({
  getAuthInfoFromBrowserCookie: jest.fn(),
}));

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('ActivityPing', () => {
  let now = 1_000;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    jest.clearAllMocks();
    Object.defineProperty(window, 'RUNTIME_CONFIG', {
      value: { STORAGE_TYPE: 'redis' },
      configurable: true,
    });
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    (getAuthInfoFromBrowserCookie as jest.Mock).mockReturnValue({
      username: 'alice',
      tokenId: 'token-1',
      refreshToken: 'refresh',
      refreshExpires: now + 3_600_000,
    });
    window.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('sends an initial ping and repeats while visible', async () => {
    render(<ActivityPing />);

    await flushPromises();
    expect(window.fetch).toHaveBeenCalledWith('/api/auth/activity', {
      method: 'POST',
      credentials: 'include',
    });

    now += 60_000;
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await flushPromises();
    expect(window.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not ping while hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });

    render(<ActivityPing />);

    now += 120_000;
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it('pings when visible again only after the previous success is older than 60 seconds', async () => {
    render(<ActivityPing />);

    await flushPromises();
    expect(window.fetch).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    now += 59_000;

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(window.fetch).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    now += 1_000;

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(window.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not run in localStorage mode', async () => {
    Object.defineProperty(window, 'RUNTIME_CONFIG', {
      value: { STORAGE_TYPE: 'localstorage' },
      configurable: true,
    });

    render(<ActivityPing />);

    now += 120_000;
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    expect(window.fetch).not.toHaveBeenCalled();
  });
});
