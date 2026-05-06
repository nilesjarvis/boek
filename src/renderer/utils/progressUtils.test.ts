import { describe, expect, it } from 'vitest';
import type { MediaProgress } from '../services/api';
import {
  buildLatestProgressByEpisode,
  buildLatestProgressByItem,
  getProgressUpdatedAt,
} from './progressUtils';

function progress(overrides: Partial<MediaProgress>): MediaProgress {
  return {
    id: overrides.id || 'progress-id',
    libraryItemId: overrides.libraryItemId || 'item-id',
    duration: overrides.duration ?? 100,
    progress: overrides.progress ?? 0,
    currentTime: overrides.currentTime ?? 0,
    isFinished: overrides.isFinished ?? false,
    ...overrides,
  };
}

describe('progressUtils', () => {
  it('uses lastUpdate as the freshness timestamp when available', () => {
    expect(
      getProgressUpdatedAt(
        progress({
          lastUpdate: 30,
          finishedAt: 20,
          startedAt: 10,
        })
      )
    ).toBe(30);
  });

  it('maps item progress without letting podcast episode progress overwrite book progress', () => {
    const byItem = buildLatestProgressByItem([
      progress({ libraryItemId: 'book-1', currentTime: 10, lastUpdate: 10 }),
      progress({ libraryItemId: 'podcast-1', episodeId: 'episode-1', currentTime: 90, lastUpdate: 20 }),
    ]);

    expect(Object.keys(byItem)).toEqual(['book-1']);
    expect(byItem['book-1'].currentTime).toBe(10);
  });

  it('keeps the newest item progress and clamps invalid ratios', () => {
    const byItem = buildLatestProgressByItem([
      progress({ libraryItemId: 'book-1', progress: 0.5, currentTime: 50, lastUpdate: 20 }),
      progress({ libraryItemId: 'book-1', progress: 4, currentTime: 120, lastUpdate: 30 }),
      progress({ libraryItemId: 'book-1', progress: 0.1, currentTime: 10, lastUpdate: 10 }),
    ]);

    expect(byItem['book-1'].progress).toBe(1);
    expect(byItem['book-1'].currentTime).toBe(120);
  });

  it('maps episode progress by episode id and keeps the freshest duplicate', () => {
    const byEpisode = buildLatestProgressByEpisode([
      progress({
        libraryItemId: 'podcast-1',
        episodeId: 'episode-1',
        progress: 0.2,
        currentTime: 20,
        lastUpdate: 20,
      }),
      progress({
        libraryItemId: 'podcast-1',
        episodeId: 'episode-1',
        progress: 0.6,
        currentTime: 60,
        lastUpdate: 30,
      }),
    ]);

    expect(byEpisode['episode-1']).toMatchObject({
      id: 'episode-1',
      progress: 0.6,
      currentTime: 60,
      updatedAt: 30,
    });
  });
});
