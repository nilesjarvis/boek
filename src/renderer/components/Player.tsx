import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { absApi } from '../services/api';
import Hls from 'hls.js';
import { PlayerControls } from './PlayerControls';
import { ChapterList } from './ChapterList';
import { ProgressBar } from './ProgressBar';
import { ChapterUtils } from '../utils/chapterUtils';
import { AudioTrack } from '../utils/playerTypes';
import './Player.css';

// Helper: given a global time and an array of tracks, find the track index and track-relative time.
// Uses a linear scan (fine for typical audiobook track counts of <100).
function findTrackForGlobalTime(
  tracks: AudioTrack[],
  globalTime: number
): { trackIndex: number; trackTime: number } {
  if (tracks.length === 0) return { trackIndex: 0, trackTime: globalTime };

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const trackEnd = track.startOffset + track.duration;
    if (globalTime >= track.startOffset && globalTime < trackEnd) {
      return { trackIndex: i, trackTime: globalTime - track.startOffset };
    }
  }

  // Past the end -- clamp to end of last track
  const last = tracks[tracks.length - 1];
  return { trackIndex: tracks.length - 1, trackTime: last.duration };
}

// Helper: convert track-relative time to global time
function trackTimeToGlobal(tracks: AudioTrack[], trackIndex: number, trackTime: number): number {
  if (!tracks.length || trackIndex < 0 || trackIndex >= tracks.length) return trackTime;
  return tracks[trackIndex].startOffset + trackTime;
}

// Helper: is this a multi-track (multi-file) book?
function isMultiTrack(tracks: AudioTrack[]): boolean {
  return tracks.length > 1;
}

