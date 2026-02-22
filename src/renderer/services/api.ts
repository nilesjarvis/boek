import axios, { AxiosInstance } from 'axios';
import { useAuthStore } from '../stores/authStore';
import type { AudioTrack } from '../utils/playerTypes';

export interface ABSUser {
  id: string;
  username: string;
  type: string;
  token: string;
  mediaProgress: MediaProgress[];
  settings: UserSettings;
  serverSettings: ServerSettings;
}

export interface MediaProgress {
  id: string;
  libraryItemId: string;
  episodeId?: string;
  duration: number;
  progress: number;
  currentTime: number;
  isFinished: boolean;
}

export interface UserSettings {
  theme?: string;
}

export interface ServerSettings {
  id: string;
}

export interface Library {
  id: string;
  name: string;
  displayOrder: number;
  icon: string;
  mediaType: 'book' | 'podcast';
}

export interface LibraryItem {
  id: string;
  libraryId: string;
  folderId: string;
  path: string;
  media: Media;
  mediaType: 'book' | 'podcast';
  title: string;
  authorName?: string;
  description?: string;
  coverPath?: string;
}

export interface Media {
  id: string;
  metadata: MediaMetadata;
  coverPath?: string;
  tracks?: Track[];
  episodes?: PodcastEpisode[];
  chapters?: Chapter[];
}

export interface Chapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

export interface MediaMetadata {
  title: string;
  authorName?: string;
  author?: string;
  description?: string;
  narrator?: string;
  series?: string;
  genres?: string[];
  publishedYear?: string;
}

export interface Track {
  id: string;
  index: number;
  title: string;
  path: string;
  duration: number;
  codec?: string;
  bitRate?: number;
}

export interface PodcastEpisode {
  id: string;
  title: string;
  description?: string;
  publishedAt: string;
  audioFile: string;
  duration: number;
  size: number;
}

export interface SearchResult {
  // Book library results
  book?: any[];
  authors?: any[];
  series?: any[];
  // Podcast library results
  podcast?: any[];
  episodes?: any[];
  // Both
  tags?: any[];
  genres?: any[];
}

// Listening stats types
export interface ListeningStatsItem {
  id: string;
  timeListening: number;
  mediaMetadata: {
    title: string;
    author?: string;
    authors?: { id: string; name: string }[];
    subtitle?: string;
    narrators?: string[];
    series?: { id: string; name: string; sequence?: string }[];
    genres?: string[];
    publisher?: string;
    description?: string;
    imageUrl?: string;
    type?: string;
    feedUrl?: string;
    language?: string;
    releaseDate?: string;
    publishedYear?: string | null;
    publishedDate?: string | null;
    explicit?: boolean;
  };
}

export interface ListeningSession {
  id: string;
  userId: string;
  libraryId: string;
  libraryItemId: string;
  bookId: string | null;
  episodeId: string | null;
  mediaType: 'book' | 'podcast';
  mediaMetadata: ListeningStatsItem['mediaMetadata'];
  chapters: Chapter[];
  displayTitle: string;
  displayAuthor: string;
  coverPath: string;
  duration: number;
  playMethod: number;
  mediaPlayer: string;
  deviceInfo: {
    id: string;
    userId: string;
    deviceId: string;
    ipAddress: string;
    browserName: string;
    browserVersion: string;
    osName: string;
    osVersion: string;
    clientVersion: string;
    clientName: string;
    deviceName: string;
  };
  serverVersion: string;
  date: string;
  dayOfWeek: string;
  timeListening: number;
  startTime: number;
  currentTime: number;
  startedAt: number;
  updatedAt: number;
}

export interface ListeningStats {
  totalTime: number;
  today: number;
  items: Record<string, ListeningStatsItem>;
  days: Record<string, number>;
  dayOfWeek: Record<string, number>;
  recentSessions: ListeningSession[];
}

class ABSApi {
  private client: AxiosInstance | null = null;

  init(baseUrl: string, token: string) {
    const url = baseUrl.replace(/\/$/, '');
    this.client = axios.create({
      baseURL: `${url}/api`,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 10000,
    });
  }

  getServerUrl(): string {
    const store = useAuthStore.getState();
    return store.serverUrl.replace(/\/$/, '');
  }

  reset() {
    this.client = null;
  }

  getClient(): AxiosInstance {
    if (!this.client) {
      const store = useAuthStore.getState();
      if (store.serverUrl && store.user?.token) {
        this.init(store.serverUrl, store.user.token);
      } else {
        throw new Error('API not initialized');
      }
    }
    return this.client!;
  }

  async login(serverUrl: string, username: string, password: string): Promise<ABSUser> {
    const url = serverUrl.replace(/\/$/, '');
    const response = await axios.post(`${url}/login`, {
      username,
      password,
    });
    return response.data.user;
  }

  async getLibraries(): Promise<Library[]> {
    const res = await this.getClient().get('/libraries');
    return res.data.libraries;
  }

