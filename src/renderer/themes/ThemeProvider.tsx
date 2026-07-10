import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Theme, ThemeName, themes } from './index';
import {
  applyTheme,
  createThemeOptions,
  isThemeName,
  ThemeOption,
} from './themeUtils';

interface ThemeContextType {
  theme: Theme;
  themeName: ThemeName;
  themeOptions: ThemeOption[];
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function getInitialTheme(): ThemeName {
  try {
    const saved: unknown = localStorage.getItem('theme');
    if (isThemeName(saved)) return saved;
  } catch { /* ignore */ }
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(getInitialTheme);
  const [matugenTheme, setMatugenTheme] = useState<Theme>();
  const themeOptions = useMemo(() => createThemeOptions(matugenTheme), [matugenTheme]);
  const theme = themeOptions.find(option => option.id === themeName)?.theme ?? themes.dark;

  useEffect(() => {
    let mounted = true;
    const updateMatugenTheme = (result: Awaited<ReturnType<typeof window.electronAPI.getMatugenTheme>>) => {
      if (!mounted || !result.available || !result.theme) return;
      setMatugenTheme(result.theme);
    };

    void window.electronAPI.getMatugenTheme()
      .then(updateMatugenTheme)
      .catch(error => console.error('Failed to load Matugen theme:', error));
    const unsubscribe = window.electronAPI.onMatugenThemeUpdated(updateMatugenTheme);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    applyTheme(theme, document.documentElement.style);
    localStorage.setItem('theme', themeName);
  }, [theme, themeName]);

  return (
    <ThemeContext.Provider
      value={{ theme, themeName, themeOptions, setTheme: setThemeName }}
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
