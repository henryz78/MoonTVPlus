export type HomeBannerHeightScale = '1' | '1.5' | '2';

export const HOME_BANNER_HEIGHT_STORAGE_KEY = 'homeBannerHeightScale';
export const MOBILE_HOME_BANNER_HEIGHT_SCALE: HomeBannerHeightScale = '2';
export const DESKTOP_HOME_BANNER_HEIGHT_SCALE: HomeBannerHeightScale = '1';

export function isHomeBannerHeightScale(
  value: string | null
): value is HomeBannerHeightScale {
  return value === '1' || value === '1.5' || value === '2';
}

export function getDefaultHomeBannerHeightScale(
  viewportWidth?: number
): HomeBannerHeightScale {
  return typeof viewportWidth === 'number' && viewportWidth < 768
    ? MOBILE_HOME_BANNER_HEIGHT_SCALE
    : DESKTOP_HOME_BANNER_HEIGHT_SCALE;
}

export function getSavedHomeBannerHeightScale(
  storage: Pick<Storage, 'getItem'>,
  viewportWidth?: number
): HomeBannerHeightScale {
  const saved = storage.getItem(HOME_BANNER_HEIGHT_STORAGE_KEY);
  return isHomeBannerHeightScale(saved)
    ? saved
    : getDefaultHomeBannerHeightScale(viewportWidth);
}

export function isPosterLikeBannerImageUrl(url: string): boolean {
  return /(?:^|\/)(?:m|s)_ratio_poster(?:\/|$)/i.test(url);
}
