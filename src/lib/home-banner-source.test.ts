import { rotateBannerItems } from './home-banner-source';

describe('home banner source selection', () => {
  it('starts banner items after the first homepage movie rows', () => {
    expect(rotateBannerItems([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5, 5)).toEqual([
      6, 7, 8, 9, 10,
    ]);
  });

  it('wraps around when there are fewer items after the offset', () => {
    expect(rotateBannerItems([1, 2, 3, 4, 5, 6, 7], 5, 5)).toEqual([
      6, 7, 1, 2, 3,
    ]);
  });

  it('keeps short lists usable', () => {
    expect(rotateBannerItems([1, 2, 3], 5, 5)).toEqual([1, 2, 3]);
  });
});
