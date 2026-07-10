import { BuiltInThemeName, Theme, ThemeName, themes } from './index';

interface StyleProperties {
  setProperty(name: string, value: string): void;
}

export interface ThemeOption {
  id: ThemeName;
  label: string;
  theme: Theme;
  available: boolean;
}

export function isThemeName(value: unknown): value is ThemeName {
  return (
    value === 'matugen' ||
    (typeof value === 'string' && Object.prototype.hasOwnProperty.call(themes, value))
  );
}

export function createThemeOptions(matugenTheme?: Theme): ThemeOption[] {
  const builtInOptions = (Object.entries(themes) as [BuiltInThemeName, Theme][]).map(
    ([id, theme]) => ({ id, label: theme.name, theme, available: true }),
  );

  return [
    ...builtInOptions,
    {
      id: 'matugen',
      label: matugenTheme?.name ?? 'Matugen (not configured)',
      theme: matugenTheme ?? themes.dark,
      available: Boolean(matugenTheme),
    },
  ];
}

export function getNextThemeId(
  options: ThemeOption[],
  currentTheme: ThemeName,
): ThemeName {
  const availableOptions = options.filter(option => option.available);
  if (!availableOptions.length) return currentTheme;

  const currentIndex = availableOptions.findIndex(option => option.id === currentTheme);
  return availableOptions[(currentIndex + 1) % availableOptions.length].id;
}

export function applyTheme(theme: Theme, style: StyleProperties): void {
  style.setProperty('--bg', theme.colors.bg);
  style.setProperty('--bg-secondary', theme.colors.bgSecondary);
  style.setProperty('--bg-tertiary', theme.colors.bgTertiary);
  style.setProperty('--fg', theme.colors.fg);
  style.setProperty('--fg-secondary', theme.colors.fgSecondary);
  style.setProperty('--fg-muted', theme.colors.fgMuted);
  style.setProperty('--accent', theme.colors.accent);
  style.setProperty('--accent-hover', theme.colors.accentHover);
  style.setProperty('--accent-fg', theme.colors.accentFg ?? '#ffffff');
  style.setProperty('--border', theme.colors.border);
  style.setProperty('--error', theme.colors.error);
  style.setProperty('--success', theme.colors.success);
}
