'use client';

import { Trophy, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { WatchReward } from '@/lib/watch-rewards';

import { RewardAvatarFrame } from './RewardAvatarFrame';

interface WeeklyRewardNotificationData {
  settlementId: string;
  weekLabel: string;
  rank: number;
  rankTitle: string | null;
  watchSeconds: number;
  reward: WatchReward | null;
  expiresAt: number;
}

function formatWatchDuration(seconds: number | null | undefined) {
  const safeSeconds = Math.max(0, seconds || 0);
  if (safeSeconds > 0 && safeSeconds < 60) return '1 分钟';

  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${totalMinutes} 分钟`;
  if (minutes === 0) return `${hours} 小时`;
  return `${hours} 小时 ${minutes} 分钟`;
}

export function WeeklyRewardNotification() {
  const [notification, setNotification] =
    useState<WeeklyRewardNotificationData | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/watch-rewards/notification', {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && data.notification) {
          setNotification(data.notification);
        }
      } catch {
        // 入口是轻提示，失败时保持静默。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const close = async () => {
    const targetNotification = notification;
    if (!targetNotification) return;

    setClosing(true);
    try {
      await fetch('/api/watch-rewards/notification/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlementId: targetNotification.settlementId }),
      });
    } catch {
      // 下次打开仍可提示，服务端负责最终已读状态。
    } finally {
      setNotification(null);
      setClosing(false);
    }
  };

  if (!notification) return null;

  return (
    <div className='fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm'>
      <div className='w-full max-w-sm overflow-hidden rounded-xl border border-amber-200 bg-white shadow-2xl dark:border-amber-900/50 dark:bg-gray-950'>
        <div className='flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800'>
          <h2 className='flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100'>
            <Trophy className='h-5 w-5 text-amber-500' />
            上周观影结算
          </h2>
          <button
            type='button'
            onClick={close}
            disabled={closing}
            className='rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-60 dark:hover:bg-gray-800 dark:hover:text-gray-200'
            aria-label='关闭'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className='px-5 py-5 text-center'>
          <div className='mx-auto mb-4 flex justify-center'>
            <RewardAvatarFrame
              label={
                notification.reward?.level
                  ? String(notification.reward.level)
                  : 'H'
              }
              reward={notification.reward}
              size='normal'
            />
          </div>
          <div className='text-sm text-gray-500 dark:text-gray-400'>
            {notification.weekLabel}
          </div>
          <div className='mt-3 text-2xl font-bold text-gray-900 dark:text-gray-100'>
            {formatWatchDuration(notification.watchSeconds)}
          </div>
          <div className='mt-2 text-sm text-gray-600 dark:text-gray-300'>
            排名第 {notification.rank}
            {notification.rankTitle ? ` · ${notification.rankTitle}` : ''}
          </div>

          {notification.reward ? (
            <div className='mt-4 rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'>
              已自动穿戴：{notification.reward.title}，有效期 7 天。
            </div>
          ) : (
            <div className='mt-4 rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300'>
              暂未获得本周奖励，继续观影即可冲榜。
            </div>
          )}
        </div>

        <div className='border-t border-gray-200 px-5 py-4 dark:border-gray-800'>
          <button
            type='button'
            onClick={close}
            disabled={closing}
            className='w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60'
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
