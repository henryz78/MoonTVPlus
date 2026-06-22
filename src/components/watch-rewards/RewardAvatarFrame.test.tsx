import { render, screen } from '@testing-library/react';

import { RewardAvatarFrame } from './RewardAvatarFrame';

describe('RewardAvatarFrame', () => {
  it('renders the avatar label with a level class and title', () => {
    render(
      <RewardAvatarFrame
        label='H'
        reward={{ level: 4, title: '本周放映王', minSeconds: 50400 }}
        size='compact'
      />
    );

    expect(screen.getByText('H')).toBeInTheDocument();
    expect(screen.getByTitle('本周放映王')).toHaveClass(
      'reward-frame-level-4',
      'reward-frame-compact'
    );
    expect(screen.getByText('H')).toHaveClass('h-[31px]', 'w-[31px]');
  });

  it('renders a plain avatar when reward is missing', () => {
    render(<RewardAvatarFrame label='K' reward={null} size='normal' />);

    expect(screen.getByText('K')).toBeInTheDocument();
    expect(screen.getByTitle('普通头像')).toHaveClass('reward-frame-empty');
  });
});
