import React, { useMemo } from 'react';
import { EnhancedChapter } from '../utils/playerTypes';
import { ChapterUtils } from '../utils/chapterUtils';
import './Player.css';

interface ChapterListProps {
  chapters: EnhancedChapter[];
  currentTime: number;
  onSeekToChapter: (chapter: EnhancedChapter) => void;
}

export const ChapterList = React.memo(({
  chapters,
  currentTime,
  onSeekToChapter,
}: ChapterListProps) => {
  const activeChapterId = useMemo(() => {
    const activeChapter = chapters.find(
      ch => currentTime >= ch.start && currentTime < ch.end
    );
    return activeChapter?.id;
  }, [chapters, currentTime]);

  if (chapters.length === 0) {
    return null;
  }

  return (
    <div className="chapters-list">
      <h3>Chapters</h3>
      {chapters.map((chapter) => (
        <button
          key={chapter.id}
          className={`chapter-item ${chapter.id === activeChapterId ? 'active' : ''}`}
          onClick={() => onSeekToChapter(chapter)}
          aria-label={`Go to chapter: ${chapter.title}`}
        >
          <span className="chapter-time">
            {ChapterUtils.formatChapterTime(chapter.start)}
          </span>
          <span className="chapter-title">{chapter.title}</span>
          <span className="chapter-duration">
            ({ChapterUtils.formatChapterTime(chapter.duration)})
          </span>
          {chapter.progress > 0 && (
            <div 
              className="chapter-progress-bar" 
              style={{ width: `${chapter.progress * 100}%` }}
              aria-label={`Progress: ${Math.round(chapter.progress * 100)}%`}
            />
          )}
        </button>
      ))}
    </div>
  );
});