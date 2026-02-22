import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Chapter } from '../services/api';
import './Player.css';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  chapters?: Chapter[];
  onSeek: (time: number) => void;
  formatTime: (time: number) => string;
}

export const ProgressBar = React.memo(({
  currentTime,
  duration,
  chapters,
  onSeek,
  formatTime,
}: ProgressBarProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(currentTime);
  const [hoveredChapter, setHoveredChapter] = useState<Chapter | null>(null);
  const [tooltipPos, setTooltipPos] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) {
      setDragTime(currentTime);
    }
  }, [currentTime, isDragging]);

  const displayTime = isDragging ? dragTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;

  // Convert a mouse/touch X position to a time value
  const positionToTime = useCallback((clientX: number): number => {
    if (!trackRef.current || duration <= 0) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  // Pointer-based seeking on the custom track
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!trackRef.current) return;
    e.preventDefault();
    trackRef.current.setPointerCapture(e.pointerId);
    setIsDragging(true);
    const time = positionToTime(e.clientX);
    setDragTime(time);
  }, [positionToTime]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      const time = positionToTime(e.clientX);
      setDragTime(time);
    }
  }, [isDragging, positionToTime]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      trackRef.current?.releasePointerCapture(e.pointerId);
      setIsDragging(false);
      onSeek(dragTime);
    }
  }, [isDragging, dragTime, onSeek]);

  // Chapter hover detection
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!chapters || chapters.length === 0 || !trackRef.current || duration <= 0) {
      setHoveredChapter(null);
      return;
    }
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hoverTime = ratio * duration;
    setTooltipPos(ratio * 100);

    const ch = chapters.find(c => hoverTime >= c.start && hoverTime < c.end);
    setHoveredChapter(ch || null);
  }, [chapters, duration]);

  const handleMouseLeave = useCallback(() => {
    setHoveredChapter(null);
  }, []);

  const hasChapters = chapters && chapters.length > 0 && duration > 0;

  return (
    <div className="progress-bar-wrapper">
      {/* Tooltip */}
      {hoveredChapter && !isDragging && (
        <div
          className="progress-chapter-tooltip"
          style={{ left: `${tooltipPos}%` }}
        >
          {hoveredChapter.title}
        </div>
      )}

      {/* Custom seekable track */}
      <div
        ref={trackRef}
        className="progress-track"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        role="slider"
        aria-label="Seek slider"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={displayTime}
        tabIndex={0}
      >
        {/* Filled portion */}
        <div className="progress-track-fill" style={{ width: `${progress}%` }} />

        {/* Chapter separators */}
        {hasChapters && chapters.map((ch) => {
          // Don't render a marker at the very start (0%)
          if (ch.start <= 0) return null;
          const pct = (ch.start / duration) * 100;
          return (
            <div
              key={ch.id}
              className="progress-chapter-marker"
              style={{ left: `${pct}%` }}
            />
          );
        })}

        {/* Thumb */}
        <div className="progress-track-thumb" style={{ left: `${progress}%` }} />
      </div>

      {/* Time labels */}
      <div className="progress-times">
        <span>{formatTime(displayTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
});
