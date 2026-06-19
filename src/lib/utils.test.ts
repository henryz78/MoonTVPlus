import { getUnavailablePosterPlaceholder, processImageUrl } from './utils';

describe('image url helpers', () => {
  it('does not replace iqiyi posters before the card tries to load them', () => {
    const url = 'https://pic.iqiyizyimg.com/example.jpg';

    expect(processImageUrl(url)).toBe(url);
  });

  it('provides a local unavailable poster placeholder', () => {
    const placeholder = getUnavailablePosterPlaceholder();

    expect(placeholder).toContain('data:image/svg+xml');
    expect(decodeURIComponent(placeholder)).toContain('暂无封面');
  });
});
