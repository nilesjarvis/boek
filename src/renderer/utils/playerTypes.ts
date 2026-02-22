export enum PlayerErrorType {
  NETWORK_OFFLINE = 'network_offline',
  AUTH_EXPIRED = 'auth_expired',
  TRACK_NOT_FOUND = 'track_not_found',
  FORMAT_UNSUPPORTED = 'format_unsupported',
  HLS_MANIFEST_ERROR = 'hls_manifest_error',
  CHAPTER_INVALID = 'chapter_invalid',
  PLAYBACK_ERROR = 'playback_error',
  UNKNOWN_ERROR = 'unknown_error',
}

export interface PlayerError {
  type: PlayerErrorType;
  message: string;
  retryable: boolean;
  context?: any;
}

export interface EnhancedChapter {
  id: number;
  start: number;
  end: number;
  title: string;
  duration: number;
  progress: number; // 0-1 percentage completed
  isCompleted: boolean;
  trackIndex?: number; // For multi-track books
}

export interface AudioTrack {
  index: number;
  title: string;
  duration: number;
  startOffset: number;
  contentUrl: string;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

export const getErrorMessage = (error: PlayerError): string => {
  switch (error.type) {
    case PlayerErrorType.NETWORK_OFFLINE:
      return 'No internet connection. Playback will resume when connection is restored.';
    case PlayerErrorType.AUTH_EXPIRED:
      return 'Your session has expired. Please log in again.';
    case PlayerErrorType.TRACK_NOT_FOUND:
      return 'Audio file not found. Please try refreshing the page.';
    case PlayerErrorType.FORMAT_UNSUPPORTED:
      return 'This audio format is not supported by your browser.';
    case PlayerErrorType.HLS_MANIFEST_ERROR:
      return 'Failed to load audio stream. Please try again.';
    case PlayerErrorType.CHAPTER_INVALID:
      return 'Invalid chapter position requested.';
    case PlayerErrorType.PLAYBACK_ERROR:
      return error.message || 'Playback error occurred. Please try again.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
};