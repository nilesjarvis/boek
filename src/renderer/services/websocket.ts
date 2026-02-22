import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

interface ProgressUpdate {
  id: string;
  userId: string;
  libraryItemId: string;
  episodeId?: string;
  progress: number;
  currentTime: number;
  duration: number;
  isFinished: boolean;
  finishedAt?: number;
  startedAt: number;
  updatedAt: number;
}

interface SessionUpdate {
  id: string;
  userId: string;
  libraryItemId: string;
  episodeId?: string;
  currentTime: number;
  duration: number;
  timeListening: number;
}

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;
  private progressListeners: Set<(progress: ProgressUpdate) => void> = new Set();
  private sessionListeners: Set<(session: SessionUpdate) => void> = new Set();
  private isInitialized = false;

  constructor() {
    // Bind methods to ensure correct context
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.handleAuth = this.handleAuth.bind(this);
  }

  connect() {
    const { serverUrl, user } = useAuthStore.getState();
    
    console.log('WebSocket: Connect called with:', { serverUrl, hasToken: !!user?.token });
    
    if (!serverUrl || !user?.token) {
      console.warn('WebSocket: Cannot connect without server URL and token');
      return;
    }

    if (this.socket?.connected) {
      console.log('WebSocket: Already connected');
      return;
    }

    // Prevent multiple connection attempts
    if (this.isInitialized) {
      console.log('WebSocket: Connection already initialized');
      return;
    }
    this.isInitialized = true;

    console.log('WebSocket: Connecting to', serverUrl);

    // Parse the server URL to get the WebSocket URL
    const url = new URL(serverUrl);
    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${url.host}`;

    // Create socket with specific transport and path
    // AudioBookshelf uses the path /audiobookshelf/socket.io/
    console.log('WebSocket: Creating socket with URL:', wsUrl);
    console.log('WebSocket: Using path: /audiobookshelf/socket.io/');
    
    this.socket = io(wsUrl, {
      transports: ['websocket'],
      path: '/audiobookshelf/socket.io/',
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      autoConnect: false,
      auth: {
        token: user.token,
      },
    });

    this.setupEventHandlers();
    this.socket.connect();
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('WebSocket: Connected, socket ID:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.isInitialized = true;
      
      // The handshake and auth happen automatically with Socket.IO
      // But we still need to send the auth event for AudioBookshelf
      this.handleAuth();
      
      // Start ping interval to keep connection alive
      this.startPingInterval();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket: Disconnected:', reason);
      this.stopPingInterval();
      this.isInitialized = false;
    });

    this.socket.on('connect_error', (error: any) => {
      console.error('WebSocket: Connection error:', error.message);
      console.error('WebSocket: Error type:', error.type);
      console.error('WebSocket: Full error:', error);
      this.reconnectAttempts++;
      this.isInitialized = false;
    });

    // AudioBookshelf specific events
    this.socket.on('init', (data) => {
      // Extract progress from active sessions
      if (data.usersOnline && Array.isArray(data.usersOnline)) {
        data.usersOnline.forEach((user: any) => {
          if (user.session) {
            this.handleSessionUpdate(user.session);
          }
        });
      }
    });

    this.socket.on('user_online', (data) => {
      // If there's an active session with progress, notify listeners
      if (data.session) {
        this.handleSessionUpdate(data.session);
      }
    });

    this.socket.on('user_updated', (user) => {
      // Check for media progress updates
      if (user.mediaProgress && Array.isArray(user.mediaProgress)) {
        user.mediaProgress.forEach((progress: any) => {
          this.handleProgressUpdate(progress);
        });
      }
    });

    this.socket.on('user_session_closed', () => {
      // Session closed
    });

    this.socket.on('user_media_progress_updated', (data) => {
      this.handleProgressUpdate(data);
    });

    this.socket.on('user_item_progress_updated', (data) => {
      if (data.data) {
        this.handleItemProgressUpdate(data.data);
      }
    });
  }

  private handleAuth() {
    const { user } = useAuthStore.getState();
    
    if (!this.socket || !user?.token) {
      console.error('WebSocket: Cannot authenticate without socket or token');
      return;
    }

    console.log('WebSocket: Authenticating...');
    
    // Send auth event with token
    this.socket.emit('auth', user.token);
  }

  private startPingInterval() {
    // Send ping every 25 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.socket?.connected) {
        // Socket.IO handles ping/pong automatically, but we can send a custom ping
        // The raw '2' message is a Socket.IO protocol ping
        this.socket.io.engine.write('2');
      }
    }, 25000);
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleProgressUpdate(progress: any) {
    const update: ProgressUpdate = {
      id: progress.id,
      userId: progress.userId,
      libraryItemId: progress.libraryItemId,
      episodeId: progress.episodeId,
      progress: progress.progress || 0,
      currentTime: progress.currentTime || 0,
      duration: progress.duration || 0,
      isFinished: progress.isFinished || false,
      finishedAt: progress.finishedAt,
      startedAt: progress.startedAt,
      updatedAt: progress.updatedAt,
    };

    // Notify all progress listeners
    this.progressListeners.forEach(listener => {
      try {
        listener(update);
      } catch (err) {
        console.error('WebSocket: Error in progress listener:', err);
      }
    });
  }

  private handleItemProgressUpdate(progressData: any) {
    // Notify progress listeners
    const update: ProgressUpdate = {
      id: progressData.id,
      userId: progressData.userId,
      libraryItemId: progressData.libraryItemId,
      episodeId: progressData.episodeId,
      progress: progressData.progress || 0,
      currentTime: progressData.currentTime || 0,
      duration: progressData.duration || 0,
      isFinished: progressData.isFinished || false,
      finishedAt: progressData.finishedAt,
      startedAt: progressData.startedAt,
      updatedAt: progressData.lastUpdate || progressData.updatedAt,
    };

    this.progressListeners.forEach(listener => {
      try {
        listener(update);
      } catch (err) {
        console.error('WebSocket: Error in progress listener:', err);
      }
    });
  }

  private handleSessionUpdate(session: any) {
    if (!session.episodeId && !session.bookId) return;

    const update: SessionUpdate = {
      id: session.id,
      userId: session.userId,
      libraryItemId: session.libraryItemId,
      episodeId: session.episodeId,
      currentTime: session.currentTime || 0,
      duration: session.duration || 0,
      timeListening: session.timeListening || 0,
    };

    // Notify all session listeners
    this.sessionListeners.forEach(listener => {
      try {
        listener(update);
      } catch (err) {
        console.error('WebSocket: Error in session listener:', err);
      }
    });
    
    // Also create a progress update from session data
    if (session.episodeId && session.duration > 0) {
      const progress = session.currentTime / session.duration;
      const progressUpdate: ProgressUpdate = {
        id: `${session.libraryItemId}-${session.episodeId}`,
        userId: session.userId,
        libraryItemId: session.libraryItemId,
        episodeId: session.episodeId,
        progress: progress,
        currentTime: session.currentTime,
        duration: session.duration,
        isFinished: progress >= 0.95, // Consider 95% as finished
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
      };
      
      // Notify progress listeners too
      this.progressListeners.forEach(listener => {
        try {
          listener(progressUpdate);
        } catch (err) {
          console.error('WebSocket: Error in progress listener:', err);
        }
      });
    }
  }

  disconnect() {
    console.log('WebSocket: Disconnecting...');
    this.stopPingInterval();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isInitialized = false;
    this.progressListeners.clear();
    this.sessionListeners.clear();
  }

  // Subscribe to progress updates
  onProgressUpdate(listener: (progress: ProgressUpdate) => void): () => void {
    this.progressListeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  // Subscribe to session updates
  onSessionUpdate(listener: (session: SessionUpdate) => void): () => void {
    this.sessionListeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.sessionListeners.delete(listener);
    };
  }

  // Get connection status
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Request current user data (including media progress)
  requestUserData() {
    if (!this.socket?.connected) {
      console.warn('WebSocket: Cannot request user data - not connected');
      return;
    }
    
    console.log('WebSocket: Requesting current user data...');
    // This might trigger a user_updated event with fresh data
    this.socket.emit('user_get_data');
  }
}

// Create singleton instance
export const websocketService = new WebSocketService();