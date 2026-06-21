'use client';

import { useEffect, useState } from 'react';

import { BackButton } from './BackButton';
import FloatingNav from './FloatingNav';
import MobileHeader from './MobileHeader';
import { ThemeToggle } from './ThemeToggle';
import { UpdateNotification } from './UpdateNotification';
import { UserMenu } from './UserMenu';
import { VersionCheckProvider } from './VersionCheckProvider';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  hideNavigation?: boolean; // 控制是否隐藏顶部和底部导航栏
}

const PageLayout = ({ children, activePath = '/', hideNavigation = false }: PageLayoutProps) => {
  const [backgroundImage, setBackgroundImage] = useState('');
  const shouldShowSharedBackground = !hideNavigation && activePath !== '/play';

  useEffect(() => {
    if (typeof window === 'undefined' || !shouldShowSharedBackground) {
      setBackgroundImage('');
      return;
    }

    const homeBg = (
      window as Window & {
        RUNTIME_CONFIG?: {
          HOME_BACKGROUND_IMAGE?: string;
        };
      }
    ).RUNTIME_CONFIG?.HOME_BACKGROUND_IMAGE;
    if (!homeBg) {
      setBackgroundImage('');
      return;
    }

    const urls = homeBg
      .split('\n')
      .map((url: string) => url.trim())
      .filter((url: string) => url !== '');

    if (urls.length === 0) {
      setBackgroundImage('');
      return;
    }

    const randomIndex = Math.floor(Math.random() * urls.length);
    setBackgroundImage(urls[randomIndex]);
  }, [shouldShowSharedBackground]);

  return (
    <VersionCheckProvider>
      <div className='relative w-full min-h-screen overflow-hidden'>
        {shouldShowSharedBackground && backgroundImage && (
          <>
            <div
              className='absolute inset-0 pointer-events-none bg-cover bg-center bg-no-repeat opacity-45'
              style={{ backgroundImage: `url(${backgroundImage})` }}
            />
            <div className='absolute inset-0 pointer-events-none bg-white/50 dark:bg-gray-950/50' />
          </>
        )}

        {/* 移动端头部 */}
        {!hideNavigation && (
          <MobileHeader showBackButton={['/play', '/live'].includes(activePath)} />
        )}

        {/* 主要布局容器 */}
        <div className='relative z-10 flex w-full min-h-screen md:min-h-auto'>
          {/* 主内容区域 */}
          <div className='relative min-w-0 flex-1 transition-all duration-300'>
            {/* 桌面端左上角返回按钮 */}
            {!hideNavigation && ['/play', '/live'].includes(activePath) && (
              <div className='absolute top-3 left-1 z-20 hidden md:flex'>
                <BackButton />
              </div>
            )}

            {/* 桌面端顶部按钮 */}
            {!hideNavigation && (
              <div className='absolute top-2 right-4 z-20 hidden md:flex items-center gap-2'>
                <ThemeToggle />
                <UserMenu />
                <UpdateNotification />
              </div>
            )}

            {/* 主内容 */}
            <main
              className='flex-1 md:min-h-0 md:mt-0 mt-12'
              style={{
                paddingBottom: 'calc(5.75rem + env(safe-area-inset-bottom))',
              }}
            >
              {children}
            </main>
          </div>
        </div>

        {!hideNavigation && <FloatingNav activePath={activePath} />}
      </div>
    </VersionCheckProvider>
  );
};

export default PageLayout;
