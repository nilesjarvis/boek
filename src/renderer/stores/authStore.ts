import { create } from 'zustand';
import { absApi } from '../services/api';
import type { MediaProgress } from '../services/api';
import { useEpisodeProgressStore } from './episodeProgressStore';
import { buildLatestProgressByEpisode } from '../utils/progressUtils';

interface User {
  id: string;
  username: string;
  token: string;
  mediaProgress?: MediaProgress[];
}

interface AuthState {
  serverUrl: string;
  user: User | null;
  isAuthenticated: boolean;
  setServerUrl: (url: string) => void;
  login: (user: User) => void;
  logout: () => void;
  getProgress: (itemId: string) => MediaProgress | null;
}

function readStoredUser(): User | null {
  const storedUser = localStorage.getItem('user');
  if (!storedUser || !localStorage.getItem('token')) return null;

  try {
    return JSON.parse(storedUser) as User;
  } catch {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    return null;
  }
}

const storedUser = readStoredUser();
const hasStoredAuth = !!storedUser && !!localStorage.getItem('token');

export const useAuthStore = create<AuthState>((set, get) => ({
  serverUrl: localStorage.getItem('serverUrl') || '',
  user: storedUser,
  isAuthenticated: hasStoredAuth,
  setServerUrl: (url: string) => {
    localStorage.setItem('serverUrl', url);
    set({ serverUrl: url });
  },
  login: (user: User) => {
    localStorage.setItem('token', user.token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, isAuthenticated: true });

    // Seed the episode progress store from the login response so that progress
    // is available immediately on the Podcasts page without waiting for an API call.
    if (user.mediaProgress) {
      useEpisodeProgressStore.getState().mergeProgress(buildLatestProgressByEpisode(user.mediaProgress));
    }
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    absApi.reset();
    // Clear episode progress cache on logout so next user starts fresh
    useEpisodeProgressStore.getState().clear();
    set({ user: null, isAuthenticated: false });
  },
  getProgress: (itemId: string) => {
    const user = get().user;
    if (!user?.mediaProgress) return null;
    return user.mediaProgress.find(p => p.libraryItemId === itemId) || null;
  },
}));
