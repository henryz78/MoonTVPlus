import {
  buildDoubanHotMoviesUrl,
  getBannerLocalStorageKey,
  pickDailyBannerItems,
} from './home-banner-source';

describe('home banner source selection', () => {
  it('uses douban hot movies as the banner source', () => {
    const url = buildDoubanHotMoviesUrl({ limit: 15, start: 0 });

    expect(url).toContain('/rexxar/api/v2/subject/recent_hot/movie?');
    expect(url).toContain('limit=15');
    expect(url).toContain('start=0');
    expect(url).toContain(encodeURIComponent('热门'));
    expect(url).toContain(encodeURIComponent('全部'));
  });

  it('uses a versioned local storage key for banner cache', () => {
    expect(getBannerLocalStorageKey('Douban')).toBe(
      'banner_trending_cache_v3_Douban'
    );
  });

  it('rotates banner picks by local date', () => {
    const items = Array.from({ length: 20 }, (_, index) => index + 1);

    expect(
      pickDailyBannerItems(items, new Date('2026-06-01T08:00:00Z'))
    ).toEqual([2, 3, 4, 5, 6]);
    expect(
      pickDailyBannerItems(items, new Date('2026-06-02T08:00:00Z'))
    ).toEqual([4, 5, 6, 7, 8]);
  });
});
