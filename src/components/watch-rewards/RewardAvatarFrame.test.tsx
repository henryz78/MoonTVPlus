import { render, screen } from '@testing-library/react';

import { RewardAvatarFrame } from './RewardAvatarFrame';

describe('RewardAvatarFrame', () => {
  it.each([
    [1, '本周观影者', ['reward-frame-light-dot']],
    [2, '本周影迷', ['reward-frame-segments', 'reward-frame-inner-line']],
    [3, '本周追剧达人', ['reward-frame-orbit', 'reward-frame-star']],
    [4, '本周放映王', ['reward-frame-halo', 'reward-frame-crown']],
  ] as const)(
    'renders the complete level %s frame decoration',
    (level, title, decorations) => {
      render(
        <RewardAvatarFrame
          label='H'
          reward={{ level, title, minSeconds: level * 3600 }}
          size='compact'
        />
      );

      expect(screen.getByText('H')).toBeInTheDocument();
      expect(screen.getByTitle(title)).toHaveClass(
        `reward-frame-level-${level}`,
        'reward-frame-compact'
      );
      decorations.forEach((decoration) => {
        expect(screen.getByTestId(decoration)).toBeInTheDocument();
      });
    }
  );

  it('keeps the compact gold frame slightly thinner', () => {
    render(
      <RewardAvatarFrame
        label='H'
        reward={{ level: 4, title: '本周放映王', minSeconds: 50400 }}
        size='compact'
      />
    );

    expect(screen.getByText('H')).toHaveClass('h-[31px]', 'w-[31px]');
  });

  it('renders a plain avatar when reward is missing', () => {
    render(<RewardAvatarFrame label='K' reward={null} size='normal' />);

    expect(screen.getByText('K')).toBeInTheDocument();
    expect(screen.getByTitle('普通头像')).toHaveClass('reward-frame-empty');
  });
});
