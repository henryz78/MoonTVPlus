/* eslint-disable @next/next/no-img-element */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import VideoCard from './VideoCard';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    onError,
    onLoadingComplete,
  }: {
    src: string;
    alt: string;
    onError?: React.ReactEventHandler<HTMLImageElement>;
    onLoadingComplete?: () => void;
  }) => (
    <img
      src={src}
      alt={alt}
      onError={onError}
      onLoad={() => onLoadingComplete?.()}
    />
  ),
}));

jest.mock('@/lib/db.client', () => ({
  deleteFavorite: jest.fn(),
  deletePlayRecord: jest.fn(),
  generateStorageKey: jest.fn(() => 'source+id'),
  isFavorited: jest.fn(),
  saveFavorite: jest.fn(),
  subscribeToDataUpdates: jest.fn(() => jest.fn()),
}));

jest.mock('@/components/DetailPanel', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/AIChatPanel', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/MobileActionSheet', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/ImageViewer', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/TrailerPickerDialog', () => ({
  __esModule: true,
  default: () => null,
}));

describe('VideoCard', () => {
  it('falls back to unavailable poster after an iqiyi image load error', async () => {
    render(
      <VideoCard
        id='1'
        source='iqiyi'
        title='爱奇艺短剧'
        poster='https://pic.iqiyizyimg.com/example.jpg'
        from='search'
        type='tv'
      />
    );

    const image = screen.getByAltText('爱奇艺短剧') as HTMLImageElement;
    expect(image.src).toContain('iqiyizyimg.com');

    fireEvent.error(image);

    await waitFor(() => {
      expect(decodeURIComponent(image.src)).toContain('暂无封面');
    });
  });
});
