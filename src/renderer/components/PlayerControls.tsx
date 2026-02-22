import React, { useState, useRef, useEffect, useCallback } from 'react';
import './Player.css';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

interface PlayerControlsProps {
  isPlaying: boolean;
  isLoading: boolean;
  isBuffering: boolean;
  isSeeking: boolean;
  playbackRate: number;
  volume: number;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onSetSpeed: (speed: number) => void;
  onSetVolume: (volume: number) => void;
}

export const PlayerControls = React.memo(({
  isPlaying,
  isLoading,
  isBuffering,
  isSeeking,
  playbackRate,
  volume,
  onTogglePlay,
  onSkip,
  onSetSpeed,
  onSetVolume,
}: PlayerControlsProps) => {
  const showSpinner = isLoading || isBuffering || isSeeking;
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);

  // Close speed picker on outside click
  useEffect(() => {
    if (!showSpeedPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (speedRef.current && !speedRef.current.contains(e.target as Node)) {
        setShowSpeedPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSpeedPicker]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSetVolume(parseFloat(e.target.value));
  }, [onSetVolume]);

  const handleVolumeWheel = useCallback((e: React.WheelEvent) => {
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    onSetVolume(Math.max(0, Math.min(1, volume + delta)));
  }, [volume, onSetVolume]);

  const toggleMute = useCallback(() => {
    onSetVolume(volume > 0 ? 0 : 1);
  }, [volume, onSetVolume]);

  const volumeIcon = () => {
    if (volume === 0) {
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
        </svg>
      );
    }
    if (volume < 0.5) {
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
          <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
      </svg>
    );
  };

  return (
    <div className="full-player-controls">
      {/* Speed picker */}
      <div className="speed-picker-wrapper" ref={speedRef}>
        <button
          className="speed-button"
          onClick={() => setShowSpeedPicker(!showSpeedPicker)}
          title="Playback speed"
        >
          {playbackRate}x
        </button>
        {showSpeedPicker && (
          <div className="speed-picker">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                className={`speed-option ${speed === playbackRate ? 'active' : ''}`}
                onClick={() => {
                  onSetSpeed(speed);
                  setShowSpeedPicker(false);
                }}
              >
                {speed}x
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Skip back 10s */}
      <button className="skip-button" onClick={() => onSkip(-10)} title="Back 10 seconds" aria-label="Skip back 10 seconds">
        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
          <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
          <text x="12" y="15.5" textAnchor="middle" fontSize="7" fontWeight="700" fontFamily="sans-serif">10</text>
        </svg>
      </button>

      {/* Play / pause */}
      <button className="play-button" onClick={onTogglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
        {showSpinner ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width="36" height="36" className="spin">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity=".3"/>
            <path d="M12 2a10 10 0 0 0-2 19.82V20a8 8 0 1 1 0-16v-2A10 10 0 0 0 12 2z"/>
          </svg>
        ) : isPlaying ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width="36" height="36">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" width="36" height="36">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Skip forward 10s */}
      <button className="skip-button" onClick={() => onSkip(10)} title="Forward 10 seconds" aria-label="Skip forward 10 seconds">
        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
          <path d="M12.01 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
          <text x="12" y="15.5" textAnchor="middle" fontSize="7" fontWeight="700" fontFamily="sans-serif">10</text>
        </svg>
      </button>

      {/* Skip forward 30s */}
      <button className="skip-button" onClick={() => onSkip(30)} title="Forward 30 seconds" aria-label="Skip forward 30 seconds">
        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
          <path d="M12.01 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
          <text x="12" y="15.5" textAnchor="middle" fontSize="7" fontWeight="700" fontFamily="sans-serif">30</text>
        </svg>
      </button>

      {/* Volume */}
      <div className="volume-control" onWheel={handleVolumeWheel}>
        <button className="volume-button" onClick={toggleMute} title={volume === 0 ? 'Unmute' : 'Mute'}>
          {volumeIcon()}
        </button>
        <input
          type="range"
          className="volume-slider"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={handleVolumeChange}
          title={`Volume: ${Math.round(volume * 100)}%`}
        />
      </div>
    </div>
  );
});
