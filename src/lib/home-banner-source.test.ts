import {
  buildDoubanBannerRecommendUrl,
  getBannerLocalStorageKey,
} from './home-banner-source';

describe('home banner source selection', () => {
  it('uses douban recommend as the banner source', () => {
    const url = buildDoubanBannerRecommendUrl({ limit: 10, start: 0 });

    expect(url).toContain('/rexxar/api/v2/movie/recommend?');
    expect(url).toContain('count=10');
    expect(url).toContain('start=0');
    expect(url).not.toContain('/subject/recent_hot/');
  });

  it('uses a versioned local storage key for banner cache', () => {
    expect(getBannerLocalStorageKey('Douban')).toBe(
      'banner_trending_cache_v2_Douban'
    );
  });
});
