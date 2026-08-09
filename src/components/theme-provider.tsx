"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: PropsWithChildren) {
  // Keep server and initial client render deterministic to avoid hydration mismatches.
  const [theme, setTheme] = useState<Theme>('light');
  const initialized = useRef(false);

  // Synchronize state with whatever class the layout's inline script applied to
  // <html>. Runs once, on mount only, so an existing choice is preserved across
  // client-side navigation (the provider lives in the root layout).
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const root = document.documentElement;
    const next = root.classList.contains('dark') ? 'dark' : 'light';
    setTheme(next);
  }, []);

  // Keep html[class] and localStorage in sync with state whenever it changes.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      toggleTheme: () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light')),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return context;
}