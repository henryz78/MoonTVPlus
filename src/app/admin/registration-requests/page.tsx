'use client';

import { Check, RefreshCw, UserPlus, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import PageLayout from '@/components/PageLayout';

type RequestStatus = 'pending' | 'approved' | 'rejected';

interface RegistrationRequestView {
  id: string;
  username: string;
  email?: string;
  approvalQuestion?: string;
  approvalAnswer?: string;
  status: RequestStatus;
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectReason?: string;
}

const statusText: Record<RequestStatus, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已拒绝',
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

export default function RegistrationRequestsPage() {
  const [requests, setRequests] = useState<RegistrationRequestView[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<RequestStatus | 'all'>('pending');

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      const response = await fetch(
        `/api/admin/registration-requests?${params.toString()}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '加载注册审批失败');
      }
      setRequests(data.requests || []);
    } catch (error) {
      setError(error instanceof Error ? error.message : '加载注册审批失败');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const handleAction = async (
    requestId: string,
    action: 'approve' | 'reject'
  ) => {
    setBusyId(requestId);
    setError('');
    try {
      const response = await fetch(
        `/api/admin/registration-requests/${encodeURIComponent(requestId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '处理注册审批失败');
      }
      setRequests((current) =>
        current.map((request) =>
          request.id === requestId ? data.request : request
        )
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : '处理注册审批失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageLayout activePath='/admin'>
      <div className='mx-auto max-w-7xl px-4 py-8 md:px-8'>
        <div className='mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div>
            <h1 className='flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100'>
              <UserPlus className='h-6 w-6 text-blue-500' />
              注册审批
            </h1>
            <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
              查看用户注册申请和审批回答
            </p>
          </div>

          <div className='flex flex-col gap-2 sm:flex-row'>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as RequestStatus | 'all')
              }
              className='h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
            >
              <option value='pending'>待审批</option>
              <option value='approved'>已通过</option>
              <option value='rejected'>已拒绝</option>
              <option value='all'>全部</option>
            </select>
            <button
              type='button'
              onClick={() => loadRequests()}
              disabled={loading}
              className='inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60'
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
              刷新
            </button>
          </div>
        </div>

        {error && (
          <div className='mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'>
            {error}
          </div>
        )}

        <section className='overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'>
          <div className='overflow-x-auto'>
            <div className='min-w-[920px]'>
              <div className='grid grid-cols-[1fr_1.4fr_1.6fr_130px_120px_150px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400'>
                <span>用户</span>
                <span>邮箱</span>
                <span>回答</span>
                <span>提交时间</span>
                <span>状态</span>
                <span>操作</span>
              </div>

              {loading && requests.length === 0 ? (
                <div className='p-8 text-center text-sm text-gray-500'>
                  加载中...
                </div>
              ) : requests.length === 0 ? (
                <div className='p-8 text-center text-sm text-gray-500'>
                  暂无注册申请
                </div>
              ) : (
                requests.map((request) => (
                  <div
                    key={request.id}
                    className='grid grid-cols-[1fr_1.4fr_1.6fr_130px_120px_150px] gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0 dark:border-gray-800'
                  >
                    <div className='min-w-0 font-medium text-gray-900 dark:text-gray-100'>
                      <div className='truncate'>{request.username}</div>
                      {request.reviewedBy && (
                        <div className='mt-1 text-xs text-gray-500'>
                          处理人：{request.reviewedBy}
                        </div>
                      )}
                    </div>
                    <span className='min-w-0 truncate text-gray-700 dark:text-gray-300'>
                      {request.email || '未填写'}
                    </span>
                    <div className='min-w-0 text-gray-700 dark:text-gray-300'>
                      {request.approvalQuestion && (
                        <div className='truncate text-xs text-gray-500'>
                          {request.approvalQuestion}
                        </div>
                      )}
                      <div className='mt-1 break-words'>
                        {request.approvalAnswer || '未填写'}
                      </div>
                    </div>
                    <span className='text-gray-600 dark:text-gray-300'>
                      {formatDateTime(request.createdAt)}
                    </span>
                    <span
                      className={
                        request.status === 'pending'
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : request.status === 'approved'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }
                    >
                      {statusText[request.status]}
                    </span>
                    <div className='flex gap-2'>
                      <button
                        type='button'
                        onClick={() => handleAction(request.id, 'approve')}
                        disabled={
                          request.status !== 'pending' || busyId === request.id
                        }
                        className='inline-flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50'
                      >
                        <Check className='h-3.5 w-3.5' />
                        通过
                      </button>
                      <button
                        type='button'
                        onClick={() => handleAction(request.id, 'reject')}
                        disabled={
                          request.status !== 'pending' || busyId === request.id
                        }
                        className='inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50'
                      >
                        <X className='h-3.5 w-3.5' />
                        拒绝
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
