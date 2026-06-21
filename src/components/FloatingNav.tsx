'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import {
  buildNavigationItems,
  isNavigationItemActive,
} from './navigation';
import { useSite } from './SiteProvider';
import { useWatchRoomContextSafe } from './WatchRoomProvider';

interface FloatingNavProps {
  activePath?: string;
}

const FloatingNav = ({ activePath }: FloatingNavProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { runtimeConfig } = useSite();
  const watchRoomContext = useWatchRoomContextSafe();

  const currentActive = useMemo(() => {
    if (activePath) return activePath;
    const queryString = searchParams.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [activePath, pathname, searchParams]);

  const items = useMemo(
    () =>
      buildNavigationItems({
        runtimeConfig,
        watchRoomEnabled: Boolean(watchRoomContext?.isEnabled),
      }),
    [runtimeConfig, watchRoomContext?.isEnabled]
  );

  if (pathname === '/watch-room/screen') {
    return null;
  }

  return (
    <nav
      aria-label='主导航'
      className='fixed inset-x-0 bottom-0 z-[650] flex justify-center px-3 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pointer-events-none'
    >
      <ul className='pointer-events-auto flex max-w-[calc(100vw-1rem)] items-center gap-1 overflow-x-auto scrollbar-hide rounded-full border border-white/55 bg-white/72 px-2 py-2 shadow-[0_18px_55px_rgba(15,23,42,0.22)] backdrop-blur-2xl ring-1 ring-gray-900/5 dark:border-gray-700/60 dark:bg-gray-950/72 dark:shadow-[0_18px_55px_rgba(0,0,0,0.55)] dark:ring-white/10'>
        {items.map((item) => {
          const active = isNavigationItemActive(currentActive, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href} className='shrink-0'>
              <Link
                href={item.href}
                prefetch={false}
                aria-label={item.label}
                title={item.label}
                data-active={active}
                className='group flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-all duration-200 hover:bg-gray-900/5 hover:text-green-600 data-[active=true]:bg-green-500 data-[active=true]:text-white data-[active=true]:shadow-lg data-[active=true]:shadow-green-500/25 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-green-300 dark:data-[active=true]:bg-green-500 dark:data-[active=true]:text-gray-950 sm:h-11 sm:w-11'
              >
                <Icon className='h-5 w-5 transition-transform duration-200 group-hover:scale-105' />
                <span className='sr-only'>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default FloatingNav;
