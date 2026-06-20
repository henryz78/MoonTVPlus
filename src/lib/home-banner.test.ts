import {
  getDefaultHomeBannerHeightScale,
  getSavedHomeBannerHeightScale,
  isPosterLikeBannerImageUrl,
} from './home-banner';

function storageWith(value: string | null): Pick<Storage, 'getItem'> {
  return {
    getItem: () => value,
  };
}

describe('home banner height defaults', () => {
  it('uses the tall banner by default on mobile viewports', () => {
    expect(getDefaultHomeBannerHeightScale(390)).toBe('2');
  });

  it('uses the standard banner by default on desktop viewports', () => {
    expect(getDefaultHomeBannerHeightScale(1024)).toBe('1');
  });

  it('keeps an existing saved banner height', () => {
    expect(getSavedHomeBannerHeightScale(storageWith('1.5'), 390)).toBe('1.5');
  });

  it('falls back to the mobile default when saved value is invalid', () => {
    expect(getSavedHomeBannerHeightScale(storageWith('bad'), 390)).toBe('2');
  });
});

describe('banner image shape detection', () => {
  it('detects Douban poster urls as poster-like banner images', () => {
    expect(
      isPosterLikeBannerImageUrl(
        'https://img.doubanio.cmliussss.com/view/photo/m_ratio_poster/public/p2932334501.jpg'
      )
    ).toBe(true);
  });

  it('does not treat landscape image urls as poster-like banner images', () => {
    expect(
      isPosterLikeBannerImageUrl('https://image.tmdb.org/t/p/original/abc.jpg')
    ).toBe(false);
  });
});
