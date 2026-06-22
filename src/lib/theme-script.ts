export function getThemeInitScript() {
  return `
(function () {
  var root = document.documentElement;
  var storageKey = 'theme';
  var defaultTheme = 'system';
  var themes = ['light', 'dark'];

  function getSystemTheme() {
    if (!window.matchMedia) return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    var resolved = theme === 'system' ? getSystemTheme() : theme;
    root.classList.remove.apply(root.classList, themes);
    root.classList.add(resolved);
    if (themes.indexOf(resolved) !== -1) {
      root.style.colorScheme = resolved;
    }
  }

  try {
    applyTheme(localStorage.getItem(storageKey) || defaultTheme);
  } catch (error) {
    applyTheme(defaultTheme);
  }
})();
`.trim();
}
