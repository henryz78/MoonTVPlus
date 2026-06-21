import { buildNavigationItems, isNavigationItemActive } from './navigation';

describe('navigation helpers', () => {
  it('builds shared floating navigation items from runtime feature flags', () => {
    const items = buildNavigationItems({
      runtimeConfig: {
        LIVE_ENABLED: true,
        WEB_LIVE_ENABLED: true,
        PRIVATE_LIBRARY_ENABLED: true,
        ADVANCED_RECOMMENDATION_ENABLED: true,
        CUSTOM_CATEGORIES: [{ name: '专题', type: 'movie', query: '经典' }],
      },
      watchRoomEnabled: true,
    });

    expect(items.map((item) => item.label)).toEqual([
      '首页',
      '搜索',
      '电影',
      '剧集',
      '动漫',
      '综艺',
      '电视直播',
      '网络直播',
      '私人影库',
      '高级推荐',
      '观影室',
      '自定义',
    ]);
  });

  it('matches exact paths and douban category query paths', () => {
    expect(isNavigationItemActive('/search', '/search')).toBe(true);
    expect(
      isNavigationItemActive('/douban?type=movie&category=热门', '/douban?type=movie')
    ).toBe(true);
    expect(isNavigationItemActive('/live', '/web-live')).toBe(false);
  });
});
