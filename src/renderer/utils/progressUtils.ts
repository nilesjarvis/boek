import type { MediaProgress } from '../services/api';

export interface EpisodeProgressSnapshot {
  id: string;
  progress: number;
  isFinished: boolean;
  currentTime: number;
  duration: number;
  updatedAt: number;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampRatio(value: unknown): number {
  return Math.max(0, Math.min(1, finiteNumber(value)));
}

export function getProgressUpdatedAt(progress: MediaProgress): number {
  return finiteNumber(progress.lastUpdate, finiteNumber(progress.finishedAt, finiteNumber(progress.startedAt)));
}

function shouldReplaceProgress(existing: MediaProgress | undefined, candidate: MediaProgress): boolean {
  if (!existing) return true;

  const existingUpdatedAt = getProgressUpdatedAt(existing);
  const candidateUpdatedAt = getProgressUpdatedAt(candidate);

  if (candidateUpdatedAt !== existingUpdatedAt) {
    return candidateUpdatedAt > existingUpdatedAt;
  }

  if (candidate.isFinished !== existing.isFinished) {
    return candidate.isFinished;
  }

  return finiteNumber(candidate.currentTime) >= finiteNumber(existing.currentTime);
}

export function buildLatestProgressByItem(progressEntries: MediaProgress[]): Record<string, MediaProgress> {
  const progressByItem: Record<string, MediaProgress> = {};

  for (const entry of progressEntries) {
    if (!entry.libraryItemId || entry.episodeId) continue;

    if (shouldReplaceProgress(progressByItem[entry.libraryItemId], entry)) {
      progressByItem[entry.libraryItemId] = {
        ...entry,
        progress: clampRatio(entry.progress),
        currentTime: Math.max(0, finiteNumber(entry.currentTime)),
        duration: Math.max(0, finiteNumber(entry.duration)),
      };
    }
  }

  return progressByItem;
}

export function buildLatestProgressByEpisode(
  progressEntries: MediaProgress[]
): Record<string, EpisodeProgressSnapshot> {
  const progressByEpisode: Record<string, MediaProgress> = {};

  for (const entry of progressEntries) {
    if (!entry.episodeId) continue;

    if (shouldReplaceProgress(progressByEpisode[entry.episodeId], entry)) {
      progressByEpisode[entry.episodeId] = entry;
    }
  }

  return Object.fromEntries(
    Object.entries(progressByEpisode).map(([episodeId, entry]) => [
      episodeId,
      {
        id: episodeId,
        progress: clampRatio(entry.progress),
        isFinished: entry.isFinished || clampRatio(entry.progress) >= 0.995,
        currentTime: Math.max(0, finiteNumber(entry.currentTime)),
        duration: Math.max(0, finiteNumber(entry.duration)),
        updatedAt: getProgressUpdatedAt(entry),
      },
    ])
  );
}
