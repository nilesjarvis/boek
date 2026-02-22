import { Chapter } from '../services/api';
import { EnhancedChapter, AudioTrack } from './playerTypes';

export class ChapterUtils {
  /**
   * Enhance chapters with additional metadata
   */
  static enhanceChapters(
    chapters: Chapter[],
    currentTime: number,
    audioTracks?: AudioTrack[]
  ): EnhancedChapter[] {
    return chapters.map((chapter) => {
      const duration = chapter.end - chapter.start;
      const isActive = currentTime >= chapter.start && currentTime < chapter.end;
      const progress = isActive
        ? (currentTime - chapter.start) / duration
        : currentTime > chapter.end
        ? 1
        : 0;

      // Find which track this chapter belongs to (for multi-track books)
      let trackIndex: number | undefined;
      if (audioTracks && audioTracks.length > 1) {
        trackIndex = audioTracks.findIndex(
          track =>
            chapter.start >= track.startOffset &&
            chapter.start < track.startOffset + track.duration
        );
      }

      return {
        ...chapter,
        duration,
        progress: Math.max(0, Math.min(1, progress)),
        isCompleted: progress >= 0.95, // Consider 95% as completed
        trackIndex,
      };
    });
  }

  /**
   * Validate and clamp chapter seek time
   */
  static validateChapterSeek(chapter: Chapter, requestedTime?: number): number {
    // If no specific time requested, go to chapter start
    if (requestedTime === undefined) {
      return chapter.start;
    }

    // Clamp the time to chapter boundaries (with small buffer at end)
    const bufferTime = 0.1; // 100ms buffer before chapter end
    return Math.max(
      chapter.start,
      Math.min(chapter.end - bufferTime, requestedTime)
    );
  }

  /**
   * Find chapter at given time
   */
  static findChapterAtTime(chapters: Chapter[], time: number): Chapter | null {
    return chapters.find(ch => time >= ch.start && time < ch.end) || null;
  }

  /**
   * Get next/previous chapter
   */
  static getAdjacentChapter(
    chapters: Chapter[],
    currentTime: number,
    direction: 'next' | 'previous'
  ): Chapter | null {
    const currentChapter = this.findChapterAtTime(chapters, currentTime);
    if (!currentChapter) {
      // If not in any chapter, return first/last based on direction
      return direction === 'next' ? chapters[0] : chapters[chapters.length - 1];
    }

    const currentIndex = chapters.findIndex(ch => ch.id === currentChapter.id);
    const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    if (targetIndex >= 0 && targetIndex < chapters.length) {
      return chapters[targetIndex];
    }

    return null;
  }

  /**
   * Calculate total progress across all chapters
   */
  static calculateOverallProgress(enhancedChapters: EnhancedChapter[]): number {
    if (enhancedChapters.length === 0) return 0;

    const completedChapters = enhancedChapters.filter(ch => ch.isCompleted).length;
    const activeChapter = enhancedChapters.find(ch => ch.progress > 0 && ch.progress < 0.95);
    
    let totalProgress = completedChapters;
    if (activeChapter) {
      totalProgress += activeChapter.progress;
    }

    return totalProgress / enhancedChapters.length;
  }

  /**
   * Format chapter time for display
   */
  static formatChapterTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}