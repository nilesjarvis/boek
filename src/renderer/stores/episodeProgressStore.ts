import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface EpisodeProgressEntry {
  id: string;
  progress: number;
  isFinished: boolean;
  currentTime: number;
  duration: number;
  updatedAt: number;
}

interface EpisodeProgressState {
  progress: Record<string, EpisodeProgressEntry>;

  /** Get progress for a single episode, or null if not tracked. */
  getProgress: (episodeId: string) => EpisodeProgressEntry | null;

  /**
   * Update a single episode's progress.
   * Only applies the update if its updatedAt >= the stored value (staleness check).
   */
  updateProgress: (episodeId: string, entry: EpisodeProgressEntry) => void;

  /**
   * Merge a batch of progress entries into the store.
   * Each entry is only applied if its updatedAt >= the stored value.
   * Existing entries not in the batch are preserved.
   */
  mergeProgress: (entries: Record<string, EpisodeProgressEntry>) => void;

  /** Clear all stored progress (e.g. on logout). */
  clear: () => void;
}

export const useEpisodeProgressStore = create<EpisodeProgressState>()(
  persist(
    (set, get) => ({
      progress: {},

      getProgress: (episodeId: string) => {
        return get().progress[episodeId] ?? null;
      },

      updateProgress: (episodeId: string, entry: EpisodeProgressEntry) => {
        const existing = get().progress[episodeId];
        // Only apply if newer or equal (allow same-timestamp overwrites for idempotency)
        if (existing && existing.updatedAt > entry.updatedAt) {
          return;
        }
        set((state) => ({
          progress: {
            ...state.progress,
            [episodeId]: entry,
          },
        }));
      },

      mergeProgress: (entries: Record<string, EpisodeProgressEntry>) => {
        set((state) => {
          const merged = { ...state.progress };
          for (const [episodeId, entry] of Object.entries(entries)) {
            const existing = merged[episodeId];
            // Only apply if newer or equal
            if (!existing || existing.updatedAt <= entry.updatedAt) {
              merged[episodeId] = entry;
            }
          }
          return { progress: merged };
        });
      },

      clear: () => {
        set({ progress: {} });
      },
    }),
    {
      name: 'episode-progress',
    }
  )
);
