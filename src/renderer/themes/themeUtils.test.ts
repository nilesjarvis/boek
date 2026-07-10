import { describe, expect, it } from 'vitest';
import {
  applyTheme,
  createThemeOptions,
  getNextThemeId,
  isThemeName,
} from './themeUtils';

const theme = {
  name: 'Generated',
  colors: {
    bg: '#101010',
    bgSecondary: '#181818',
    bgTertiary: '#202020',
    fg: '#f5f5f5',
    fgSecondary: '#d0d0d0',
    fgMuted: '#909090',
    accent: '#80a0ff',
    accentHover: '#9ab4ff',
    accentFg: '#101010',
    border: '#404040',
    error: '#ff7070',
    success: '#70d090',
  },
};

describe('applyTheme', () => {
  it('maps theme colors to the renderer CSS variables', () => {
    const variables = new Map<string, string>();
    const style = {
      setProperty: (name: string, value: string) => variables.set(name, value),
    };

    applyTheme(theme, style);

    expect(Object.fromEntries(variables)).toEqual({
      '--bg': '#101010',
      '--bg-secondary': '#181818',
      '--bg-tertiary': '#202020',
      '--fg': '#f5f5f5',
      '--fg-secondary': '#d0d0d0',
      '--fg-muted': '#909090',
      '--accent': '#80a0ff',
      '--accent-hover': '#9ab4ff',
      '--accent-fg': '#101010',
      '--border': '#404040',
      '--error': '#ff7070',
      '--success': '#70d090',
    });
  });

  it('keeps white accent text for built-in themes without an override', () => {
    const variables = new Map<string, string>();
    const style = {
      setProperty: (name: string, value: string) => variables.set(name, value),
    };
    const builtInTheme = {
      ...theme,
      colors: { ...theme.colors, accentFg: undefined },
    };

    applyTheme(builtInTheme, style);

    expect(variables.get('--accent-fg')).toBe('#ffffff');
  });
});

describe('createThemeOptions', () => {
  it('exposes an unconfigured Matugen choice when no generated theme exists', () => {
    const matugenOption = createThemeOptions(undefined).at(-1);

    expect(matugenOption).toMatchObject({
      id: 'matugen',
      label: 'Matugen (not configured)',
      available: false,
    });
  });
});

describe('isThemeName', () => {
  it('accepts built-in and Matugen theme names but rejects unknown values', () => {
    expect(isThemeName('dark')).toBe(true);
    expect(isThemeName('matugen')).toBe(true);
    expect(isThemeName('missing')).toBe(false);
    expect(isThemeName(null)).toBe(false);
  });
});

describe('getNextThemeId', () => {
  it('skips unavailable external themes while cycling', () => {
    const options = createThemeOptions(undefined);

    expect(getNextThemeId(options, 'highContrast')).toBe('dark');
  });
});
