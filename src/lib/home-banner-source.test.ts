import {
  buildDoubanHotMoviesUrl,
  getBannerLocalStorageKey,
  pickDailyBannerItems,
} from './home-banner-source';

describe('home banner source selection', () => {
  it('uses douban hot movies as the banner source', () => {
    const url = buildDoubanHotMoviesUrl({ limit: 20, start: 0 });

    expect(url).toContain('/rexxar/api/v2/subject/recent_hot/movie?');
    expect(url).toContain('limit=20');
    expect(url).toContain('start=0');
    expect(url).toContain(encodeURIComponent('热门'));
    expect(url).toContain(encodeURIComponent('全部'));
  });

  it('uses a versioned local storage key for banner cache', () => {
    expect(getBannerLocalStorageKey('Douban')).toBe(
      'banner_trending_cache_v4_Douban'
    );
  });

  it('selects stable daily random banner picks without mutating source order', () => {
    const items = Array.from({ length: 20 }, (_, index) => index + 1);
    const originalItems = [...items];

    const firstDay = pickDailyBannerItems(
      items,
      new Date('2026-06-01T08:00:00Z')
    );
    const firstDayAgain = pickDailyBannerItems(
      items,
      new Date('2026-06-01T20:00:00Z')
    );
    const secondDay = pickDailyBannerItems(
      items,
      new Date('2026-06-02T08:00:00Z')
    );
    const firstDayIndexes = firstDay.map((item) => items.indexOf(item));
    const isContiguousSlice = firstDayIndexes.every(
      (itemIndex, index) =>
        itemIndex === (firstDayIndexes[0] + index) % items.length
    );

    expect(items).toEqual(originalItems);
    expect(firstDay).toHaveLength(5);
    expect(new Set(firstDay).size).toBe(5);
    expect(firstDayAgain).toEqual(firstDay);
    expect(secondDay).not.toEqual(firstDay);
    expect(isContiguousSlice).toBe(false);
  });
});
