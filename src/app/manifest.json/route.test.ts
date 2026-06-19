import { getConfig } from '@/lib/config';
import { Response as NodeFetchResponse } from 'node-fetch';

import { GET } from './route';

jest.mock('@/lib/config', () => ({
  getConfig: jest.fn(),
}));

describe('GET /manifest.json', () => {
  const originalStorageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;
  const originalSiteName = process.env.NEXT_PUBLIC_SITE_NAME;

  beforeEach(() => {
    Object.defineProperty(global, 'Response', {
      value: NodeFetchResponse,
      configurable: true,
    });
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'd1';
    process.env.NEXT_PUBLIC_SITE_NAME = 'EnvName';
    (getConfig as jest.Mock).mockResolvedValue({
      SiteConfig: { SiteName: 'HYTV' },
    });
  });

  afterEach(() => {
    if (originalStorageType === undefined) {
      delete process.env.NEXT_PUBLIC_STORAGE_TYPE;
    } else {
      process.env.NEXT_PUBLIC_STORAGE_TYPE = originalStorageType;
    }

    if (originalSiteName === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_NAME;
    } else {
      process.env.NEXT_PUBLIC_SITE_NAME = originalSiteName;
    }
  });

  it('uses the configured site name for the PWA app name', async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.name).toBe('HYTV');
    expect(body.short_name).toBe('HYTV');
    expect(response.headers.get('content-type')).toContain(
      'application/manifest+json'
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('falls back to NEXT_PUBLIC_SITE_NAME in localStorage mode', async () => {
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'localstorage';

    const response = await GET();
    const body = await response.json();

    expect(body.name).toBe('EnvName');
    expect(getConfig).not.toHaveBeenCalled();
  });
});
