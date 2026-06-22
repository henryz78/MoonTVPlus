/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { CURRENT_VERSION } from '@/lib/version';
import { checkForUpdates, UpdateStatus } from '@/lib/version_check';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

// 版本显示组件
function VersionDisplay() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (_) {
        // do nothing
      } finally {
        setIsChecking(false);
      }
    };

    checkUpdate();
  }, []);

  return (
    <div className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 transition-colors'>
      <span className='font-mono'>v{CURRENT_VERSION}</span>
      {!isChecking && updateStatus !== UpdateStatus.FETCH_FAILED && (
        <div
          className={`flex items-center gap-1.5 ${
            updateStatus === UpdateStatus.HAS_UPDATE
              ? 'text-yellow-600 dark:text-yellow-400'
              : updateStatus === UpdateStatus.NO_UPDATE
              ? 'text-green-600 dark:text-green-400'
              : ''
          }`}
        >
          {updateStatus === UpdateStatus.HAS_UPDATE && (
            <>
              <AlertCircle className='w-3.5 h-3.5' />
              <span className='font-semibold text-xs'>有新版本</span>
            </>
          )}
          {updateStatus === UpdateStatus.NO_UPDATE && (
            <>
              <CheckCircle className='w-3.5 h-3.5' />
              <span className='font-semibold text-xs'>已是最新</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RegisterPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailCodeLoading, setEmailCodeLoading] = useState(false);
  const [approvalAnswer, setApprovalAnswer] = useState('');
  const [approvalSubmitted, setApprovalSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileLoaded, setTurnstileLoaded] = useState(false);
  const [siteConfig, setSiteConfig] = useState<any>(null);
  const [turnstileWidgetId, setTurnstileWidgetId] = useState<string | null>(
    null
  );
  const [backgroundImage, setBackgroundImage] = useState<string>('');

  const { siteName } = useSite();

  // 在客户端挂载后设置配置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const runtimeConfig = (window as any).RUNTIME_CONFIG;

      // 设置背景图（支持多张随机选择）
      const registerBg = runtimeConfig?.REGISTER_BACKGROUND_IMAGE;
      if (registerBg) {
        const urls = registerBg
          .split('\n')
          .map((url: string) => url.trim())
          .filter((url: string) => url !== '');

        if (urls.length > 0) {
          // 随机选择一张背景图
          const randomIndex = Math.floor(Math.random() * urls.length);
          setBackgroundImage(urls[randomIndex]);
        }
      }

      // 设置站点配置
      const config = {
        EnableRegistration: runtimeConfig?.ENABLE_REGISTRATION || false,
        RequireRegistrationInviteCode:
          runtimeConfig?.REQUIRE_REGISTRATION_INVITE_CODE || false,
        RegistrationRequireEmailVerification:
          runtimeConfig?.REGISTRATION_REQUIRE_EMAIL_VERIFICATION || false,
        RegistrationRequireApproval:
          runtimeConfig?.REGISTRATION_REQUIRE_APPROVAL || false,
        RegistrationApprovalQuestion:
          runtimeConfig?.REGISTRATION_APPROVAL_QUESTION || '',
        RegistrationRequireTurnstile:
          runtimeConfig?.REGISTRATION_REQUIRE_TURNSTILE || false,
        TurnstileSiteKey: runtimeConfig?.TURNSTILE_SITE_KEY || '',
      };
      setSiteConfig(config);

      // 如果未开启注册，重定向到登录页
      if (!config.EnableRegistration) {
        router.replace('/login');
      }
    }
  }, [router]);

  // 加载Cloudflare Turnstile脚本
  useEffect(() => {
    if (
      !siteConfig?.RegistrationRequireTurnstile ||
      !siteConfig?.TurnstileSiteKey
    ) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setTurnstileLoaded(true);
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [siteConfig]);

  // 渲染Turnstile组件
  useEffect(() => {
    if (!turnstileLoaded || !siteConfig?.TurnstileSiteKey) {
      return;
    }

    const container = document.getElementById('turnstile-container');
    if (container && (window as any).turnstile) {
      const widgetId = (window as any).turnstile.render(
        '#turnstile-container',
        {
          sitekey: siteConfig.TurnstileSiteKey,
          callback: (token: string) => {
            setTurnstileToken(token);
          },
        }
      );
      setTurnstileWidgetId(widgetId);
    }
  }, [turnstileLoaded, siteConfig]);

  const handleSendEmailCode = async () => {
    setError(null);
    setSuccessMessage(null);

    if (!username.trim()) {
      setError('请先输入用户名');
      return;
    }
    if (!email.trim()) {
      setError('请输入邮箱');
      return;
    }
    if (siteConfig?.RequireRegistrationInviteCode && !inviteCode.trim()) {
      setError('请输入邀请码');
      return;
    }
    if (siteConfig?.RegistrationRequireTurnstile && !turnstileToken) {
      setError('请完成人机验证');
      return;
    }

    try {
      setEmailCodeLoading(true);
      const res = await fetch('/api/register/email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          inviteCode: siteConfig?.RequireRegistrationInviteCode
            ? inviteCode.trim()
            : undefined,
          turnstileToken: siteConfig?.RegistrationRequireTurnstile
            ? turnstileToken
            : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || '发送验证码失败');
      }
      setSuccessMessage(data.message || '验证码已发送');
    } catch (error) {
      setError(error instanceof Error ? error.message : '发送验证码失败');
    } finally {
      setEmailCodeLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!username || !password || !confirmPassword) {
      setError('请填写所有字段');
      return;
    }

    if (siteConfig?.RequireRegistrationInviteCode && !inviteCode.trim()) {
      setError('请输入邀请码');
      return;
    }

    if (siteConfig?.RegistrationRequireEmailVerification && !email.trim()) {
      setError('请输入邮箱');
      return;
    }

    if (siteConfig?.RegistrationRequireEmailVerification && !emailCode.trim()) {
      setError('请输入邮箱验证码');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码长度至少为6位');
      return;
    }

    if (
      siteConfig?.RegistrationRequireApproval &&
      siteConfig?.RegistrationApprovalQuestion?.trim() &&
      !approvalAnswer.trim()
    ) {
      setError('请回答审批问题');
      return;
    }

    // 检查Turnstile验证
    if (siteConfig?.RegistrationRequireTurnstile && !turnstileToken) {
      setError('请完成人机验证');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          email: siteConfig?.RegistrationRequireEmailVerification
            ? email.trim()
            : undefined,
          emailCode: siteConfig?.RegistrationRequireEmailVerification
            ? emailCode.trim()
            : undefined,
          approvalAnswer: siteConfig?.RegistrationRequireApproval
            ? approvalAnswer.trim()
            : undefined,
          inviteCode: siteConfig?.RequireRegistrationInviteCode
            ? inviteCode.trim()
            : undefined,
          turnstileToken: siteConfig?.RegistrationRequireTurnstile
            ? turnstileToken
            : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.pendingApproval) {
          setApprovalSubmitted(true);
          return;
        }
        // 注册成功，跳转到登录页
        const redirect = searchParams.get('redirect') || '/login';
        router.replace(redirect);
      } else {
        // 注册失败，重置Turnstile
        if (
          siteConfig?.RegistrationRequireTurnstile &&
          turnstileWidgetId !== null &&
          (window as any).turnstile
        ) {
          (window as any).turnstile.reset(turnstileWidgetId);
          setTurnstileToken(null);
        }

        if (res.status === 400) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || '注册失败');
        } else if (res.status === 409) {
          setError('用户名已存在');
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? '服务器错误');
        }
      }
    } catch (error) {
      // 网络错误，重置Turnstile
      if (
        siteConfig?.RegistrationRequireTurnstile &&
        turnstileWidgetId !== null &&
        (window as any).turnstile
      ) {
        (window as any).turnstile.reset(turnstileWidgetId);
        setTurnstileToken(null);
      }
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 如果配置未加载或未开启注册，显示加载中
  if (!siteConfig) {
    return (
      <div className='relative min-h-screen flex items-center justify-center px-4'>
        <div className='text-gray-500 dark:text-gray-400'>加载中...</div>
      </div>
    );
  }

  const submitText = siteConfig?.RegistrationRequireApproval
    ? siteConfig?.RegistrationRequireEmailVerification
      ? '验证并提交申请'
      : '提交申请'
    : siteConfig?.RegistrationRequireEmailVerification
    ? '验证并注册'
    : '注册';

  return (
    <div
      className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'
      style={
        backgroundImage
          ? {
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }
          : undefined
      }
    >
      <div className='absolute top-4 right-4'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40 shadow-2xl p-10 dark:border dark:border-zinc-800'>
        <h1 className='text-green-600 tracking-tight text-center text-3xl font-extrabold mb-2 bg-clip-text drop-shadow-sm'>
          {siteName}
        </h1>
        {approvalSubmitted ? (
          <div className='space-y-6 text-center'>
            <div className='mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/50 dark:text-green-300'>
              <CheckCircle className='h-9 w-9' />
            </div>
            <div>
              <h2 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
                已提交申请
              </h2>
              <p className='mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400'>
                申请已经提交成功，管理员会尽快处理。通常 24
                小时内会完成审核，审核后就可以返回登录页尝试登录。
              </p>
            </div>
            <button
              type='button'
              onClick={() => router.replace('/login')}
              className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-colors hover:bg-green-700'
            >
              返回登录
            </button>
          </div>
        ) : (
          <>
            <p className='text-center text-sm text-gray-600 dark:text-gray-400 mb-8'>
              创建新账号
            </p>
            <form onSubmit={handleSubmit} className='space-y-6'>
              <div>
                <label htmlFor='username' className='sr-only'>
                  用户名
                </label>
                <div className='relative'>
                  <div className='absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none'>
                    <User className='h-5 w-5 text-gray-400 dark:text-gray-500' />
                  </div>
                  <input
                    id='username'
                    type='text'
                    autoComplete='username'
                    className='block w-full rounded-lg border-0 py-3 pl-10 pr-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60'
                    placeholder='输入用户名'
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor='password' className='sr-only'>
                  密码
                </label>
                <div className='relative'>
                  <div className='absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none'>
                    <Lock className='h-5 w-5 text-gray-400 dark:text-gray-500' />
                  </div>
                  <input
                    id='password'
                    type={showPassword ? 'text' : 'password'}
                    autoComplete='new-password'
                    className='block w-full rounded-lg border-0 py-3 pl-10 pr-12 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60'
                    placeholder='输入密码（至少6位）'
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type='button'
                    className='absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className='h-5 w-5' />
                    ) : (
                      <Eye className='h-5 w-5' />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor='confirmPassword' className='sr-only'>
                  确认密码
                </label>
                <div className='relative'>
                  <div className='absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none'>
                    <Lock className='h-5 w-5 text-gray-400 dark:text-gray-500' />
                  </div>
                  <input
                    id='confirmPassword'
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete='new-password'
                    className='block w-full rounded-lg border-0 py-3 pl-10 pr-12 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60'
                    placeholder='再次输入密码'
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type='button'
                    className='absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className='h-5 w-5' />
                    ) : (
                      <Eye className='h-5 w-5' />
                    )}
                  </button>
                </div>
              </div>

              {siteConfig?.RequireRegistrationInviteCode && (
                <div>
                  <label htmlFor='inviteCode' className='sr-only'>
                    邀请码
                  </label>
                  <div className='relative'>
                    <div className='absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none'>
                      <User className='h-5 w-5 text-gray-400 dark:text-gray-500' />
                    </div>
                    <input
                      id='inviteCode'
                      type='text'
                      className='block w-full rounded-lg border-0 py-3 pl-10 pr-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60'
                      placeholder='输入邀请码'
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {siteConfig?.RegistrationRequireEmailVerification && (
                <>
                  <div>
                    <label htmlFor='email' className='sr-only'>
                      邮箱
                    </label>
                    <div className='relative'>
                      <div className='absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none'>
                        <Mail className='h-5 w-5 text-gray-400 dark:text-gray-500' />
                      </div>
                      <input
                        id='email'
                        type='email'
                        autoComplete='email'
                        className='block w-full rounded-lg border-0 py-3 pl-10 pr-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60'
                        placeholder='输入邮箱'
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor='emailCode' className='sr-only'>
                      邮箱验证码
                    </label>
                    <div className='flex gap-2'>
                      <input
                        id='emailCode'
                        type='text'
                        inputMode='numeric'
                        className='min-w-0 flex-1 rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60'
                        placeholder='输入邮箱验证码'
                        value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value)}
                      />
                      <button
                        type='button'
                        onClick={handleSendEmailCode}
                        disabled={emailCodeLoading || !username || !email}
                        className='shrink-0 rounded-lg bg-green-600 px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50'
                      >
                        {emailCodeLoading ? '发送中' : '获取验证码'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {siteConfig?.RegistrationRequireApproval && (
                <div>
                  <label htmlFor='approvalAnswer' className='sr-only'>
                    审批回答
                  </label>
                  <textarea
                    id='approvalAnswer'
                    rows={3}
                    className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 resize-none'
                    placeholder={
                      siteConfig?.RegistrationApprovalQuestion?.trim() ||
                      '请填写注册申请说明'
                    }
                    value={approvalAnswer}
                    onChange={(e) => setApprovalAnswer(e.target.value)}
                  />
                  {siteConfig?.RegistrationApprovalQuestion?.trim() && (
                    <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                      请认真回答，管理员会根据你的回答决定是否通过申请。
                    </p>
                  )}
                </div>
              )}

              {/* Cloudflare Turnstile */}
              {siteConfig?.RegistrationRequireTurnstile &&
                siteConfig?.TurnstileSiteKey && (
                  <div
                    id='turnstile-container'
                    className='flex justify-center'
                  ></div>
                )}

              {error && (
                <p className='text-sm text-red-600 dark:text-red-400'>
                  {error}
                </p>
              )}
              {successMessage && (
                <p className='text-sm text-green-600 dark:text-green-400'>
                  {successMessage}
                </p>
              )}

              {/* 注册按钮 */}
              <button
                type='submit'
                disabled={
                  !username ||
                  !password ||
                  !confirmPassword ||
                  loading ||
                  (siteConfig?.RequireRegistrationInviteCode &&
                    !inviteCode.trim()) ||
                  (siteConfig?.RegistrationRequireEmailVerification &&
                    (!email.trim() || !emailCode.trim())) ||
                  (siteConfig?.RegistrationRequireApproval &&
                    siteConfig?.RegistrationApprovalQuestion?.trim() &&
                    !approvalAnswer.trim()) ||
                  (siteConfig?.RegistrationRequireTurnstile && !turnstileToken)
                }
                className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:from-green-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {loading ? '处理中...' : submitText}
              </button>

              {/* 返回登录链接 */}
              <div className='text-center'>
                <button
                  type='button'
                  onClick={() => router.push('/login')}
                  className='text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors'
                >
                  已有账号？返回登录
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* 版本信息显示 */}
      <VersionDisplay />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterPageClient />
    </Suspense>
  );
}
