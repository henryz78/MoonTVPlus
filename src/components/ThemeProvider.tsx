'use client';

import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: 'class' | string;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  enableColorScheme?: boolean;
  disableTransitionOnChange?: boolean;
  forcedTheme?: Theme;
};

type ThemeContextValue = {
  theme?: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme?: 'light' | 'dark';
  forcedTheme?: Theme;
  themes: Theme[];
  systemTheme?: 'light' | 'dark';
};

export const ThemeContext = createContext<ThemeContextValue>({
  setTheme: () => {},
  themes: ['light', 'dark', 'system'],
});

function disableTransitions() {
  const style = document.createElement('style');
  style.appendChild(
    document.createTextNode(
      '*,*::before,*::after{transition:none!important}'
    )
  );
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);
    window.setTimeout(() => {
      document.head.removeChild(style);
    }, 1);
  };
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof globalThis.matchMedia !== 'function') return 'light';
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getStoredTheme(defaultTheme: Theme): Theme {
  try {
    return globalThis.localStorage?.getItem('theme') as Theme || defaultTheme;
  } catch {
    return defaultTheme;
  }
}

export function ThemeProvider({
  children,
  attribute = 'class',
  defaultTheme = 'system',
  enableSystem = true,
  enableColorScheme = true,
  disableTransitionOnChange = false,
  forcedTheme,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() =>
    getStoredTheme(defaultTheme)
  );
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() =>
    getSystemTheme()
  );

  const activeTheme = forcedTheme || theme;
  const resolvedTheme =
    activeTheme === 'system' && enableSystem
      ? systemTheme
      : (activeTheme as 'light' | 'dark');

  const applyTheme = useCallback(
    (nextTheme: Theme) => {
      const root = document.documentElement;
      const resolved =
        nextTheme === 'system' && enableSystem ? getSystemTheme() : nextTheme;
      const enableTransitions = disableTransitionOnChange
        ? disableTransitions()
        : null;

      if (attribute === 'class') {
        root.classList.remove('light', 'dark');
        root.classList.add(resolved);
      } else if (attribute.startsWith('data-')) {
        root.setAttribute(attribute, resolved);
      }

      if (enableColorScheme) {
        root.style.colorScheme = resolved;
      }

      enableTransitions?.();
    },
    [attribute, disableTransitionOnChange, enableColorScheme, enableSystem]
  );

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      setThemeState(nextTheme);
      try {
        localStorage.setItem('theme', nextTheme);
      } catch {}
      applyTheme(nextTheme);
    },
    [applyTheme]
  );

  useEffect(() => {
    applyTheme(activeTheme);
  }, [activeTheme, applyTheme]);

  useEffect(() => {
    if (!enableSystem) return;

    if (typeof globalThis.matchMedia !== 'function') return;

    const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const nextSystemTheme = getSystemTheme();
      setSystemTheme(nextSystemTheme);
      if ((forcedTheme || theme) === 'system') {
        applyTheme('system');
      }
    };

    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, [applyTheme, enableSystem, forcedTheme, theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      forcedTheme,
      resolvedTheme,
      themes: enableSystem
        ? (['light', 'dark', 'system'] as Theme[])
        : (['light', 'dark'] as Theme[]),
      systemTheme,
    }),
    [enableSystem, forcedTheme, resolvedTheme, setTheme, systemTheme, theme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
