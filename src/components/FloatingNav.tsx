'use client';

import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  buildNavigationGroups,
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
  const [showMore, setShowMore] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  const currentActive = useMemo(() => {
    if (activePath) return activePath;
    const queryString = searchParams.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [activePath, pathname, searchParams]);

  const { primaryItems, overflowItems } = useMemo(
    () =>
      buildNavigationGroups({
        runtimeConfig,
        watchRoomEnabled: Boolean(watchRoomContext?.isEnabled),
      }),
    [runtimeConfig, watchRoomContext?.isEnabled]
  );

  useEffect(() => {
    setShowMore(false);
  }, [currentActive]);

  useEffect(() => {
    if (!showMore) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setShowMore(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMore(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showMore]);

  if (pathname === '/watch-room/screen') {
    return null;
  }

  const moreButtonActive = overflowItems.some((item) =>
    isNavigationItemActive(currentActive, item.href)
  );

  return (
    <nav
      aria-label='主导航'
      className='fixed inset-x-0 bottom-0 z-[650] flex justify-center px-3 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pointer-events-none'
    >
      <div ref={navRef} className='pointer-events-auto relative'>
        {showMore && overflowItems.length > 0 && (
          <div className='absolute bottom-full left-1/2 mb-2 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-full border border-white/55 bg-white/72 p-2 shadow-[0_18px_55px_rgba(15,23,42,0.22)] ring-1 ring-gray-900/5 backdrop-blur-2xl dark:border-gray-700/60 dark:bg-gray-950/72 dark:shadow-[0_18px_55px_rgba(0,0,0,0.55)] dark:ring-white/10'>
            <ul className='flex max-w-[calc(100vw-2rem)] gap-1 overflow-x-auto scrollbar-hide'>
              {overflowItems.map((item) => {
                const active = isNavigationItemActive(currentActive, item.href);
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      aria-label={item.label}
                      title={item.label}
                      data-active={active}
                      onClick={() => setShowMore(false)}
                      className='group flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-all duration-200 hover:bg-gray-900/5 hover:text-green-600 data-[active=true]:bg-green-500 data-[active=true]:text-white data-[active=true]:shadow-lg data-[active=true]:shadow-green-500/25 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-green-300 dark:data-[active=true]:bg-green-500 dark:data-[active=true]:text-gray-950'
                    >
                      <Icon className='h-5 w-5 transition-transform duration-200 group-hover:scale-105' />
                      <span className='sr-only'>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <ul className='pointer-events-auto flex max-w-[calc(100vw-1rem)] items-center gap-1 overflow-x-auto scrollbar-hide rounded-full border border-white/55 bg-white/72 px-2 py-2 shadow-[0_18px_55px_rgba(15,23,42,0.22)] backdrop-blur-2xl ring-1 ring-gray-900/5 dark:border-gray-700/60 dark:bg-gray-950/72 dark:shadow-[0_18px_55px_rgba(0,0,0,0.55)] dark:ring-white/10'>
          {primaryItems.map((item) => {
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

          {overflowItems.length > 0 && (
            <li className='shrink-0'>
              <button
                type='button'
                aria-label='更多'
                title='更多'
                aria-expanded={showMore}
                data-active={moreButtonActive || showMore}
                onClick={() => setShowMore((value) => !value)}
                className='group flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-all duration-200 hover:bg-gray-900/5 hover:text-green-600 data-[active=true]:bg-green-500 data-[active=true]:text-white data-[active=true]:shadow-lg data-[active=true]:shadow-green-500/25 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-green-300 dark:data-[active=true]:bg-green-500 dark:data-[active=true]:text-gray-950 sm:h-11 sm:w-11'
              >
                <MoreHorizontal
                  className={`h-5 w-5 transition-transform duration-200 group-hover:scale-105 ${showMore ? 'rotate-90' : ''}`}
                />
                <span className='sr-only'>更多</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
};

export default FloatingNav;
