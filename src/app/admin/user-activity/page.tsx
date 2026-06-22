'use client';

import { Activity, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import PageLayout from '@/components/PageLayout';
import { RewardAvatarFrame } from '@/components/watch-rewards/RewardAvatarFrame';
import type { WatchReward } from '@/lib/watch-rewards';

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
  currentReward: WatchReward | null;
  currentRankTitle: string | null;
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
    currentReward: WatchReward | null;
    currentRankTitle: string | null;
  };
  records: DetailRecord[];
}

const EMPTY_USERS: OverviewRow[] = [];

const roleText: Record<Role, string> = {
  owner: '站长',
  admin: '管理员',
  user: '用户',
};

function rankTitleClass(rankTitle: string) {
  if (rankTitle === '周榜冠军') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  }
  if (rankTitle === '周榜亚军') {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200';
  }
  return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
}

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

  const closeDetail = () => {
    setSelectedUsername(null);
    setDetail(null);
    setDetailError('');
    setDetailLoading(false);
  };

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const users = overview?.users || EMPTY_USERS;
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
                        <RewardAvatarFrame
                          label={user.username}
                          reward={user.currentReward}
                          size='compact'
                        />
                        <span className='truncate'>{user.username}</span>
                      </div>
                      <div className='mt-1 text-xs text-gray-500'>
                        {roleText[user.role]}
                        {user.banned ? ' · 已封禁' : ''}
                      </div>
                      {(user.currentRankTitle || user.currentReward) && (
                        <div className='mt-1 flex min-w-0 flex-wrap gap-1'>
                          {user.currentRankTitle && (
                            <span
                              className={`max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${rankTitleClass(
                                user.currentRankTitle
                              )}`}
                            >
                              {user.currentRankTitle}
                            </span>
                          )}
                          {user.currentReward && (
                            <span className='max-w-full truncate rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'>
                              {user.currentReward.title}
                            </span>
                          )}
                        </div>
                      )}
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

        {selectedUsername && (
          <div
            className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
            onClick={closeDetail}
          >
            <div
              className='flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900'
              onClick={(event) => event.stopPropagation()}
            >
              <div className='flex items-start justify-between gap-4 border-b border-gray-200 p-4 dark:border-gray-800'>
                <div>
                  <div className='flex items-center gap-2'>
                    <RewardAvatarFrame
                      label={selectedUsername}
                      reward={detailUser?.currentReward || null}
                      size='normal'
                    />
                    <h2 className='text-base font-semibold text-gray-900 dark:text-gray-100'>
                      {selectedUsername} 的观看记录
                    </h2>
                  </div>
                  {(detailUser?.currentRankTitle ||
                    detailUser?.currentReward) && (
                    <div className='mt-2 flex flex-wrap gap-1'>
                      {detailUser.currentRankTitle && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${rankTitleClass(
                            detailUser.currentRankTitle
                          )}`}
                        >
                          {detailUser.currentRankTitle}
                        </span>
                      )}
                      {detailUser.currentReward && (
                        <span className='rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'>
                          {detailUser.currentReward.title}
                        </span>
                      )}
                    </div>
                  )}
                  {detailUser && (
                    <p className='mt-1 text-xs text-gray-500'>
                      最近活跃：
                      {formatActivity(
                        detailUser.lastActiveAt,
                        selectedOverviewUser?.username === detailUser.username
                          ? selectedOverviewUser.isOnline
                          : undefined
                      )}
                      {detailUser.lastActiveAt ? (
                        <>
                          {' · '}
                          精确时间：{formatDateTime(detailUser.lastActiveAt)}
                        </>
                      ) : null}
                      {' · '}
                      观看记录：{detailUser.playRecordCount} 条
                    </p>
                  )}
                </div>
                <button
                  type='button'
                  onClick={closeDetail}
                  className='rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                  aria-label='关闭'
                >
                  <X className='h-4 w-4' />
                </button>
              </div>

              <div className='overflow-y-auto p-4'>
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
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
