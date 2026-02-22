import { create } from 'zustand';
import type { Chapter } from '../services/api';
import type { AudioTrack } from '../utils/playerTypes';

interface PlayerState {
  currentItem: {
    id: string;
    title: string;
    author?: string;
    coverUrl?: string;
  } | null;
  currentEpisode: { id: string; title: string } | null;
  sessionId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  lastSyncTime: number;
  chapters: Chapter[];
  audioTracks: AudioTrack[];
  currentTrackIndex: number;
  setCurrentItem: (item: PlayerState['currentItem']) => void;
  setCurrentEpisode: (episode: PlayerState['currentEpisode']) => void;
  setSessionId: (sessionId: string) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setLastSyncTime: (time: number) => void;
  setChapters: (chapters: Chapter[]) => void;
  setAudioTracks: (tracks: AudioTrack[]) => void;
  setCurrentTrackIndex: (index: number) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentItem: null,
  currentEpisode: null,
  sessionId: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  volume: 1,
  lastSyncTime: 0,
  chapters: [],
  audioTracks: [],
  currentTrackIndex: 0,
  setCurrentItem: (item) => set({ currentItem: item, currentEpisode: null, currentTime: 0, duration: 0, sessionId: null, lastSyncTime: 0, chapters: [], audioTracks: [], currentTrackIndex: 0 }),
  setCurrentEpisode: (episode) => set({ currentEpisode: episode }),
  setSessionId: (sessionId) => set({ sessionId }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),
  setVolume: (volume) => set({ volume }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  setChapters: (chapters) => set({ chapters }),
  setAudioTracks: (tracks) => set({ audioTracks: tracks }),
  setCurrentTrackIndex: (index) => set({ currentTrackIndex: index }),
  reset: () =>
    set({
      currentItem: null,
      currentEpisode: null,
      sessionId: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      lastSyncTime: 0,
      chapters: [],
      audioTracks: [],
      currentTrackIndex: 0,
    }),
}));
