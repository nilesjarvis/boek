import type { AudioTrack } from './playerTypes';

export type RawAudioTrack = Partial<AudioTrack> & {
  id?: string;
  path?: string;
};

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normaliseServerUrl(serverUrl: string): string {
  return serverUrl.replace(/\/$/, '');
}

export function hasMultipleTracks(tracks: AudioTrack[]): boolean {
  return tracks.length > 1;
}

export function buildAuthenticatedTrackUrl(serverUrl: string, contentUrl: string, token: string): string {
  if (!contentUrl) {
    throw new Error('Track has no stream URL');
  }

  const rawUrl = contentUrl.startsWith('http')
    ? contentUrl
    : `${normaliseServerUrl(serverUrl)}${contentUrl.startsWith('/') ? '' : '/'}${contentUrl}`;
  const separator = rawUrl.includes('?') ? '&' : '?';
  return `${rawUrl}${separator}token=${encodeURIComponent(token)}`;
}

export function normalizeAudioTracks(rawTracks?: RawAudioTrack[] | null): AudioTrack[] {
  if (!Array.isArray(rawTracks)) return [];

  let nextOffset = 0;

  return rawTracks
    .map((track, position) => {
      const duration = Math.max(0, finiteNumber(track.duration));
      const startOffset =
        typeof track.startOffset === 'number' && Number.isFinite(track.startOffset)
          ? Math.max(0, track.startOffset)
          : nextOffset;

      nextOffset = startOffset + duration;

      return {
        index: typeof track.index === 'number' ? track.index : position,
        title: track.title || `Track ${position + 1}`,
        duration,
        startOffset,
        contentUrl: track.contentUrl || '',
      };
    })
    .filter(track => track.contentUrl.length > 0);
}

export function trackTimeToGlobal(
  tracks: AudioTrack[],
  trackIndex: number,
  trackTime: number
): number {
  const safeTrackTime = Math.max(0, finiteNumber(trackTime));
  const track = tracks[trackIndex];
  if (!track) return safeTrackTime;
  return track.startOffset + Math.min(track.duration, safeTrackTime);
}

export function findTrackForGlobalTime(
  tracks: AudioTrack[],
  globalTime: number
): { trackIndex: number; trackTime: number } {
  if (tracks.length === 0) {
    return { trackIndex: 0, trackTime: Math.max(0, finiteNumber(globalTime)) };
  }

  const safeGlobalTime = Math.max(0, finiteNumber(globalTime));
  let left = 0;
  let right = tracks.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const track = tracks[mid];
    const trackEnd = track.startOffset + track.duration;

    if (safeGlobalTime >= track.startOffset && safeGlobalTime < trackEnd) {
      return {
        trackIndex: mid,
        trackTime: safeGlobalTime - track.startOffset,
      };
    }

    if (safeGlobalTime < track.startOffset) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  if (left < tracks.length) {
    return { trackIndex: left, trackTime: 0 };
  }

  const lastTrackIndex = tracks.length - 1;
  return {
    trackIndex: lastTrackIndex,
    trackTime: tracks[lastTrackIndex].duration,
  };
}

export class AudioTrackManager {
  private tracks: AudioTrack[];
  private serverUrl: string;
  private token: string;

  constructor(tracks: AudioTrack[], serverUrl: string, token: string) {
    this.tracks = tracks;
    this.serverUrl = serverUrl;
    this.token = token;
  }

  getTrackUrl(trackIndex: number): string {
    const track = this.tracks[trackIndex];
    if (!track) {
      throw new Error(`Track ${trackIndex} not found`);
    }
    return buildAuthenticatedTrackUrl(this.serverUrl, track.contentUrl, this.token);
  }

  getGlobalTime(trackIndex: number, trackTime: number): number {
    return trackTimeToGlobal(this.tracks, trackIndex, trackTime);
  }

  findTrackForTime(globalTime: number): { trackIndex: number; trackTime: number } {
    return findTrackForGlobalTime(this.tracks, globalTime);
  }

  getTotalDuration(): number {
    if (this.tracks.length === 0) return 0;
    const lastTrack = this.tracks[this.tracks.length - 1];
    return lastTrack.startOffset + lastTrack.duration;
  }

  needsTrackSwitch(currentTrackIndex: number, globalTime: number): boolean {
    const { trackIndex } = this.findTrackForTime(globalTime);
    return trackIndex !== currentTrackIndex;
  }

  getNextTrackIndex(currentIndex: number): number | null {
    if (currentIndex < this.tracks.length - 1) {
      return currentIndex + 1;
    }
    return null;
  }

  isValidTrackIndex(index: number): boolean {
    return index >= 0 && index < this.tracks.length;
  }

  getTrack(index: number): AudioTrack | null {
    return this.tracks[index] || null;
  }

  getAllTracks(): AudioTrack[] {
    return [...this.tracks];
  }
}
