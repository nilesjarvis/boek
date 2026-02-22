import { AudioTrack } from './playerTypes';

export class AudioTrackManager {
  private tracks: AudioTrack[] = [];
  private serverUrl: string = '';
  private token: string = '';

  constructor(tracks: AudioTrack[], serverUrl: string, token: string) {
    this.tracks = tracks;
    this.serverUrl = serverUrl;
    this.token = token;
  }

  /**
   * Get track URL with authentication
   */
  getTrackUrl(trackIndex: number): string {
    const track = this.tracks[trackIndex];
    if (!track) {
      throw new Error(`Track ${trackIndex} not found`);
    }
    return `${this.serverUrl}${track.contentUrl}?token=${this.token}`;
  }

  /**
   * Convert track-relative time to global time
   */
  getGlobalTime(trackIndex: number, trackTime: number): number {
    if (trackIndex < 0 || trackIndex >= this.tracks.length) {
      console.error(`Invalid track index: ${trackIndex}`);
      return 0;
    }

    const track = this.tracks[trackIndex];
    return track.startOffset + trackTime;
  }

  /**
   * Find which track contains the given global time
   * Returns track index and track-relative time
   */
  findTrackForTime(globalTime: number): { trackIndex: number; trackTime: number } {
    // Handle edge cases
    if (globalTime <= 0) {
      return { trackIndex: 0, trackTime: 0 };
    }

    // Binary search for efficiency with large track counts
    let left = 0;
    let right = this.tracks.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const track = this.tracks[mid];
      const trackEnd = track.startOffset + track.duration;

      if (globalTime >= track.startOffset && globalTime < trackEnd) {
        return {
          trackIndex: mid,
          trackTime: globalTime - track.startOffset,
        };
      }

      if (globalTime < track.startOffset) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    // If time is beyond all tracks, return last track at end
    const lastTrack = this.tracks[this.tracks.length - 1];
    return {
      trackIndex: this.tracks.length - 1,
      trackTime: lastTrack.duration,
    };
  }

  /**
   * Get total duration across all tracks
   */
  getTotalDuration(): number {
    if (this.tracks.length === 0) return 0;
    const lastTrack = this.tracks[this.tracks.length - 1];
    return lastTrack.startOffset + lastTrack.duration;
  }

  /**
   * Check if we need to switch tracks for the given time
   */
  needsTrackSwitch(currentTrackIndex: number, globalTime: number): boolean {
    const { trackIndex } = this.findTrackForTime(globalTime);
    return trackIndex !== currentTrackIndex;
  }

  /**
   * Get next track index
   */
  getNextTrackIndex(currentIndex: number): number | null {
    if (currentIndex < this.tracks.length - 1) {
      return currentIndex + 1;
    }
    return null;
  }

  /**
   * Validate track index
   */
  isValidTrackIndex(index: number): boolean {
    return index >= 0 && index < this.tracks.length;
  }

  /**
   * Get track info
   */
  getTrack(index: number): AudioTrack | null {
    return this.tracks[index] || null;
  }

  /**
   * Get all tracks
   */
  getAllTracks(): AudioTrack[] {
    return [...this.tracks];
  }
}
