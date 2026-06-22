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
  1: 'reward-frame-level-1 bg-gradient-to-br from-emerald-300 via-teal-400 to-lime-300 shadow-[0_0_14px_rgba(45,212,191,0.4)]',
  2: 'reward-frame-level-2 bg-[conic-gradient(from_35deg,#60a5fa,#22d3ee,#2563eb,#60a5fa)] shadow-[0_0_16px_rgba(37,99,235,0.38)]',
  3: 'reward-frame-level-3 bg-[conic-gradient(from_20deg,#f0abfc,#a855f7,#ec4899,#f0abfc)] shadow-[0_0_18px_rgba(217,70,239,0.42)]',
  4: 'reward-frame-level-4 bg-[conic-gradient(from_15deg,#fde68a,#f59e0b,#fff7ed,#d97706,#fde68a)] shadow-[0_0_18px_rgba(245,158,11,0.45)]',
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
    : 'reward-frame-empty bg-gray-200 dark:bg-gray-700';
  const innerClass =
    reward?.level === 4 && size === 'compact'
      ? 'h-[31px] w-[31px]'
      : innerSizeClass[size];
  const safeLabel = label.trim().charAt(0).toUpperCase() || 'U';

  return (
    <span
      title={title}
      className={[
        'reward-avatar-frame relative inline-flex shrink-0 items-center justify-center rounded-full p-[2px]',
        sizeClass[size],
        frameClass,
        className,
      ].join(' ')}
    >
      {reward?.level === 4 && (
        <span
          aria-hidden='true'
          className='absolute -top-2 left-1/2 h-3 w-5 -translate-x-1/2 rounded-t-full border border-amber-200 bg-amber-400/90 shadow-sm'
        />
      )}
      {reward?.level === 3 && (
        <span
          aria-hidden='true'
          className='absolute -right-0.5 top-1 h-1.5 w-1.5 rounded-full bg-fuchsia-100 shadow-[0_0_8px_rgba(240,171,252,0.9)]'
        />
      )}
      {reward?.level === 1 && (
        <span
          aria-hidden='true'
          className='absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-100 shadow-[0_0_8px_rgba(110,231,183,0.9)]'
        />
      )}
      <span
        className={[
          'relative z-10 inline-flex items-center justify-center rounded-full bg-white font-semibold text-gray-800 dark:bg-gray-950 dark:text-gray-100',
          innerClass,
        ].join(' ')}
      >
        {safeLabel}
      </span>
    </span>
  );
}
