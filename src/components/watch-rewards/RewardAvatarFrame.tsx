import { Crown, Sparkles } from 'lucide-react';

import type { WatchReward } from '@/lib/watch-rewards';

type RewardAvatarFrameSize = 'compact' | 'normal';

interface RewardAvatarFrameProps {
  label: string;
  reward: WatchReward | null;
  size?: RewardAvatarFrameSize;
  className?: string;
}

const sizeClass: Record<RewardAvatarFrameSize, string> = {
  compact: 'reward-frame-compact h-9 w-9 text-sm',
  normal: 'reward-frame-normal h-11 w-11 text-base',
};

const innerSizeClass: Record<RewardAvatarFrameSize, string> = {
  compact: 'h-[30px] w-[30px]',
  normal: 'h-[38px] w-[38px]',
};

const levelFrameClass: Record<WatchReward['level'], string> = {
  1: 'reward-frame-level-1 shadow-[0_0_13px_rgba(16,185,129,0.42)]',
  2: 'reward-frame-level-2 shadow-[0_0_16px_rgba(37,99,235,0.46)]',
  3: 'reward-frame-level-3 shadow-[0_0_18px_rgba(217,70,239,0.5)]',
  4: 'reward-frame-level-4 shadow-[0_0_20px_rgba(245,158,11,0.54)]',
};

const levelRingClass: Record<WatchReward['level'], string> = {
  1: 'bg-[conic-gradient(from_30deg,#d9f99d,#10b981,#5eead4,#22c55e,#d9f99d)]',
  2: 'bg-[repeating-conic-gradient(from_18deg,#67e8f9_0deg_17deg,#2563eb_17deg_39deg,#0f172a_39deg_45deg)]',
  3: 'bg-[conic-gradient(from_15deg,#f5d0fe,#c084fc,#ec4899,#7c3aed,#f5d0fe)]',
  4: 'bg-[conic-gradient(from_12deg,#fff7cc,#f59e0b,#92400e,#fde68a,#fffdf2,#d97706,#fff7cc)]',
};

export function RewardAvatarFrame({
  label,
  reward,
  size = 'normal',
  className = '',
}: RewardAvatarFrameProps) {
  const title = reward?.title || '普通头像';
  const frameClass = reward
    ? levelFrameClass[reward.level]
    : 'reward-frame-empty shadow-[0_1px_4px_rgba(15,23,42,0.14)]';
  const ringClass = reward
    ? levelRingClass[reward.level]
    : 'bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400 dark:from-gray-600 dark:via-gray-700 dark:to-gray-500';
  const innerClass =
    reward?.level === 4 && size === 'compact'
      ? 'h-[31px] w-[31px]'
      : innerSizeClass[size];
  const safeLabel = label.trim().charAt(0).toUpperCase() || 'U';

  return (
    <span
      title={title}
      className={[
        'reward-avatar-frame relative isolate inline-flex shrink-0 items-center justify-center overflow-visible rounded-full',
        sizeClass[size],
        frameClass,
        className,
      ].join(' ')}
    >
      {reward?.level === 4 && (
        <span
          aria-hidden='true'
          data-testid='reward-frame-halo'
          className={`absolute rounded-full bg-amber-300/30 blur-md ${
            size === 'compact' ? '-inset-1.5' : '-inset-2'
          }`}
        />
      )}
      <span
        aria-hidden='true'
        data-testid={reward?.level === 2 ? 'reward-frame-segments' : undefined}
        className={`absolute inset-0 z-10 rounded-full ${ringClass}`}
      />
      {reward?.level === 1 && (
        <span
          aria-hidden='true'
          data-testid='reward-frame-light-dot'
          className='absolute -right-0.5 bottom-1 z-40 h-2 w-2 rounded-full border border-white/80 bg-emerald-100 shadow-[0_0_9px_rgba(110,231,183,1)]'
        />
      )}
      {reward?.level === 2 && (
        <span
          aria-hidden='true'
          data-testid='reward-frame-inner-line'
          className='absolute inset-[3px] z-20 rounded-full border border-cyan-100/80 shadow-[inset_0_0_5px_rgba(34,211,238,0.65)]'
        />
      )}
      {reward?.level === 3 && (
        <>
          <span
            aria-hidden='true'
            data-testid='reward-frame-orbit'
            className='absolute -inset-x-1.5 inset-y-0.5 z-20 rotate-[28deg] rounded-full border border-fuchsia-200/70 shadow-[0_0_8px_rgba(232,121,249,0.7)]'
          />
          <Sparkles
            aria-hidden='true'
            data-testid='reward-frame-star'
            className='absolute -right-1 -top-1 z-40 h-3.5 w-3.5 fill-fuchsia-100 text-fuchsia-100 drop-shadow-[0_0_5px_rgba(240,171,252,1)]'
          />
        </>
      )}
      {reward?.level === 4 && (
        <span
          aria-hidden='true'
          data-testid='reward-frame-crown'
          className='absolute -top-3 left-1/2 z-40 -translate-x-1/2'
        >
          <Crown
            className={`fill-amber-300 text-amber-100 drop-shadow-[0_1px_4px_rgba(180,83,9,0.9)] ${
              size === 'compact' ? 'h-4 w-4' : 'h-[18px] w-[18px]'
            }`}
            strokeWidth={1.8}
          />
        </span>
      )}
      <span
        className={[
          'relative z-30 inline-flex items-center justify-center rounded-full border border-white/80 bg-gradient-to-br from-white via-gray-50 to-gray-200 font-semibold text-gray-800 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),0_1px_3px_rgba(15,23,42,0.18)] dark:border-gray-800 dark:from-gray-800 dark:via-gray-900 dark:to-black dark:text-gray-100',
          innerClass,
        ].join(' ')}
      >
        {safeLabel}
      </span>
    </span>
  );
}