  async getLibraryItems(libraryId: string): Promise<LibraryItem[]> {
    const res = await this.getClient().get(`/libraries/${libraryId}/items`);
    return res.data.results;
  }

  async getPersonalizedLibrary(libraryId: string): Promise<any> {
    const res = await this.getClient().get(`/libraries/${libraryId}/personalized`);
    return res.data;
  }

  async searchLibrary(libraryId: string, query: string, limit: number = 10): Promise<SearchResult> {
    const res = await this.getClient().get(`/libraries/${libraryId}/search`, {
      params: { q: query, limit }
    });
    return res.data;
  }

  async getLibraryItem(itemId: string): Promise<LibraryItem> {
    const res = await this.getClient().get(`/items/${itemId}`);
    return res.data;
  }

  async getLibraryItemExpanded(itemId: string): Promise<any> {
    const res = await this.getClient().get(`/items/${itemId}`, {
      params: { expanded: 1, include: 'downloads,rssfeed,share' }
    });
    return res.data;
  }

  async getItemCover(itemId: string, token: string): Promise<string> {
    const base = this.getServerUrl();
    return `${base}/api/items/${itemId}/cover?token=${token}`;
  }

  async getPlaybackProgress(itemId: string): Promise<MediaProgress | null> {
    try {
      const res = await this.getClient().get(`/me/progress/${itemId}`);
      return res.data;
    } catch (err) {
      return null;
    }
  }

  async updateProgress(_itemId: string, sessionId: string, data: {
    currentTime: number;
    timeListened: number;
    episodeId?: string;
  }): Promise<void> {
    await this.getClient().post(`/session/${sessionId}/sync`, {
      currentTime: data.currentTime,
      timeListened: data.timeListened,
      ...(data.episodeId && { episodeId: data.episodeId }),
    });
  }

  async getListeningStats(): Promise<ListeningStats> {
    const res = await this.getClient().get('/me/listening-stats');
    return res.data;
  }

  async getStreamUrl(itemId: string, episodeId?: string): Promise<{ 
    streamUrl: string; 
    sessionId: string;
    currentTime?: number;
    duration?: number;
    chapters?: Chapter[];
    audioTracks?: AudioTrack[];
  }> {
    const base = this.getServerUrl();
    
    // For podcast episodes, use a different endpoint
    const playEndpoint = episodeId 
      ? `/items/${itemId}/play/${episodeId}`
      : `/items/${itemId}/play`;
    
    const response = await this.getClient().post(playEndpoint, {
      deviceInfo: {
        clientName: 'Audiobookshelf Player',
        deviceId: 'audiobookshelf-player-electron',
      },
      supportedMimeTypes: ['audio/flac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/webm'],
      mediaPlayer: 'html5',
      forceTranscode: false,
      forceDirectPlay: false,
    });
    const sessionId = response.data.id;
    const libraryItem = response.data.libraryItem;
    const currentTime = response.data.currentTime ?? response.data.startTime ?? 0;
    let duration = response.data.duration || 0;
    const chapters = response.data.chapters || [];
    
    // Check for different audio sources
    let streamUrl: string | null = null;
    const store = useAuthStore.getState();
    
    // For episodes, check if there's episode-specific data
    if (episodeId && response.data.episode) {
      // Episode might have its own duration
      if (response.data.episode.duration) {
        duration = response.data.episode.duration;
      }
    }
    
    // Method 1: Check for audioTracks (newer API)
    if (response.data.audioTracks?.length > 0) {
      const audioTrack = response.data.audioTracks[0];
      if (audioTrack.contentUrl) {
        streamUrl = `${base}${audioTrack.contentUrl}?token=${store.user?.token}`;
      }
    }
    
    // Method 2: Check for libraryItem.media.tracks
    if (!streamUrl && libraryItem?.media?.tracks?.length > 0) {
      const tracks = libraryItem.media.tracks;
      const contentUrl = tracks[0].contentUrl;
      if (contentUrl) {
        streamUrl = `${base}${contentUrl}?token=${store.user?.token}`;
      }
    }
    
    // Method 3: Check for HLS stream in videoStream field
    if (!streamUrl && response.data.videoStream) {
      streamUrl = `${base}${response.data.videoStream}?token=${store.user?.token}`;
    }
    
    // Method 4: Check for direct stream URL in response
    if (!streamUrl && response.data.stream) {
      streamUrl = `${base}${response.data.stream}?token=${store.user?.token}`;
    }
    
    // Method 5: Construct session-based stream URL as fallback
    if (!streamUrl && sessionId) {
      streamUrl = `${base}/api/items/${itemId}/play/${sessionId}?token=${store.user?.token}`;
    }
    
    if (!streamUrl) {
      throw new Error('No audio stream available');
    }
    
    return {
      streamUrl,
      sessionId,
      currentTime,
      duration,
      chapters,
      audioTracks: response.data.audioTracks || libraryItem?.media?.tracks || [],
    };
  }
}

export const absApi = new ABSApi();
