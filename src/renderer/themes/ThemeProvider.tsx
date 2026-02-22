import React, { createContext, useContext, useEffect, useState } from 'react';
import { themes, Theme, ThemeName } from './index';

interface ThemeContextType {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function getInitialTheme(): ThemeName {
  try {
    const saved = localStorage.getItem('theme') as ThemeName;
    if (saved && themes[saved]) return saved;
  } catch { /* ignore */ }
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(getInitialTheme);

  useEffect(() => {
    const theme = themes[themeName];
    const root = document.documentElement;
    root.style.setProperty('--bg', theme.colors.bg);
    root.style.setProperty('--bg-secondary', theme.colors.bgSecondary);
    root.style.setProperty('--bg-tertiary', theme.colors.bgTertiary);
    root.style.setProperty('--fg', theme.colors.fg);
    root.style.setProperty('--fg-secondary', theme.colors.fgSecondary);
    root.style.setProperty('--fg-muted', theme.colors.fgMuted);
    root.style.setProperty('--accent', theme.colors.accent);
    root.style.setProperty('--accent-hover', theme.colors.accentHover);
    root.style.setProperty('--border', theme.colors.border);
    root.style.setProperty('--error', theme.colors.error);
    root.style.setProperty('--success', theme.colors.success);
    localStorage.setItem('theme', themeName);
  }, [themeName]);

  return (
    <ThemeContext.Provider
      value={{ theme: themes[themeName], themeName, setTheme: setThemeName }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
