import {
  buildDoubanHotMoviesUrl,
  getBannerLocalStorageKey,
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
});