export default function Player() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sessionRef = useRef<{ id: string; lastSync: number } | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  // Ref to track previous session context for clean sync on item switch (Fix #1/#7)
  // Includes audioTracks + currentTrackIndex so the sync can compute global time
  // even after setCurrentItem resets the store (root cause of multi-track regression)
  const prevSessionRef = useRef<{
    itemId: string;
    sessionId: string;
    episodeId?: string;
    lastSync: number;
    audioTracks: AudioTrack[];
    currentTrackIndex: number;
  } | null>(null);
  // Generation counter to invalidate stale event listeners on rapid item switches (Fix #8)
  const loadGenerationRef = useRef(0);
  // Ref to track whether we're in a track transition to guard sync (Fix #2)
  const isTransitioningTrackRef = useRef(false);
  const {
    currentItem,
    currentEpisode,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    chapters,
    audioTracks,
    currentTrackIndex,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setPlaybackRate,
    setVolume,
    setSessionId,
    setLastSyncTime,
    setChapters,
    setAudioTracks,
    setCurrentTrackIndex,
  } = usePlayerStore();
  const { user, serverUrl } = useAuthStore();
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showMiniSpeed, setShowMiniSpeed] = useState(false);
  const miniSpeedRef = useRef<HTMLDivElement>(null);

  // ----- Derived state: enhanced chapters with progress and track mapping -----
  const enhancedChapters = useMemo(
    () => ChapterUtils.enhanceChapters(chapters, currentTime, audioTracks as AudioTrack[]),
    [chapters, currentTime, audioTracks]
  );

  // Current chapter (for display in mini-player and full-player)
  const currentChapter = useMemo(
    () => ChapterUtils.findChapterAtTime(chapters, currentTime),
    [chapters, currentTime]
  );

  // ----- Helper: get the current global time from the audio element -----
  // During track transitions, falls back to the store's currentTime to avoid
  // computing a stale global time from a not-yet-loaded audio element (Fix #2).
  const getGlobalTimeFromAudio = useCallback((): number => {
    if (!audioRef.current) return 0;
    if (isTransitioningTrackRef.current) {
      return usePlayerStore.getState().currentTime;
    }
    const trackTime = audioRef.current.currentTime;
    if (isMultiTrack(audioTracks as AudioTrack[])) {
      return trackTimeToGlobal(audioTracks as AudioTrack[], currentTrackIndex, trackTime);
    }
    return trackTime;
  }, [audioTracks, currentTrackIndex]);

  // ----- Debounced sync function -----
  const syncProgress = useCallback((immediate = false) => {
    if (!sessionRef.current || !audioRef.current || !currentItem) return;
    
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    const doSync = async () => {
      if (!sessionRef.current || !audioRef.current) return;
      
      const now = Date.now();
      const timeListened = (now - sessionRef.current.lastSync) / 1000;
      
      try {
        const syncTime = getGlobalTimeFromAudio();
        
        await absApi.updateProgress(currentItem.id, sessionRef.current.id, {
          currentTime: syncTime,
          timeListened,
          ...(currentEpisode && { episodeId: currentEpisode.id }),
        });
        sessionRef.current.lastSync = now;
        if (prevSessionRef.current) prevSessionRef.current.lastSync = now;
        setLastSyncTime(now);
      } catch (err) {
        console.error('Failed to sync progress:', err);
      }
    };
    
    if (immediate) {
      doSync();
    } else {
      syncTimeoutRef.current = setTimeout(doSync, 2000);
    }
  }, [currentItem, currentEpisode, setLastSyncTime, getGlobalTimeFromAudio]);

  // ----- Track loading: load a specific audio file by index -----
  const loadAudioTrackInternal = async (trackIndex: number, seekToTime?: number, tracks?: AudioTrack[]) => {
    const tracksToUse = tracks || (audioTracks as AudioTrack[]);
    if (!tracksToUse || tracksToUse.length === 0 || !audioRef.current) return;
    
    const track = tracksToUse[trackIndex];
    if (!track) return;

    // Mark transition start to guard sync (Fix #2)
    isTransitioningTrackRef.current = true;
    
    const { serverUrl: srv, user: u } = useAuthStore.getState();
    const trackUrl = `${srv}${track.contentUrl}?token=${u?.token}`;
    
    // Clean up any existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    // Update current track index in store and prevSessionRef
    setCurrentTrackIndex(trackIndex);
    if (prevSessionRef.current) {
      prevSessionRef.current.currentTrackIndex = trackIndex;
    }
    
    // Pause before changing source to avoid interruption errors
    audioRef.current.pause();
    
    // Load the new track
    audioRef.current.src = trackUrl;
    audioRef.current.load();
    
    // If we need to seek to a specific time within this track
    if (seekToTime !== undefined && seekToTime >= 0) {
      const handleMeta = () => {
        if (audioRef.current) {
          audioRef.current.currentTime = seekToTime;
          audioRef.current.removeEventListener('loadedmetadata', handleMeta);
        }
      };
      audioRef.current.addEventListener('loadedmetadata', handleMeta);
    }
    
    // Restore playback rate on new track
    const { playbackRate: rate } = usePlayerStore.getState();
    audioRef.current.playbackRate = rate;
    
    // Wait for audio to be ready then play if needed
    return new Promise<void>((resolve) => {
      const handleCanPlay = () => {
        if (audioRef.current) {
          audioRef.current.removeEventListener('canplay', handleCanPlay);
          const { isPlaying: playing } = usePlayerStore.getState();
          if (playing) {
            audioRef.current.play().catch(console.error);
          }
        }
        // Mark transition complete (Fix #2)
        isTransitioningTrackRef.current = false;
        resolve();
      };
      audioRef.current?.addEventListener('canplay', handleCanPlay);
    });
  };

  // ============================================================
  // CENTRAL SEEK FUNCTION -- all navigation paths go through here
  // ============================================================
  const seekToGlobalTime = useCallback(async (globalTime: number) => {
    if (!audioRef.current) return;
    
    // Clamp to valid range
    const clampedTime = Math.max(0, Math.min(duration, globalTime));
    
    const tracks = audioTracks as AudioTrack[];
    
    if (isMultiTrack(tracks)) {
      // Multi-track: find the correct track and track-relative time
      const { trackIndex, trackTime } = findTrackForGlobalTime(tracks, clampedTime);
      
      if (trackIndex !== currentTrackIndex) {
        // Need to switch to a different audio file
        setIsSeeking(true);
        await loadAudioTrackInternal(trackIndex, trackTime, tracks);
        setIsSeeking(false);
      } else {
        // Same track, just seek within it
        audioRef.current.currentTime = trackTime;
      }
    } else {
      // Single track / HLS: seek directly
      audioRef.current.currentTime = clampedTime;
    }
    
    setCurrentTime(clampedTime);
  }, [duration, audioTracks, currentTrackIndex, setCurrentTime]);

  // ----- Chapter-aware seek: jump to a chapter's start time -----
  const seekToChapter = useCallback((chapter: { start: number }) => {
    seekToGlobalTime(chapter.start);
  }, [seekToGlobalTime]);

  // ----- Next / previous chapter navigation -----
  const seekToAdjacentChapter = useCallback((direction: 'next' | 'previous') => {
    if (chapters.length === 0) return;
    const target = ChapterUtils.getAdjacentChapter(chapters, currentTime, direction);
    if (target) {
      seekToGlobalTime(target.start);
    }
  }, [chapters, currentTime, seekToGlobalTime]);

  // ----- Load track (initial load when item changes) -----
  const loadTrack = useCallback(async () => {
    if (!currentItem || !user || !serverUrl) return;
    
    // Sync and close previous session using the PREVIOUS context (Fix #1)
    // prevSessionRef holds the correct itemId/episodeId/audioTracks from before
    // setCurrentItem reset the store -- this is critical for multi-track books
    if (prevSessionRef.current && audioRef.current) {
      const prev = prevSessionRef.current;
      let syncTime = audioRef.current.currentTime;
      if (isMultiTrack(prev.audioTracks)) {
        syncTime = trackTimeToGlobal(prev.audioTracks, prev.currentTrackIndex, audioRef.current.currentTime);
      }
      const timeListened = (Date.now() - prev.lastSync) / 1000;
      await absApi.updateProgress(prev.itemId, prev.sessionId, {
        currentTime: syncTime,
        timeListened,
        ...(prev.episodeId && { episodeId: prev.episodeId }),
      }).catch(console.error);
      prevSessionRef.current = null;
    }
    
    setError(null);
    setIsLoading(true);
    // Increment generation to invalidate any stale event listeners (Fix #8)
    const generation = ++loadGenerationRef.current;
    try {
      const { streamUrl, sessionId: newSessionId, currentTime: initialTime, duration: totalDuration, chapters: chs, audioTracks: tracks } = await absApi.getStreamUrl(
        currentItem.id,
        currentEpisode?.id
      );
      setSessionId(newSessionId);
      const now = Date.now();
      setLastSyncTime(now);
      sessionRef.current = { id: newSessionId, lastSync: now };
      // Track session context so we can sync correctly on item switch (Fix #1/#7)
      // Store audioTracks so the sync can compute global time even after store reset
      prevSessionRef.current = {
        itemId: currentItem.id,
        sessionId: newSessionId,
        episodeId: currentEpisode?.id,
        lastSync: now,
        audioTracks: (tracks || []) as AudioTrack[],
        currentTrackIndex: 0,
      };
      setDuration(totalDuration || 0);
      setChapters(chs || []);
      setAudioTracks(tracks || []);
      
      if (audioRef.current) {
        // Check if we have multiple audio tracks (multi-file book)
         if (tracks && tracks.length > 1 && !currentEpisode) {
          const seekTime = initialTime ?? 0;
          const { trackIndex, trackTime } = findTrackForGlobalTime(tracks as AudioTrack[], seekTime);
          await loadAudioTrackInternal(trackIndex, trackTime, tracks as AudioTrack[]);
          setCurrentTime(seekTime);
          setIsLoading(false);
          return;
        } else {
          // Single track or HLS stream
          // Clean up any existing HLS instance
          if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
          }
          
          // Check if this is an HLS stream
          if (streamUrl.includes('.m3u8')) {
            if (Hls.isSupported()) {
              const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                maxBufferLength: 600,
                maxMaxBufferLength: 1200,
                maxBufferSize: 60 * 1000 * 1000,
                maxBufferHole: 0.5,
                startLevel: -1,
                fragLoadingTimeOut: 20000,
                fragLoadingMaxRetry: 6,
              });
              
              hlsRef.current = hls;
              
              hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS error:', event, data);
                if (data.fatal) {
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      console.error('Fatal network error, trying to recover');
                      hls.startLoad();
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      console.error('Fatal media error, trying to recover');
                      hls.recoverMediaError();
                      break;
                    default:
                      console.error('Unrecoverable error');
                      setError('Failed to load audio stream');
                      hls.destroy();
                      break;
                  }
                }
              });
              
              hls.loadSource(streamUrl);
              hls.attachMedia(audioRef.current);
              
            } else if (audioRef.current.canPlayType('application/vnd.apple.mpegurl')) {
              audioRef.current.src = streamUrl;
            } else {
              console.error('HLS is not supported in this browser');
              setError('Your browser does not support HLS streaming');
              setIsLoading(false);
              return;
            }
          } else {
            // Regular audio file
            audioRef.current.src = streamUrl;
          }
          
          audioRef.current.playbackRate = playbackRate;
          
          const handleLoadError = (e: Event) => {
            // Ignore if a newer load has started (Fix #8)
            if (loadGenerationRef.current !== generation) return;
            console.error('Failed to load audio stream:', e);
            setError('Failed to load audio file');
            setIsLoading(false);
          };
          
          audioRef.current.addEventListener('error', handleLoadError, { once: true });
          
          // Set initial time if resuming playback (Fix #5: use nullish check, not truthiness)
          if (initialTime != null && initialTime > 0) {
            const handleLoadedMetadata = () => {
              // Ignore if a newer load has started (Fix #8)
              if (loadGenerationRef.current !== generation) return;
              if (audioRef.current) {
                audioRef.current.currentTime = initialTime;
                setCurrentTime(initialTime);
              }
            };
            
            audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
          } else {
            // Starting from the beginning -- ensure store is consistent
            setCurrentTime(0);
          }
          
          setIsLoading(false);
          
          const handleCanPlayThrough = () => {
            // Ignore if a newer load has started (Fix #8)
            if (loadGenerationRef.current !== generation) return;
            if (isPlaying && audioRef.current) {
              audioRef.current.play().catch((err) => {
                console.error('Failed to start playback:', err);
                setIsPlaying(false);
              });
            }
          };
          
          audioRef.current.addEventListener('canplaythrough', handleCanPlayThrough, { once: true });
        }
      }
    } catch (err) {
      console.error('Failed to load track:', err);
      setError('Failed to load audio');
      setIsPlaying(false);
      setIsLoading(false);
    }
  }, [currentItem, currentEpisode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentItem) {
      loadTrack();
    }
  }, [currentItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      // Final sync before unmount -- use prevSessionRef for correct context (Fix #7)
      // Use prevSessionRef track data so multi-track conversion is correct
      // even if the store has already been reset by setCurrentItem
      if (sessionRef.current && audioRef.current && audioRef.current.currentTime > 0) {
        const prev = prevSessionRef.current;
        const tracks = prev?.audioTracks || usePlayerStore.getState().audioTracks as AudioTrack[];
        const idx = prev?.currentTrackIndex ?? usePlayerStore.getState().currentTrackIndex;
        let syncTime = audioRef.current.currentTime;
        if (isMultiTrack(tracks)) {
          syncTime = trackTimeToGlobal(tracks, idx, audioRef.current.currentTime);
        }
        const timeListened = (Date.now() - sessionRef.current.lastSync) / 1000;
        absApi.updateProgress(prev?.itemId || currentItem?.id || '', sessionRef.current.id, {
          currentTime: syncTime,
          timeListened,
          ...(prev?.episodeId && { episodeId: prev.episodeId }),
        }).catch(console.error);
      }
    };
  }, [currentItem]);

  // Play / pause effect
  useEffect(() => {
    if (!audioRef.current) return;
    
    const audio = audioRef.current;
    
    const handlePlayPause = async () => {
      if (audio.readyState < 3) return;
      
      if (isPlaying && audio.paused) {
        try {
          await audio.play();
        } catch (err) {
          console.error('Failed to play:', err);
          setIsPlaying(false);
        }
      } else if (!isPlaying && !audio.paused) {
        audio.pause();
        // Sync on pause
        if (sessionRef.current && audio.currentTime > 0) {
          const now = Date.now();
          const timeListened = (now - sessionRef.current.lastSync) / 1000;
          
          const tracks = audioTracks as AudioTrack[];
          let syncTime = audio.currentTime;
          if (isMultiTrack(tracks) && currentTrackIndex >= 0) {
            syncTime = trackTimeToGlobal(tracks, currentTrackIndex, audio.currentTime);
          }
          
          absApi.updateProgress(currentItem?.id || '', sessionRef.current.id, {
            currentTime: syncTime,
            timeListened,
            ...(currentEpisode && { episodeId: currentEpisode.id }),
          }).catch(console.error);
          sessionRef.current.lastSync = now;
          if (prevSessionRef.current) prevSessionRef.current.lastSync = now;
          setLastSyncTime(now);
        }
      }
    };
    
    handlePlayPause();
    
    const handleCanPlay = () => {
      if (isPlaying) {
        handlePlayPause();
      }
    };
    
    audio.addEventListener('canplay', handleCanPlay);
    
    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [isPlaying, currentItem, currentEpisode, setLastSyncTime, audioTracks, currentTrackIndex]);

  // ----- Audio event handlers -----

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      const globalTime = getGlobalTimeFromAudio();
      setCurrentTime(globalTime);
    }
  }, [setCurrentTime, getGlobalTimeFromAudio]);

  // BUG FIX: Don't overwrite total book duration with individual track duration
  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      const tracks = audioTracks as AudioTrack[];
      // Only set duration from audio element for single-track books.
      // For multi-track books, the total duration was already set from the API response.
      if (!isMultiTrack(tracks)) {
        setDuration(audioRef.current.duration);
      }
    }
  }, [setDuration, audioTracks]);

  // BUG FIX: handleEnded reads fresh state instead of using stale loadAudioTrack closure
  const handleEnded = useCallback(async () => {
    const { audioTracks: tracks, currentTrackIndex: idx } = usePlayerStore.getState();
    if (tracks && tracks.length > 1 && idx < tracks.length - 1) {
      // Sync progress at end of current track before switching (Fix #3)
      if (sessionRef.current && prevSessionRef.current) {
        const endOfTrack = (tracks[idx] as AudioTrack).startOffset + (tracks[idx] as AudioTrack).duration;
        const now = Date.now();
        const timeListened = (now - sessionRef.current.lastSync) / 1000;
        absApi.updateProgress(prevSessionRef.current.itemId, sessionRef.current.id, {
          currentTime: endOfTrack,
          timeListened,
          ...(prevSessionRef.current.episodeId && { episodeId: prevSessionRef.current.episodeId }),
        }).catch(console.error);
        sessionRef.current.lastSync = now;
        if (prevSessionRef.current) prevSessionRef.current.lastSync = now;
      }
      await loadAudioTrackInternal(idx + 1, 0, tracks as AudioTrack[]);
    } else {
      setIsPlaying(false);
    }
  }, [setIsPlaying]);

  const handleError = useCallback(() => {
    setError('Playback error');
    setIsPlaying(false);
    setIsLoading(false);
  }, [setIsPlaying]);
  
  const handleWaiting = useCallback(() => {
    setIsBuffering(true);
  }, []);
  
  const handleCanPlayCb = useCallback(() => {
    setIsBuffering(false);
    if (error?.includes('chapter') || error?.includes('position')) {
      setError(null);
    }
  }, [error]);

  // BUG FIX: onSeeked must convert track-relative time to global time
  const handleSeeked = useCallback(() => {
    if (audioRef.current) {
      const globalTime = getGlobalTimeFromAudio();
      setCurrentTime(globalTime);
    }
    setIsSeeking(false);
    setIsBuffering(false);
  }, [setCurrentTime, getGlobalTimeFromAudio]);

  const handleSeeking = useCallback(() => {
    setIsSeeking(true);
    setIsBuffering(true);
  }, []);

  // Playback rate sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Close mini speed picker on outside click
  useEffect(() => {
    if (!showMiniSpeed) return;
    const handleClick = (e: MouseEvent) => {
      if (miniSpeedRef.current && !miniSpeedRef.current.contains(e.target as Node)) {
        setShowMiniSpeed(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMiniSpeed]);

  // Volume sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Periodic progress sync
  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlaying && currentItem && sessionRef.current && audioRef.current && audioRef.current.currentTime > 0) {
        syncProgress(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, currentItem, syncProgress]);

  // ----- User-facing actions -----

  const togglePlay = () => setIsPlaying(!isPlaying);

  // Seek from progress bar / slider (receives global time)
  const handleProgressSeek = useCallback((time: number) => {
    seekToGlobalTime(time);
  }, [seekToGlobalTime]);

  const skip = useCallback(async (seconds: number) => {
    const target = currentTime + seconds;
    seekToGlobalTime(target);
  }, [currentTime, seekToGlobalTime]);

  const cycleSpeed = () => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    const idx = speeds.indexOf(playbackRate);
    const nextIndex = (idx + 1) % speeds.length;
    setPlaybackRate(speeds[nextIndex]);
  };

  const handleSetVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, [setVolume]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(e.shiftKey ? -30 : -10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(e.shiftKey ? 30 : 10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleSetVolume(volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleSetVolume(volume - 0.1);
          break;
        case 'm':
          e.preventDefault();
          handleSetVolume(volume > 0 ? 0 : 1);
          break;
        case 'f':
          e.preventDefault();
          setShowFullPlayer(prev => !prev);
          break;
        case 'x':
          e.preventDefault();
          cycleSpeed();
          break;
        // Home / 0: go to start (multi-track aware)
        case '0':
        case 'Home':
          e.preventDefault();
          seekToGlobalTime(0);
          break;
        // End: go to end (multi-track aware)
        case 'End':
          e.preventDefault();
          if (duration > 0) {
            seekToGlobalTime(duration);
          }
          break;
        // Next / previous chapter
        case ']':
          e.preventDefault();
          seekToAdjacentChapter('next');
          break;
        case '[':
          e.preventDefault();
          seekToAdjacentChapter('previous');
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skip, cycleSpeed, duration, volume, handleSetVolume, seekToGlobalTime, seekToAdjacentChapter]);

  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600);
    const mins = Math.floor((time % 3600) / 60);
    const secs = Math.floor(time % 60);
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentItem) return null;

  return (
    <>
      <div
        className={`mini-player ${isPlaying ? 'is-playing' : ''}`}
        style={{ '--gradient-pos': `${duration > 0 ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties}
        onClick={() => setShowFullPlayer(true)}
      >
        <div className="mini-player-cover">
          {currentItem.coverUrl ? (
            <img src={currentItem.coverUrl} alt={currentItem.title} />
          ) : (
            <div className="cover-placeholder" />
          )}
        </div>
        <div className="mini-player-info">
          <span className="mini-player-title">{currentItem.title}</span>
          {currentChapter ? (
            <span className="mini-player-chapter">{currentChapter.title}</span>
          ) : currentItem.author ? (
            <span className="mini-player-author">{currentItem.author}</span>
          ) : null}
          {error && <span className="player-error">{error}</span>}
        </div>
        <button className="mini-player-play" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
          {isLoading || isBuffering || isSeeking ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" className="spin">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity=".3"/>
              <path d="M12 2a10 10 0 0 0-2 19.82V20a8 8 0 1 1 0-16v-2A10 10 0 0 0 12 2z"/>
            </svg>
          ) : isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="mini-speed-wrapper" ref={miniSpeedRef}>
          <button
            className="mini-speed-button"
            onClick={(e) => { e.stopPropagation(); setShowMiniSpeed(!showMiniSpeed); }}
            title="Playback speed"
          >
            {playbackRate}x
          </button>
          {showMiniSpeed && (
            <div className="speed-picker speed-picker-up">
              {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((speed) => (
                <button
                  key={speed}
                  className={`speed-option ${speed === playbackRate ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPlaybackRate(speed);
                    setShowMiniSpeed(false);
                  }}
                >
                  {speed}x
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mini-volume-control" onClick={(e) => e.stopPropagation()} onWheel={(e) => { e.stopPropagation(); handleSetVolume(volume + (e.deltaY < 0 ? 0.05 : -0.05)); }}>
          <button
            className="mini-volume-button"
            onClick={() => handleSetVolume(volume > 0 ? 0 : 1)}
            title={volume === 0 ? 'Unmute' : 'Mute'}
          >
            {volume === 0 ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            ) : volume < 0.5 ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            )}
          </button>
          <input
            type="range"
            className="mini-volume-slider"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => handleSetVolume(parseFloat(e.target.value))}
            title={`Volume: ${Math.round(volume * 100)}%`}
          />
        </div>
        <button 
          className="shortcuts-button" 
          onClick={(e) => { e.stopPropagation(); setShowShortcuts(!showShortcuts); }}
          title="Keyboard shortcuts"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/>
          </svg>
        </button>
        <div className="mini-player-progress">
          <div
            className="mini-player-progress-fill"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
          {chapters.length > 0 && duration > 0 && chapters.map((ch) => {
            if (ch.start <= 0) return null;
            return (
              <div
                key={ch.id}
                className="mini-player-chapter-marker"
                style={{ left: `${(ch.start / duration) * 100}%` }}
              />
            );
          })}
        </div>
      </div>
      
      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Keyboard Shortcuts</h3>
            <div className="shortcuts-list">
              <div className="shortcut-item">
                <kbd>Space</kbd> or <kbd>K</kbd> <span>Play/Pause</span>
              </div>
              <div className="shortcut-item">
                <kbd>&larr;</kbd> <span>Rewind 10s</span>
              </div>
              <div className="shortcut-item">
                <kbd>&rarr;</kbd> <span>Forward 10s</span>
              </div>
              <div className="shortcut-item">
                <kbd>Shift</kbd> + <kbd>&larr;/&rarr;</kbd> <span>Skip 30s</span>
              </div>
              <div className="shortcut-item">
                <kbd>&uarr;</kbd> <span>Volume up</span>
              </div>
              <div className="shortcut-item">
                <kbd>&darr;</kbd> <span>Volume down</span>
              </div>
              <div className="shortcut-item">
                <kbd>M</kbd> <span>Mute/Unmute</span>
              </div>
              <div className="shortcut-item">
                <kbd>F</kbd> <span>Full player</span>
              </div>
              <div className="shortcut-item">
                <kbd>X</kbd> <span>Change speed</span>
              </div>
              <div className="shortcut-item">
                <kbd>0</kbd> or <kbd>Home</kbd> <span>Go to start</span>
              </div>
              <div className="shortcut-item">
                <kbd>End</kbd> <span>Go to end</span>
              </div>
              <div className="shortcut-item">
                <kbd>[</kbd> <span>Previous chapter</span>
              </div>
              <div className="shortcut-item">
                <kbd>]</kbd> <span>Next chapter</span>
              </div>
              <div className="shortcut-item shortcut-divider" />
              <div className="shortcut-item">
                <kbd>B</kbd> <span>Go to Books</span>
              </div>
              <div className="shortcut-item">
                <kbd>P</kbd> <span>Go to Podcasts</span>
              </div>
              <div className="shortcut-item">
                <kbd>S</kbd> <span>Search</span>
              </div>
            </div>
            <button className="close-shortcuts" onClick={() => setShowShortcuts(false)}>Close</button>
          </div>
        </div>
      )}

      {showFullPlayer && (
        <div className="full-player-overlay" onClick={() => setShowFullPlayer(false)}>
          <div className="full-player" onClick={(e) => e.stopPropagation()}>
            <button className="close-player" onClick={() => setShowFullPlayer(false)}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>

            <div className="full-player-cover">
              {currentItem.coverUrl ? (
                <img src={currentItem.coverUrl} alt={currentItem.title} />
              ) : (
                <div className="cover-placeholder-large" />
              )}
            </div>

            <div className="full-player-info">
              <h2>{currentItem.title}</h2>
              {currentItem.author && <p>{currentItem.author}</p>}
              {currentChapter && (
                <p className="full-player-chapter">{currentChapter.title}</p>
              )}
            </div>

            <ProgressBar
              currentTime={currentTime}
              duration={duration}
              chapters={chapters.length > 0 ? chapters : undefined}
              onSeek={handleProgressSeek}
              formatTime={formatTime}
            />

            {enhancedChapters.length > 0 && (
              <>
                {chapters.length > 0 && (
                  <div className="chapter-nav-buttons">
                    <button
                      className="chapter-nav-button"
                      onClick={() => seekToAdjacentChapter('previous')}
                      aria-label="Previous chapter"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                      </svg>
                      <span>Prev Chapter</span>
                    </button>
                    <button
                      className="chapter-nav-button"
                      onClick={() => seekToAdjacentChapter('next')}
                      aria-label="Next chapter"
                    >
                      <span>Next Chapter</span>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                      </svg>
                    </button>
                  </div>
                )}
                <ChapterList
                  chapters={enhancedChapters}
                  currentTime={currentTime}
                  onSeekToChapter={seekToChapter}
                />
              </>
            )}

            <PlayerControls
              isPlaying={isPlaying}
              isLoading={isLoading}
              isBuffering={isBuffering}
              isSeeking={isSeeking}
              playbackRate={playbackRate}
              volume={volume}
              onTogglePlay={togglePlay}
              onSkip={skip}
              onSetSpeed={setPlaybackRate}
              onSetVolume={handleSetVolume}
            />
          </div>
        </div>
      )}

      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleError}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlayCb}
        onSeeked={handleSeeked}
        onSeeking={handleSeeking}
        preload="auto"
      />
    </>
  );
}
