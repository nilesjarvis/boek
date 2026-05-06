import { describe, expect, it } from 'vitest';
import { ChapterUtils } from './chapterUtils';

describe('ChapterUtils', () => {
  it('enhances chapters without producing NaN progress for zero-length chapters', () => {
    const [chapter] = ChapterUtils.enhanceChapters(
      [{ id: 1, title: 'Intro', start: 10, end: 10 }],
      10
    );

    expect(chapter.duration).toBe(0);
    expect(chapter.progress).toBe(0);
    expect(chapter.isCompleted).toBe(false);
  });

  it('clamps requested chapter seeks inside chapter bounds', () => {
    const chapter = { id: 1, title: 'Chapter', start: 30, end: 40 };

    expect(ChapterUtils.validateChapterSeek(chapter, 25)).toBe(30);
    expect(ChapterUtils.validateChapterSeek(chapter, 35)).toBe(35);
    expect(ChapterUtils.validateChapterSeek(chapter, 45)).toBe(39.9);
  });

  it('never seeks before a zero-length chapter start', () => {
    const chapter = { id: 1, title: 'Marker', start: 30, end: 30 };

    expect(ChapterUtils.validateChapterSeek(chapter, 45)).toBe(30);
  });

  it('calculates chapter progress across completed and active chapters', () => {
    const chapters = ChapterUtils.enhanceChapters(
      [
        { id: 1, title: 'One', start: 0, end: 10 },
        { id: 2, title: 'Two', start: 10, end: 20 },
      ],
      15
    );

    expect(ChapterUtils.calculateOverallProgress(chapters)).toBe(0.75);
  });
});
