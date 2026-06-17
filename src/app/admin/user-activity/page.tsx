'use client';

import { Activity, RefreshCw, Search, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import PageLayout from '@/components/PageLayout';

type Role = 'owner' | 'admin' | 'user';

interface LatestPlayRecordSummary {
  title: string;
  episode: number;
  sourceName: string;
  progressPercent: number;
  saveTime: number;
}

interface OverviewRow {
  username: string;
  role: Role;
  banned: boolean;
  lastActiveAt: number | null;
  isOnline: boolean;
  playRecordCount: number;
  latestPlayRecord: LatestPlayRecordSummary | null;
}

interface OverviewResponse {
  users: OverviewRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface DetailRecord {
  key: string;
  title: string;
  source_name: string;
  cover: string;
  index: number;
  total_episodes: number;
  play_time: number;
  total_time: number;
  save_time: number;
}

interface DetailResponse {
  user: {
    username: string;
    role: Role;
    banned: boolean;
    lastActiveAt: number | null;
    playRecordCount: number;
  };
  records: DetailRecord[];
}

const roleText: Record<Role, string> = {
  owner: '站长',
  admin: '管理员',
  user: '用户',
};

function formatDateTime(timestamp: number) {
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
  const diff = Date.now() - lastActiveAt;
  if (isOnline || diff <= 2 * 60 * 1000) return '在线';
  if (diff <= 10 * 60 * 1000) {
    return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  }
  return formatDateTime(lastActiveAt);
}

function formatProgress(record: DetailRecord) {
  if (!record.total_time) return '进度未知';
  const percent = Math.round((record.play_time / record.total_time) * 100);
  return `${Math.min(100, Math.max(0, percent))}%`;
}

export default function UserActivityPage() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (search.trim()) params.set('search', search.trim());

      const response = await fetch(
        `/api/admin/user-activity?${params.toString()}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '加载用户动态失败');
      }
      setOverview(data);
    } catch (error) {
      setOverviewError(
        error instanceof Error ? error.message : '加载用户动态失败'
      );
    } finally {
      setOverviewLoading(false);
    }
  }, [page, search]);

  const loadDetail = useCallback(async (username: string) => {
    setSelectedUsername(username);
    setDetailLoading(true);
    setDetailError('');
    try {
      const response = await fetch(
        `/api/admin/user-activity/${encodeURIComponent(username)}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '加载观看记录失败');
      }
      setDetail(data);
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : '加载观看记录失败'
      );
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const users = overview?.users || [];
  const totalPages = overview?.totalPages || 0;
  const selectedOverviewUser = useMemo(
    () => users.find((item) => item.username === selectedUsername) || null,
    [selectedUsername, users]
  );
  const detailUser = detail?.user || selectedOverviewUser;

  return (
    <PageLayout activePath='/admin'>
      <div className='mx-auto max-w-7xl px-4 py-8 md:px-8'>
        <div className='mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div>
            <h1 className='flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100'>
              <Activity className='h-6 w-6 text-blue-500' />
              用户动态
            </h1>
            <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
              查看用户最近活跃状态和观看记录
            </p>
          </div>

          <div className='flex flex-col gap-2 sm:flex-row'>
            <label className='relative'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400' />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder='搜索用户'
                className='h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-56 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
              />
            </label>
            <button
              type='button'
              onClick={() => loadOverview()}
              disabled={overviewLoading}
              className='inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60'
            >
              <RefreshCw
                className={`h-4 w-4 ${overviewLoading ? 'animate-spin' : ''}`}
              />
              刷新
            </button>
          </div>
        </div>

        {overviewError && (
          <div className='mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'>
            {overviewError}
          </div>
        )}

        <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]'>
          <section className='overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'>
            <div className='overflow-x-auto'>
              <div className='min-w-[760px]'>
                <div className='grid grid-cols-[1fr_120px_100px_1.2fr_96px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400'>
                  <span>用户</span>
                  <span>活跃</span>
                  <span>记录</span>
                  <span>最近观看</span>
                  <span>操作</span>
                </div>

                {overviewLoading && users.length === 0 ? (
                  <div className='p-8 text-center text-sm text-gray-500'>
                    加载中...
                  </div>
                ) : users.length === 0 ? (
                  <div className='p-8 text-center text-sm text-gray-500'>
                    暂无用户动态
                  </div>
                ) : (
                  users.map((user) => (
                    <div
                      key={user.username}
                      className='grid grid-cols-[1fr_120px_100px_1.2fr_96px] gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0 dark:border-gray-800'
                    >
                      <div className='min-w-0'>
                        <div className='flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100'>
                          <UserRound className='h-4 w-4 flex-none text-gray-400' />
                          <span className='truncate'>{user.username}</span>
                        </div>
                        <div className='mt-1 text-xs text-gray-500'>
                          {roleText[user.role]}
                          {user.banned ? ' · 已封禁' : ''}
                        </div>
                      </div>
                      <span
                        className={
                          user.isOnline
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-gray-600 dark:text-gray-300'
                        }
                      >
                        {formatActivity(user.lastActiveAt, user.isOnline)}
                      </span>
                      <span>{user.playRecordCount} 条</span>
                      <span className='min-w-0 truncate text-gray-700 dark:text-gray-300'>
                        {user.latestPlayRecord
                          ? `${user.latestPlayRecord.title} · 第 ${user.latestPlayRecord.episode} 集 · ${user.latestPlayRecord.progressPercent}%`
                          : '暂无观看记录'}
                      </span>
                      <button
                        type='button'
                        onClick={() => loadDetail(user.username)}
                        className='rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      >
                        查看详情
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className='flex flex-col gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800'>
              <span>共 {overview?.total || 0} 个用户</span>
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className='rounded-md border border-gray-300 px-2 py-1 disabled:opacity-50 dark:border-gray-700'
                >
                  上一页
                </button>
                <span>
                  {page} / {Math.max(1, totalPages)}
                </span>
                <button
                  type='button'
                  disabled={totalPages === 0 || page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                  className='rounded-md border border-gray-300 px-2 py-1 disabled:opacity-50 dark:border-gray-700'
                >
                  下一页
                </button>
              </div>
            </div>
          </section>

          <aside className='rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900'>
            <div className='mb-3'>
              <h2 className='text-base font-semibold text-gray-900 dark:text-gray-100'>
                {selectedUsername ? `${selectedUsername} 的观看记录` : '观看记录详情'}
              </h2>
              {detailUser && (
                <p className='mt-1 text-xs text-gray-500'>
                  最近活跃：
                  {formatActivity(
                    detailUser.lastActiveAt,
                    selectedOverviewUser?.username === detailUser.username
                      ? selectedOverviewUser.isOnline
                      : undefined
                  )}
                  {' · '}
                  观看记录：{detailUser.playRecordCount} 条
                </p>
              )}
            </div>

            {detailLoading ? (
              <div className='py-10 text-center text-sm text-gray-500'>
                加载中...
              </div>
            ) : detailError ? (
              <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'>
                {detailError}
              </div>
            ) : !detail ? (
              <div className='py-10 text-center text-sm text-gray-500'>
                选择用户查看详情
              </div>
            ) : detail.records.length === 0 ? (
              <div className='py-10 text-center text-sm text-gray-500'>
                暂无观看记录
              </div>
            ) : (
              <div className='space-y-3'>
                {detail.records.map((record) => (
                  <div
                    key={record.key}
                    className='flex gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800'
                  >
                    {record.cover ? (
                      <img
                        src={record.cover}
                        alt=''
                        className='h-20 w-14 flex-none rounded object-cover'
                      />
                    ) : (
                      <div className='h-20 w-14 flex-none rounded bg-gray-200 dark:bg-gray-800' />
                    )}
                    <div className='min-w-0 flex-1'>
                      <div className='truncate font-medium text-gray-900 dark:text-gray-100'>
                        {record.title}
                      </div>
                      <div className='mt-1 text-xs text-gray-500'>
                        {record.source_name} · 第 {record.index} /{' '}
                        {record.total_episodes || '?'} 集
                      </div>
                      <div className='mt-1 text-xs text-gray-500'>
                        进度 {formatProgress(record)} ·{' '}
                        {formatDateTime(record.save_time)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </PageLayout>
  );
}
