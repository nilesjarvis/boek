import { mkdirSync, watch } from 'fs';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import * as path from 'path';

export interface MatugenThemeColors {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  fg: string;
  fgSecondary: string;
  fgMuted: string;
  accent: string;
  accentHover: string;
  accentFg: string;
  border: string;
  error: string;
  success: string;
}

export interface MatugenTheme {
  name: string;
  colors: MatugenThemeColors;
}

export interface MatugenThemeLoadResult {
  available: boolean;
  path: string;
  theme?: MatugenTheme;
  error?: string;
}

interface ThemeDirectoryWatcher {
  on(event: 'error', listener: (error: Error) => void): unknown;
  close(): void;
}

type WatchDirectory = (
  directory: string,
  listener: (eventType: 'rename' | 'change', fileName: string | Buffer | null) => void,
) => ThemeDirectoryWatcher;

const REQUIRED_COLOR_ROLES = [
  'bg',
  'bgSecondary',
  'bgTertiary',
  'fg',
  'fgSecondary',
  'fgMuted',
  'accent',
  'accentHover',
  'accentFg',
  'border',
  'error',
  'success',
] as const satisfies readonly (keyof MatugenThemeColors)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseMatugenTheme(contents: string): MatugenTheme {
  const parsed: unknown = JSON.parse(contents);
  if (!isRecord(parsed) || !isRecord(parsed.colors)) {
    throw new Error('Matugen theme must contain a colors object');
  }
  if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
    throw new Error('Matugen theme name must be a non-empty string');
  }

  for (const role of REQUIRED_COLOR_ROLES) {
    const color = parsed.colors[role];
    if (typeof color !== 'string') {
      throw new Error(`Matugen theme is missing required color "${role}"`);
    }
    if (!/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(color)) {
      throw new Error(
        `Matugen theme color "${role}" must use #RRGGBB or #RRGGBBAA format`,
      );
    }
  }

  return parsed as unknown as MatugenTheme;
}

export async function loadMatugenTheme(
  themePath: string,
): Promise<MatugenThemeLoadResult> {
  try {
    const contents = await readFile(themePath, 'utf8');
    return {
      available: true,
      path: themePath,
      theme: parseMatugenTheme(contents),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        available: false,
        path: themePath,
        error: 'Matugen theme file not found',
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      path: themePath,
      error: `Invalid Matugen theme: ${message}`,
    };
  }
}

export function watchMatugenTheme(
  themePath: string,
  onChange: () => void,
  debounceMs = 75,
  onError: (error: Error) => void = error => {
    console.error('Matugen theme watcher failed:', error);
  },
  watchDirectory: WatchDirectory = (directory, listener) => watch(directory, listener),
): () => void {
  const directory = path.dirname(themePath);
  const fileName = path.basename(themePath);
  mkdirSync(directory, { recursive: true });

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const watcher = watchDirectory(directory, (_eventType, changedFileName) => {
    if (changedFileName && changedFileName.toString() !== fileName) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onChange, debounceMs);
  });
  watcher.on('error', onError);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher.close();
  };
}

export function resolveMatugenThemePath(
  env: NodeJS.ProcessEnv = process.env,
  homeDirectory: string = homedir(),
): string {
  const override = env.BOEK_MATUGEN_THEME_FILE?.trim();
  if (override) return path.resolve(override);

  const configDirectory = env.XDG_CONFIG_HOME || path.join(homeDirectory, '.config');
  return path.join(configDirectory, 'boek', 'matugen-theme.json');
}
