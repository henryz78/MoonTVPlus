'use client';

import {
  Activity,
  BarChart3,
  Clock,
  Film,
  RefreshCw,
  Trophy,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import PageLayout from '@/components/PageLayout';

type Role = 'owner' | 'admin' | 'user';

interface PlayStatsRecordSummary {
  username: string;
  title: string;
  episode: number;
  sourceName: string;
  progressPercent: number;
  watchSeconds: number;
  saveTime: number;
}

interface PlayStatsTitleSummary {
  title: string;
  count: number;
  watchSeconds: number;
  latestSaveTime: number;
}

interface PlayStatsUserSummary {
  username: string;
  role: Role;
  playRecordCount: number;
  watchSeconds: number;
  lastActiveAt: number | null;
  isOnline: boolean;
  latestPlayRecord: PlayStatsRecordSummary | null;
}

interface PlayStatsResponse {
  viewerRole: Role;
  totalUsers: number;
  onlineUsers: number;
  totalPlayRecords: number;
  totalWatchSeconds: number;
  todayActiveUsers: number;
  last7DaysActiveUsers: number;
  todayPlayRecords: number;
  last7DaysPlayRecords: number;
  todayWatchSeconds: number;
  last7DaysWatchSeconds: number;
  lastWatchAt: number | null;
  topTitles: PlayStatsTitleSummary[];
  userRanking: PlayStatsUserSummary[];
  recentRecords: PlayStatsRecordSummary[];
}

const roleText: Record<Role, string> = {
  owner: '站长',
  admin: '管理员',
  user: '用户',
};

function formatDateTime(timestamp: number | null) {
  if (!timestamp) return '暂无';
  return new Date(timestamp)
    .toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(/\//g, '-');
}

function formatActivity(lastActiveAt: number | null, isOnline?: boolean) {
  if (!lastActiveAt) return '从未活跃';
  const diff = Math.max(0, Date.now() - lastActiveAt);
  if (isOnline || diff <= 2 * 60 * 1000) return '在线';
  const minutes = Math.max(1, Math.floor(diff / 60_000));
  if (minutes < 60) return `${minutes} 分钟前在线`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前在线`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前在线`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前在线`;
  return `${Math.max(1, Math.floor(days / 365))} 年前在线`;
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

function StatCard({
  icon,
  label,
  value,
  subtext,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className='rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <div className='text-sm text-gray-500 dark:text-gray-400'>
            {label}
          </div>
          <div className='mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100'>
            {value}
          </div>
          {subtext && (
            <div className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
              {subtext}
            </div>
          )}
        </div>
        <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function PlayStatsPage() {
  const [stats, setStats] = useState<PlayStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/play-stats', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '加载播放统计失败');
      }
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载播放统计失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return (
    <PageLayout activePath='/play-stats'>
      <div className='mx-auto min-w-0 max-w-7xl overflow-x-hidden px-4 py-8 md:px-8'>
        <div className='mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div>
            <h1 className='flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100'>
              <BarChart3 className='h-6 w-6 text-blue-500' />
              播放统计
            </h1>
            <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
              查看可见范围内的观看记录和活跃概况
            </p>
          </div>

          <button
            type='button'
            onClick={() => loadStats()}
            disabled={loading}
            className='inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60'
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        {error && (
          <div className='mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'>
            {error}
          </div>
        )}

        {loading && !stats ? (
          <div className='rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900'>
            加载中...
          </div>
        ) : stats ? (
          <div className='min-w-0 space-y-6'>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
              <StatCard
                icon={<Users className='h-5 w-5' />}
                label='可见用户'
                value={stats.totalUsers}
                subtext={`在线 ${stats.onlineUsers} 人`}
              />
              <StatCard
                icon={<Film className='h-5 w-5' />}
                label='观看记录'
                value={stats.totalPlayRecords}
                subtext={`今日 ${stats.todayPlayRecords} 条`}
              />
              <StatCard
                icon={<Clock className='h-5 w-5' />}
                label='总观看时长'
                value={formatWatchDuration(stats.totalWatchSeconds)}
                subtext={`今日 ${formatWatchDuration(
                  stats.todayWatchSeconds
                )} · 近 7 天 ${formatWatchDuration(
                  stats.last7DaysWatchSeconds
                )}`}
              />
              <StatCard
                icon={<Activity className='h-5 w-5' />}
                label='活跃用户'
                value={stats.todayActiveUsers}
                subtext={`近 7 天 ${stats.last7DaysActiveUsers} 人`}
              />
              <StatCard
                icon={<Clock className='h-5 w-5' />}
                label='最近观看'
                value={formatDateTime(stats.lastWatchAt)}
                subtext={`近 7 天 ${stats.last7DaysPlayRecords} 条`}
              />
            </div>

            <div className='grid min-w-0 gap-4 lg:grid-cols-2'>
              <section className='min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900'>
                <h2 className='mb-3 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100'>
                  <Trophy className='h-4 w-4 text-amber-500' />
                  最近观看最多
                </h2>
                {stats.topTitles.length === 0 ? (
                  <div className='py-8 text-center text-sm text-gray-500'>
                    暂无统计
                  </div>
                ) : (
                  <div className='min-w-0 space-y-3'>
                    {stats.topTitles.map((item, index) => (
                      <div
                        key={item.title}
                        className='min-w-0 overflow-hidden rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800 sm:flex sm:items-center sm:justify-between sm:gap-3'
                      >
                        <div className='min-w-0'>
                          <div className='break-words font-medium text-gray-900 dark:text-gray-100'>
                            {index + 1}. {item.title}
                          </div>
                          <div className='mt-1 text-xs text-gray-500'>
                            最近：{formatDateTime(item.latestSaveTime)}
                          </div>
                          <div className='mt-1 text-xs text-gray-500'>
                            已看 {formatWatchDuration(item.watchSeconds)}
                          </div>
                        </div>
                        <span className='mt-3 inline-flex w-fit flex-none self-start rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200 sm:mt-0 sm:self-auto'>
                          {item.count} 条
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className='min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900'>
                <h2 className='mb-3 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100'>
                  <Users className='h-4 w-4 text-blue-500' />
                  {stats.viewerRole === 'user' ? '我的概况' : '用户排行'}
                </h2>
                {stats.userRanking.length === 0 ? (
                  <div className='py-8 text-center text-sm text-gray-500'>
                    暂无用户数据
                  </div>
                ) : (
                  <div className='min-w-0 space-y-3'>
                    {stats.userRanking.map((item) => (
                      <div
                        key={item.username}
                        className='min-w-0 overflow-hidden rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800'
                      >
                        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                          <div className='min-w-0'>
                            <div className='truncate font-medium text-gray-900 dark:text-gray-100'>
                              {item.username}
                              <span className='ml-2 text-xs font-normal text-gray-500'>
                                {roleText[item.role]}
                              </span>
                            </div>
                            <div
                              className={
                                item.isOnline
                                  ? 'mt-1 text-xs text-green-600 dark:text-green-400'
                                  : 'mt-1 text-xs text-gray-500'
                              }
                            >
                              {formatActivity(item.lastActiveAt, item.isOnline)}
                            </div>
                          </div>
                          <span className='flex-none self-start text-xs text-gray-500 sm:self-auto'>
                            {item.playRecordCount} 条 ·{' '}
                            {formatWatchDuration(item.watchSeconds)}
                          </span>
                        </div>
                        {item.latestPlayRecord && (
                          <div className='mt-2 min-w-0 break-words text-xs text-gray-500'>
                            最近：{item.latestPlayRecord.title} · 第{' '}
                            {item.latestPlayRecord.episode} 集 ·{' '}
                            {item.latestPlayRecord.progressPercent}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className='rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900'>
              <h2 className='mb-3 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100'>
                <Clock className='h-4 w-4 text-gray-500' />
                最近观看记录
              </h2>
              {stats.recentRecords.length === 0 ? (
                <div className='py-8 text-center text-sm text-gray-500'>
                  暂无观看记录
                </div>
              ) : (
                <>
                  <div className='space-y-3 lg:hidden'>
                    {stats.recentRecords.map((record) => (
                      <div
                        key={`${record.username}-${record.sourceName}-${record.title}-${record.saveTime}`}
                        className='rounded-lg border border-gray-100 p-3 text-sm dark:border-gray-800'
                      >
                        <div className='flex items-start justify-between gap-3'>
                          <div className='min-w-0'>
                            <div className='break-words font-medium text-gray-900 dark:text-gray-100'>
                              {record.title}
                            </div>
                            <div className='mt-1 text-xs text-gray-500'>
                              第 {record.episode} 集 · {record.sourceName}
                            </div>
                          </div>
                          <span className='flex-none rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200'>
                            {record.progressPercent}%
                          </span>
                        </div>
                        <div className='mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-3'>
                          <span className='min-w-0 break-words'>
                            用户：{record.username}
                          </span>
                          <span>
                            已看 {formatWatchDuration(record.watchSeconds)}
                          </span>
                          <span>{formatDateTime(record.saveTime)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className='hidden lg:block'>
                    <div className='grid grid-cols-[minmax(0,1fr)_120px_100px_130px_150px] gap-3 border-b border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 dark:border-gray-800'>
                      <span>影片</span>
                      <span>用户</span>
                      <span>进度</span>
                      <span>已看</span>
                      <span>时间</span>
                    </div>
                    {stats.recentRecords.map((record) => (
                      <div
                        key={`${record.username}-${record.sourceName}-${record.title}-${record.saveTime}`}
                        className='grid grid-cols-[minmax(0,1fr)_120px_100px_130px_150px] gap-3 border-b border-gray-100 px-3 py-3 text-sm last:border-b-0 dark:border-gray-800'
                      >
                        <span className='min-w-0 truncate text-gray-900 dark:text-gray-100'>
                          {record.title} · 第 {record.episode} 集
                        </span>
                        <span className='truncate text-gray-600 dark:text-gray-300'>
                          {record.username}
                        </span>
                        <span className='text-gray-600 dark:text-gray-300'>
                          {record.progressPercent}%
                        </span>
                        <span className='text-gray-600 dark:text-gray-300'>
                          {formatWatchDuration(record.watchSeconds)}
                        </span>
                        <span className='text-gray-500'>
                          {formatDateTime(record.saveTime)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </PageLayout>
  );
}
