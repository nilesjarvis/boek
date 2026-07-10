import { EventEmitter } from 'events';
import { mkdtemp, readFile, rename, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  loadMatugenTheme,
  parseMatugenTheme,
  resolveMatugenThemePath,
  watchMatugenTheme,
} from './matugenTheme';

const validTheme = {
  name: 'Matugen',
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

describe('parseMatugenTheme', () => {
  it('parses a complete Matugen theme', () => {
    expect(parseMatugenTheme(JSON.stringify(validTheme))).toEqual(validTheme);
  });

  it('rejects themes with missing color roles', () => {
    const incomplete = {
      ...validTheme,
      colors: { ...validTheme.colors, accentFg: undefined },
    };

    expect(() => parseMatugenTheme(JSON.stringify(incomplete))).toThrow(
      'missing required color "accentFg"',
    );
  });

  it('rejects non-hex color values', () => {
    const unsafe = {
      ...validTheme,
      colors: { ...validTheme.colors, bg: 'url(https://example.com)' },
    };

    expect(() => parseMatugenTheme(JSON.stringify(unsafe))).toThrow(
      'color "bg" must use #RRGGBB or #RRGGBBAA format',
    );
  });

  it('rejects themes without a usable name', () => {
    expect(() => parseMatugenTheme(JSON.stringify({ ...validTheme, name: '' }))).toThrow(
      'name must be a non-empty string',
    );
  });
});

describe('resolveMatugenThemePath', () => {
  it('uses the XDG config directory by default', () => {
    expect(
      resolveMatugenThemePath(
        { XDG_CONFIG_HOME: '/tmp/custom-config' },
        '/home/tester',
      ),
    ).toBe('/tmp/custom-config/boek/matugen-theme.json');
  });

  it('allows an explicit theme file override', () => {
    expect(
      resolveMatugenThemePath(
        {
          XDG_CONFIG_HOME: '/tmp/custom-config',
          BOEK_MATUGEN_THEME_FILE: '/srv/themes/boek.json',
        },
        '/home/tester',
      ),
    ).toBe('/srv/themes/boek.json');
  });
});

describe('loadMatugenTheme', () => {
  it('loads and validates a generated theme file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'boek-matugen-'));
    const themePath = path.join(directory, 'theme.json');

    try {
      await writeFile(themePath, JSON.stringify(validTheme), 'utf8');

      await expect(loadMatugenTheme(themePath)).resolves.toEqual({
        available: true,
        path: themePath,
        theme: validTheme,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reports a missing generated file without throwing', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'boek-matugen-'));
    const missingPath = path.join(directory, 'missing-theme.json');

    try {
      await expect(loadMatugenTheme(missingPath)).resolves.toEqual({
        available: false,
        path: missingPath,
        error: 'Matugen theme file not found',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reports an invalid generated file without throwing', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'boek-matugen-'));
    const themePath = path.join(directory, 'theme.json');

    try {
      await writeFile(themePath, '{not-json', 'utf8');

      const result = await loadMatugenTheme(themePath);
      expect(result.available).toBe(false);
      expect(result.path).toBe(themePath);
      expect(result.error).toMatch(/^Invalid Matugen theme:/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('watchMatugenTheme', () => {
  it('detects an atomic replacement of the generated file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'boek-matugen-'));
    const themePath = path.join(directory, 'matugen-theme.json');
    const replacementPath = path.join(directory, 'matugen-theme.tmp');
    let stopWatching: (() => void) | undefined;

    try {
      const changed = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for theme change')),
          1_000,
        );
        stopWatching = watchMatugenTheme(themePath, () => {
          clearTimeout(timeout);
          resolve();
        }, 10);
      });

      await writeFile(replacementPath, JSON.stringify(validTheme), 'utf8');
      await rename(replacementPath, themePath);
      await changed;
    } finally {
      stopWatching?.();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reports runtime watcher errors instead of leaving them unhandled', () => {
    const fakeWatcher = new EventEmitter() as EventEmitter & { close: () => void };
    const close = vi.fn();
    fakeWatcher.close = close;
    const onError = vi.fn();
    const watchDirectory = vi.fn(() => fakeWatcher);
    const watcherError = new Error('watch limit reached');

    const stopWatching = watchMatugenTheme(
      '/tmp/boek-matugen-test/theme.json',
      vi.fn(),
      75,
      onError,
      watchDirectory,
    );
    fakeWatcher.emit('error', watcherError);

    expect(onError).toHaveBeenCalledWith(watcherError);
    stopWatching();
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('bundled Matugen template', () => {
  it('generates a theme compatible with the Boek schema', async () => {
    const templatePath = path.join(process.cwd(), 'matugen', 'boek-theme.json');
    const template = await readFile(templatePath, 'utf8');
    const generated = template.replace(/\{\{[^}]+\}\}/g, '#123456');

    expect(parseMatugenTheme(generated).name).toBe('Matugen');
  });
});
