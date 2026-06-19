import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_SITE_NAME = 'MoonTVPlus';

function manifestSiteName(value?: string | null) {
  return value?.trim() || process.env.NEXT_PUBLIC_SITE_NAME || DEFAULT_SITE_NAME;
}

async function resolveSiteName() {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return manifestSiteName();
  }

  try {
    const config = await getConfig();
    return manifestSiteName(config.SiteConfig.SiteName);
  } catch (error) {
    console.error('Failed to load site name for manifest:', error);
    return manifestSiteName();
  }
}

export async function GET() {
  const siteName = await resolveSiteName();
  const body = {
    name: siteName,
    short_name: siteName,
    description: '影视聚合',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#000000',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-256x256.png',
        sizes: '256x256',
        type: 'image/png',
      },
      {
        src: '/icons/icon-384x384.png',
        sizes: '384x384',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/manifest+json; charset=utf-8',
    },
  });
}
