import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Library } from '../services/api';

const bookLibrary: Library = {
  id: 'books',
  name: 'Books',
  displayOrder: 0,
  icon: 'book',
  mediaType: 'book',
};

const podcastLibrary: Library = {
  id: 'podcasts',
  name: 'Podcasts',
  displayOrder: 1,
  icon: 'podcast',
  mediaType: 'podcast',
};

function createMemoryStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues));

  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  } satisfies Storage;
}

async function loadLibraryNavStore(initialValues: Record<string, string> = {}) {
  vi.resetModules();
  const storage = createMemoryStorage(initialValues);
  vi.stubGlobal('localStorage', storage);

  const { useLibraryNavStore } = await import('./libraryNavStore');

  return {
    storage,
    useLibraryNavStore,
  };
}

function persistedSelectedLibraryId(storage: Storage) {
  const persisted = storage.getItem('library-nav');
  if (!persisted) return null;

  return JSON.parse(persisted).state.selectedLibraryId as string | null;
}

describe('libraryNavStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores the saved library selection after libraries are fetched', async () => {
    const { useLibraryNavStore } = await loadLibraryNavStore({
      'library-nav': JSON.stringify({
        state: { selectedLibraryId: podcastLibrary.id },
        version: 0,
      }),
    });

    useLibraryNavStore.getState().setLibraries([bookLibrary, podcastLibrary]);

    expect(useLibraryNavStore.getState().selectedLib).toEqual(podcastLibrary);
    expect(useLibraryNavStore.getState().selectedLibraryId).toBe(podcastLibrary.id);
  });

  it('falls back to the first available library when the saved selection is missing', async () => {
    const { storage, useLibraryNavStore } = await loadLibraryNavStore({
      'library-nav': JSON.stringify({
        state: { selectedLibraryId: 'removed-library' },
        version: 0,
      }),
    });

    useLibraryNavStore.getState().setLibraries([bookLibrary, podcastLibrary]);

    expect(useLibraryNavStore.getState().selectedLib).toEqual(bookLibrary);
    expect(persistedSelectedLibraryId(storage)).toBe(bookLibrary.id);
  });

  it('persists a user-initiated library switch', async () => {
    const { storage, useLibraryNavStore } = await loadLibraryNavStore();

    useLibraryNavStore.getState().setLibraries([bookLibrary, podcastLibrary]);
    useLibraryNavStore.getState().setSelectedLib(podcastLibrary);

    expect(useLibraryNavStore.getState().selectedLib).toEqual(podcastLibrary);
    expect(persistedSelectedLibraryId(storage)).toBe(podcastLibrary.id);
  });
});
