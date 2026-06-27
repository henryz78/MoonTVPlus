const BANNER_CACHE_VERSION = 'v3';

interface DoubanHotMoviesUrlOptions {
  limit?: number;
  start?: number;
}

export function getBannerLocalStorageKey(source: string): string {
  return `banner_trending_cache_${BANNER_CACHE_VERSION}_${source}`;
}

export function buildDoubanHotMoviesUrl({
  limit = 15,
  start = 0,
}: DoubanHotMoviesUrlOptions = {}): string {
  const params = new URLSearchParams();
  params.append('start', start.toString());
  params.append('limit', limit.toString());
  params.append('category', '热门');
  params.append('type', '全部');

  return `https://m.douban.com/rexxar/api/v2/subject/recent_hot/movie?${params.toString()}`;
}
