const BANNER_CACHE_VERSION = 'v2';

interface DoubanBannerRecommendUrlOptions {
  limit?: number;
  start?: number;
}

export function getBannerLocalStorageKey(source: string): string {
  return `banner_trending_cache_${BANNER_CACHE_VERSION}_${source}`;
}

export function buildDoubanBannerRecommendUrl({
  limit = 10,
  start = 0,
}: DoubanBannerRecommendUrlOptions = {}): string {
  const params = new URLSearchParams();
  params.append('refresh', '0');
  params.append('start', start.toString());
  params.append('count', limit.toString());
  params.append('selected_categories', JSON.stringify({ 类型: '' }));
  params.append('uncollect', 'false');
  params.append('score_range', '0,10');
  params.append('tags', '');
  params.append('sort', 'S');

  return `https://m.douban.com/rexxar/api/v2/movie/recommend?${params.toString()}`;
}
