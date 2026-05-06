import { describe, expect, it } from 'vitest';
import {
  AudioTrackManager,
  buildAuthenticatedTrackUrl,
  findTrackForGlobalTime,
  normalizeAudioTracks,
  trackTimeToGlobal,
} from './audioTrackManager';
import type { AudioTrack } from './playerTypes';

const tracks: AudioTrack[] = [
  { index: 0, title: 'Part 1', duration: 10, startOffset: 0, contentUrl: '/a/1.mp3' },
  { index: 1, title: 'Part 2', duration: 20, startOffset: 10, contentUrl: '/a/2.mp3' },
  { index: 2, title: 'Part 3', duration: 30, startOffset: 30, contentUrl: '/a/3.mp3' },
];

describe('audioTrackManager', () => {
  it('normalizes missing start offsets from cumulative duration', () => {
    expect(
      normalizeAudioTracks([
        { index: 0, title: 'One', duration: 12, contentUrl: '/one.mp3' },
        { index: 1, title: 'Two', duration: 8, contentUrl: '/two.mp3' },
      ])
    ).toEqual([
      { index: 0, title: 'One', duration: 12, startOffset: 0, contentUrl: '/one.mp3' },
      { index: 1, title: 'Two', duration: 8, startOffset: 12, contentUrl: '/two.mp3' },
    ]);
  });

  it('finds the correct track at exact boundaries', () => {
    expect(findTrackForGlobalTime(tracks, 9.99)).toEqual({ trackIndex: 0, trackTime: 9.99 });
    expect(findTrackForGlobalTime(tracks, 10)).toEqual({ trackIndex: 1, trackTime: 0 });
    expect(findTrackForGlobalTime(tracks, 30)).toEqual({ trackIndex: 2, trackTime: 0 });
  });

  it('clamps empty and out-of-range lookups safely', () => {
    expect(findTrackForGlobalTime([], 42)).toEqual({ trackIndex: 0, trackTime: 42 });
    expect(findTrackForGlobalTime(tracks, -20)).toEqual({ trackIndex: 0, trackTime: 0 });
    expect(findTrackForGlobalTime(tracks, 99)).toEqual({ trackIndex: 2, trackTime: 30 });
  });

  it('converts track-relative time to clamped global time', () => {
    expect(trackTimeToGlobal(tracks, 1, 5)).toBe(15);
    expect(trackTimeToGlobal(tracks, 1, 99)).toBe(30);
    expect(trackTimeToGlobal(tracks, 99, 7)).toBe(7);
  });

  it('builds authenticated URLs without corrupting existing query strings', () => {
    expect(buildAuthenticatedTrackUrl('http://server/', '/stream.mp3', 'abc 123')).toBe(
      'http://server/stream.mp3?token=abc%20123'
    );
    expect(buildAuthenticatedTrackUrl('http://server', '/stream.mp3?download=1', 'abc')).toBe(
      'http://server/stream.mp3?download=1&token=abc'
    );
  });

  it('keeps class wrapper behavior consistent with the pure helpers', () => {
    const manager = new AudioTrackManager(tracks, 'http://server', 'token');

    expect(manager.findTrackForTime(14)).toEqual({ trackIndex: 1, trackTime: 4 });
    expect(manager.getGlobalTime(2, 2)).toBe(32);
    expect(manager.getTotalDuration()).toBe(60);
  });
});
