import { getThemeInitScript } from './theme-script';

describe('getThemeInitScript', () => {
  it('runs without depending on bundled helper variables', () => {
    const script = getThemeInitScript();

    expect(script).not.toContain('e(C');
    expect(() => new Function(script)).not.toThrow();
  });

  it('applies the stored theme class', () => {
    localStorage.setItem('theme', 'dark');

    new Function(getThemeInitScript())();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
