import { PlayerError, PlayerErrorType, RetryConfig, DEFAULT_RETRY_CONFIG } from './playerTypes';

export class PlayerErrorHandler {
  private retryCount: Map<string, number> = new Map();
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();

  async handleError(
    error: PlayerError,
    retryFn: () => Promise<void>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<void> {
    const errorKey = `${error.type}-${error.context?.trackIndex || 'main'}`;
    
    // Clear any existing retry timeout
    const existingTimeout = this.retryTimeouts.get(errorKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Check if error is retryable
    if (!error.retryable) {
      this.cleanup(errorKey);
      throw error;
    }

    // Check retry count
    const currentRetryCount = this.retryCount.get(errorKey) || 0;
    if (currentRetryCount >= config.maxRetries) {
      this.cleanup(errorKey);
      throw error;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      config.initialDelay * Math.pow(config.backoffMultiplier, currentRetryCount),
      config.maxDelay
    );

    console.log(`[PlayerErrorHandler] Retrying ${errorKey} in ${delay}ms (attempt ${currentRetryCount + 1}/${config.maxRetries})`);

    // Schedule retry
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(async () => {
        try {
          this.retryCount.set(errorKey, currentRetryCount + 1);
          await retryFn();
          this.cleanup(errorKey);
          resolve();
        } catch (retryError) {
          // Recursively handle the error
          try {
            await this.handleError(
              retryError as PlayerError,
              retryFn,
              config
            );
            resolve();
          } catch (finalError) {
            reject(finalError);
          }
        }
      }, delay);

      this.retryTimeouts.set(errorKey, timeout);
    });
  }

  cleanup(errorKey?: string): void {
    if (errorKey) {
      this.retryCount.delete(errorKey);
      const timeout = this.retryTimeouts.get(errorKey);
      if (timeout) {
        clearTimeout(timeout);
        this.retryTimeouts.delete(errorKey);
      }
    } else {
      // Cleanup all
      this.retryCount.clear();
      this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
      this.retryTimeouts.clear();
    }
  }

  static classifyError(error: any): PlayerError {
    // Network errors
    if (error.message?.includes('network') || error.message?.includes('fetch')) {
      return {
        type: PlayerErrorType.NETWORK_OFFLINE,
        message: error.message,
        retryable: true,
      };
    }

    // Auth errors
    if (error.response?.status === 401 || error.response?.status === 403) {
      return {
        type: PlayerErrorType.AUTH_EXPIRED,
        message: 'Authentication failed',
        retryable: false,
      };
    }

    // 404 errors
    if (error.response?.status === 404) {
      return {
        type: PlayerErrorType.TRACK_NOT_FOUND,
        message: 'Audio file not found',
        retryable: false,
      };
    }

    // HLS errors
    if (error.type === 'hlsError' || error.message?.includes('m3u8')) {
      return {
        type: PlayerErrorType.HLS_MANIFEST_ERROR,
        message: error.message,
        retryable: true,
      };
    }

    // Media errors
    if (error.target?.error?.code) {
      const mediaError = error.target.error;
      switch (mediaError.code) {
        case mediaError.MEDIA_ERR_NETWORK:
          return {
            type: PlayerErrorType.NETWORK_OFFLINE,
            message: 'Network error while loading media',
            retryable: true,
          };
        case mediaError.MEDIA_ERR_DECODE:
        case mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          return {
            type: PlayerErrorType.FORMAT_UNSUPPORTED,
            message: 'Media format not supported',
            retryable: false,
          };
        default:
          return {
            type: PlayerErrorType.PLAYBACK_ERROR,
            message: 'Media playback error',
            retryable: true,
          };
      }
    }

    // Default
    return {
      type: PlayerErrorType.UNKNOWN_ERROR,
      message: error.message || 'Unknown error occurred',
      retryable: true,
    };
  }
}