import {
  type LucideIcon,
  Blend,
  Cat,
  Clover,
  Container,
  Film,
  Globe,
  Home,
  Search,
  Star,
  Tv,
  TvMinimalPlay,
  Users,
} from 'lucide-react';

export interface NavigationRuntimeConfig {
  LIVE_ENABLED?: boolean;
  WEB_LIVE_ENABLED?: boolean;
  PRIVATE_LIBRARY_ENABLED?: boolean;
  ADVANCED_RECOMMENDATION_ENABLED?: boolean;
  CUSTOM_CATEGORIES?: unknown[];
}

export interface NavigationItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

export function buildNavigationItems({
  runtimeConfig,
  watchRoomEnabled = false,
}: {
  runtimeConfig?: NavigationRuntimeConfig;
  watchRoomEnabled?: boolean;
}): NavigationItem[] {
  const items: NavigationItem[] = [
    { icon: Home, label: '首页', href: '/' },
    { icon: Search, label: '搜索', href: '/search' },
    { icon: Film, label: '电影', href: '/douban?type=movie' },
    { icon: Tv, label: '剧集', href: '/douban?type=tv' },
    { icon: Cat, label: '动漫', href: '/douban?type=anime' },
    { icon: Clover, label: '综艺', href: '/douban?type=show' },
  ];

  if (runtimeConfig?.LIVE_ENABLED !== false) {
    items.push({
      icon: TvMinimalPlay,
      label: '电视直播',
      href: '/live',
    });
  }

  if (runtimeConfig?.WEB_LIVE_ENABLED) {
    items.push({
      icon: Globe,
      label: '网络直播',
      href: '/web-live',
    });
  }

  if (runtimeConfig?.PRIVATE_LIBRARY_ENABLED) {
    items.push({
      icon: Container,
      label: '私人影库',
      href: '/private-library',
    });
  }

  if (runtimeConfig?.ADVANCED_RECOMMENDATION_ENABLED) {
    items.push({
      icon: Blend,
      label: '高级推荐',
      href: '/advanced-recommendation',
    });
  }

  if (watchRoomEnabled) {
    items.push({
      icon: Users,
      label: '观影室',
      href: '/watch-room',
    });
  }

  if (runtimeConfig?.CUSTOM_CATEGORIES?.length) {
    items.push({
      icon: Star,
      label: '自定义',
      href: '/douban?type=custom',
    });
  }

  return items;
}

export function isNavigationItemActive(activePath: string, itemHref: string) {
  const decodedActive = decodeURIComponent(activePath || '/');
  const decodedItemHref = decodeURIComponent(itemHref);
  const typeMatch = decodedItemHref.match(/[?&]type=([^&]+)/)?.[1];
  const activePathname = decodedActive.split('?')[0];
  const itemPathname = decodedItemHref.split('?')[0];

  return (
    decodedActive === decodedItemHref ||
    (Boolean(typeMatch) &&
      decodedActive.startsWith('/douban') &&
      decodedActive.includes(`type=${typeMatch}`)) ||
    (!typeMatch && activePathname === itemPathname)
  );
}
