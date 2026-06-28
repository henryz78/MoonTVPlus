const BANNER_CACHE_VERSION = 'v4';

interface DoubanHotMoviesUrlOptions {
  limit?: number;
  start?: number;
}

export function getBannerLocalStorageKey(source: string): string {
  return `banner_trending_cache_${BANNER_CACHE_VERSION}_${source}`;
}

export function buildDoubanHotMoviesUrl({
  limit = 20,
  start = 0,
}: DoubanHotMoviesUrlOptions = {}): string {
  const params = new URLSearchParams();
  params.append('start', start.toString());
  params.append('limit', limit.toString());
  params.append('category', '热门');
  params.append('type', '全部');

  return `https://m.douban.com/rexxar/api/v2/subject/recent_hot/movie?${params.toString()}`;
}

export function pickDailyBannerItems<T>(
  items: T[],
  date = new Date(),
  limit = 5
): T[] {
  if (items.length <= limit) return items.slice(0, limit);

  const random = createSeededRandom(
    date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
  );
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [
      shuffled[targetIndex],
      shuffled[index],
    ];
  }

  return shuffled.slice(0, limit);
}

function createSeededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
