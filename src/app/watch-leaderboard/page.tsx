'use client';

import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import PageLayout from '@/components/PageLayout';
import { RewardAvatarFrame } from '@/components/watch-rewards/RewardAvatarFrame';
import type { WatchReward } from '@/lib/watch-rewards';

type LeaderboardType = 'weekly' | 'all-time';

interface WatchLeaderboardRow {
  username: string;
  rank: number;
  watchSeconds: number;
  reward: WatchReward | null;
  rankTitle: string | null;
  qualified: boolean;
}

interface WatchLeaderboardResponse {
  type: LeaderboardType;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  weekLabel?: string;
  rewardExpiresAt?: number;
  rows: WatchLeaderboardRow[];
}

const rewardPreview: WatchReward[] = [
  { level: 1, minSeconds: 1 * 60 * 60, title: '本周观影者' },
  { level: 2, minSeconds: 3 * 60 * 60, title: '本周影迷' },
  { level: 3, minSeconds: 7 * 60 * 60, title: '本周追剧达人' },
  { level: 4, minSeconds: 14 * 60 * 60, title: '本周放映王' },
];

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

function rankAccent(rank: number) {
  if (rank === 1) {
    return {
      card: 'border-amber-200 bg-amber-50/70 dark:border-amber-800/60 dark:bg-amber-950/20',
      badge: 'bg-amber-500 text-white',
    };
  }
  if (rank === 2) {
    return {
      card: 'border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/40',
      badge: 'bg-slate-400 text-white',
    };
  }
  if (rank === 3) {
    return {
      card: 'border-orange-200 bg-orange-50/70 dark:border-orange-900/50 dark:bg-orange-950/20',
      badge: 'bg-orange-500 text-white',
    };
  }
  return {
    card: 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  };
}

function LeaderboardRow({
  row,
  type,
}: {
  row: WatchLeaderboardRow;
  type: LeaderboardType;
}) {
  const accent = rankAccent(row.rank);
  const displayReward = type === 'weekly' ? row.reward : null;
  const displayRankTitle = type === 'weekly' ? row.rankTitle : null;
  const label =
    displayReward?.title ||
    (type === 'weekly' && !row.qualified ? '未达标' : '');

  return (
    <div
      className={`min-w-0 overflow-hidden rounded-lg border px-3 py-3 ${accent.card}`}
    >
      <div className='flex min-w-0 items-center gap-3'>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${accent.badge}`}
        >
          {row.rank}
        </div>
        <RewardAvatarFrame
          label={row.username}
          reward={displayReward}
          size='compact'
        />
        <div className='min-w-0 flex-1'>
          <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
            <span className='min-w-0 break-words text-sm font-semibold text-gray-900 dark:text-gray-100'>
              {row.username}
            </span>
            {displayRankTitle && (
              <span className='rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-white/10 dark:text-gray-200'>
                {displayRankTitle}
              </span>
            )}
            {label && (
              <span
                className={
                  displayReward
                    ? 'rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-200'
                    : 'rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }
              >
                {label}
              </span>
            )}
          </div>
        </div>
        <div className='shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-gray-100'>
          {formatWatchDuration(row.watchSeconds)}
        </div>
      </div>
    </div>
  );
}

export default function WatchLeaderboardPage() {
  const [type, setType] = useState<LeaderboardType>('weekly');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<WatchLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/watch-leaderboard?type=${type}&page=${page}&limit=10`,
        { cache: 'no-store' }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || '加载排行榜失败');
      }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载排行榜失败');
    } finally {
      setLoading(false);
    }
  }, [page, type]);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  const switchType = (nextType: LeaderboardType) => {
    setType(nextType);
    setPage(1);
  };

  return (
    <PageLayout activePath='/watch-leaderboard'>
      <div className='mx-auto min-w-0 max-w-5xl overflow-x-hidden px-4 py-8 md:px-8'>
        <div className='mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div className='min-w-0'>
            <h1 className='flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100'>
              <Trophy className='h-6 w-6 text-amber-500' />
              观影排行榜
            </h1>
            <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
              查看上周结算排行和全部观看时长
            </p>
          </div>
          <button
            type='button'
            onClick={() => loadLeaderboard()}
            disabled={loading}
            className='inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60'
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        <div className='mb-5 flex min-w-0 flex-wrap items-center gap-2'>
          <button
            type='button'
            onClick={() => switchType('weekly')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              type === 'weekly'
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            上周榜
          </button>
          <button
            type='button'
            onClick={() => switchType('all-time')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              type === 'all-time'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            全部榜
          </button>
          {type === 'weekly' && data?.weekLabel && (
            <span className='min-w-0 break-words text-sm text-gray-500 dark:text-gray-400'>
              {data.weekLabel}
            </span>
          )}
        </div>

        {error && (
          <div className='mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'>
            {error}
          </div>
        )}

        <div className='min-w-0 space-y-3'>
          {loading && !data ? (
            <div className='rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900'>
              加载中...
            </div>
          ) : data && data.rows.length > 0 ? (
            data.rows.map((row) => (
              <LeaderboardRow key={row.username} row={row} type={type} />
            ))
          ) : (
            <div className='rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900'>
              暂无排行榜数据
            </div>
          )}
        </div>

        {data && (
          <div className='mt-5 flex min-w-0 items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400'>
            <button
              type='button'
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1 || loading}
              className='inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 disabled:opacity-50 dark:border-gray-800'
            >
              <ChevronLeft className='h-4 w-4' />
              上一页
            </button>
            <span className='shrink-0'>
              {data.page} / {Math.max(1, data.totalPages || 1)}
            </span>
            <button
              type='button'
              onClick={() =>
                setPage((value) =>
                  Math.min(data.totalPages || value, value + 1)
                )
              }
              disabled={page >= (data.totalPages || 1) || loading}
              className='inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 disabled:opacity-50 dark:border-gray-800'
            >
              下一页
              <ChevronRight className='h-4 w-4' />
            </button>
          </div>
        )}

        {type === 'weekly' && (
          <section className='mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900'>
            <div className='mb-3 flex items-center justify-between gap-3'>
              <h2 className='flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100'>
                <BarChart3 className='h-4 w-4 text-blue-500' />
                奖励预览
              </h2>
              <span className='text-xs text-gray-500 dark:text-gray-400'>
                奖励有效期 7 天
              </span>
            </div>
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              {rewardPreview.map((reward) => (
                <div
                  key={reward.level}
                  className='flex min-w-0 items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-800'
                >
                  <RewardAvatarFrame
                    label={String(reward.level)}
                    reward={reward}
                    size='compact'
                  />
                  <div className='min-w-0'>
                    <div className='break-words text-sm font-medium text-gray-900 dark:text-gray-100'>
                      {reward.title}
                    </div>
                    <div className='text-xs text-gray-500 dark:text-gray-400'>
                      {formatWatchDuration(reward.minSeconds)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PageLayout>
  );
}
