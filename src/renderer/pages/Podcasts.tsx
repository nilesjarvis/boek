import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { absApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { usePlayerStore } from '../stores/playerStore';
import { useFavouritesStore } from '../stores/favouritesStore';
import { useEpisodeProgressStore } from '../stores/episodeProgressStore';
import type { EpisodeProgressEntry } from '../stores/episodeProgressStore';
import { websocketService } from '../services/websocket';
import PodcastDetail from '../components/PodcastDetail';
import './Podcasts.css';

interface PodcastShelf {
  id: string;
  label: string;
  type: 'episode' | 'podcast';
  total: number;
  entities: any[];
}

interface PodcastsProps {
  libraryId?: string;
}

export default function Podcasts({ libraryId }: PodcastsProps) {
  const [shelves, setShelves] = useState<PodcastShelf[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShelf, setSelectedShelf] = useState<string>('continue-listening');
  const [detailPodcast, setDetailPodcast] = useState<{ itemId: string; coverUrl: string | null } | null>(null);
  const [fetchedFavourites, setFetchedFavourites] = useState<any[]>([]);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { playItem: playStoreItem } = usePlayerStore();
  const { favouriteIds, toggleFavourite, isFavourite } = useFavouritesStore();
  const episodeProgress = useEpisodeProgressStore((s) => s.progress);
  const mergeProgress = useEpisodeProgressStore((s) => s.mergeProgress);
  
  // Collect all unique podcast series across all shelves, filter to favourites
  const favouritePodcasts = useMemo(() => {
    const seen = new Set<string>();
    const podcasts: any[] = [];
    const favSet = new Set(favouriteIds);

    // First: podcasts available in the shelf data
    for (const shelf of shelves) {
      if (shelf.type !== 'podcast') continue;
      for (const item of shelf.entities) {
        if (!favSet.has(item.id) || seen.has(item.id)) continue;
        seen.add(item.id);
        podcasts.push(item);
      }
    }

    // Second: favourited podcasts that were fetched individually (not in any shelf)
    for (const item of fetchedFavourites) {
      if (!favSet.has(item.id) || seen.has(item.id)) continue;
      seen.add(item.id);
      podcasts.push(item);
    }

    return podcasts;
  }, [shelves, favouriteIds, fetchedFavourites]);

  // Fetch data for favourited podcasts not present in any shelf
  useEffect(() => {
    if (favouriteIds.length === 0 || shelves.length === 0) return;

    // Collect all podcast IDs available in shelves
    const shelfIds = new Set<string>();
    for (const shelf of shelves) {
      if (shelf.type !== 'podcast') continue;
      for (const item of shelf.entities) {
        shelfIds.add(item.id);
      }
    }
    // Also include already-fetched ones
    for (const item of fetchedFavourites) {
      shelfIds.add(item.id);
    }

    const missing = favouriteIds.filter(id => !shelfIds.has(id));
    if (missing.length === 0) return;

    const fetchMissing = async () => {
      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            return await absApi.getLibraryItemExpanded(id);
          } catch {
            return null;
          }
        })
      );
      const valid = results.filter(
        (r): r is any => r !== null && r.mediaType === 'podcast'
      );
      if (valid.length > 0) {
        setFetchedFavourites(prev => [...prev, ...valid]);
      }
    };
    fetchMissing();
  }, [favouriteIds, shelves]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    console.log('Podcasts: Component mounted, WebSocket connected:', websocketService.isConnected());
    
    // Try to connect WebSocket if not connected
    if (!websocketService.isConnected()) {
      console.log('Podcasts: Attempting to connect WebSocket...');
      websocketService.connect();
    } else {
      // If already connected, request fresh user data
      console.log('Podcasts: WebSocket already connected, requesting user data...');
      websocketService.requestUserData();
    }
  }, []);
  
  const podcastLibraryId = libraryId;

  /**
   * Fetch ALL episode progress via GET /api/me (single request) and merge into the store.
   * This avoids the limitation of GET /me/progress/{itemId} which only returns one episode
   * per podcast. The merge logic preserves existing entries and only updates with newer data,
   * preventing the "progress appears then vanishes" flicker cycle.
   */
  const fetchEpisodeProgress = useCallback(async () => {
    try {
      const { mediaProgress } = await absApi.getUserMe();
      const progressMap: Record<string, EpisodeProgressEntry> = {};

      for (const mp of mediaProgress) {
        if (mp.episodeId) {
          progressMap[mp.episodeId] = {
            id: mp.episodeId,
            progress: mp.progress || 0,
            isFinished: mp.isFinished || false,
            currentTime: mp.currentTime || 0,
            duration: mp.duration || 0,
            updatedAt: mp.lastUpdate || Date.now(),
          };
        }
      }

      // Merge into persistent store -- existing entries not in the response are preserved,
      // and entries are only overwritten if the incoming data is newer.
      mergeProgress(progressMap);
    } catch (err) {
      console.error('[Podcasts] Failed to fetch episode progress:', err);
    }
  }, [mergeProgress]);

  const loadPodcasts = useCallback(async () => {
    if (!podcastLibraryId) return;
    try {
      const response = await absApi.getPersonalizedLibrary(podcastLibraryId);

      // Handle both possible response formats
      let shelvesData: PodcastShelf[] = [];
      
      if (Array.isArray(response)) {
        // Response is directly an array of shelves
        shelvesData = response;
      } else if (response.shelves && Array.isArray(response.shelves)) {
        // Response has a shelves property
        shelvesData = response.shelves;
      } else {
        console.error('Unexpected response format:', response);
      }
      
      if (shelvesData.length > 0) {
        setShelves(shelvesData);

        // Fetch progress for all episodes (single bulk request, merged into store)
        await fetchEpisodeProgress();
      } else {
        console.error('No shelves found in response');
      }
    } catch (err) {
      console.error('Failed to load podcasts:', err);
    } finally {
      setLoading(false);
    }
  }, [podcastLibraryId, fetchEpisodeProgress]);

  // Refresh shelves when playback stops (so continue-listening updates)
  useEffect(() => {
    let wasPlaying = false;
    const unsub = usePlayerStore.subscribe((state) => {
      if (wasPlaying && !state.isPlaying && podcastLibraryId) {
        // Playback just stopped -- refresh after a short delay to let the server sync
        setTimeout(() => loadPodcasts(), 1500);
      }
      wasPlaying = state.isPlaying;
    });
    return unsub;
  }, [podcastLibraryId, loadPodcasts]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (podcastLibraryId) {
      loadPodcasts();
    }
  }, [isAuthenticated, navigate, podcastLibraryId, loadPodcasts]);

  // Refresh progress when page gains focus
  useEffect(() => {
    const handleFocus = () => {
      fetchEpisodeProgress();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchEpisodeProgress]);

  // Listen for real-time progress updates via WebSocket and write to the persistent store.
  useEffect(() => {
    const updateProgress = useEpisodeProgressStore.getState().updateProgress;

    const unsubscribeProgress = websocketService.onProgressUpdate((progress) => {
      if (progress.episodeId) {
        updateProgress(progress.episodeId, {
          id: progress.episodeId,
          progress: progress.progress,
          isFinished: progress.isFinished,
          currentTime: progress.currentTime,
          duration: progress.duration,
          updatedAt: progress.updatedAt || Date.now(),
        });
      }
    });

    const unsubscribeSession = websocketService.onSessionUpdate((session) => {
      // Session updates represent live playback and are always "current",
      // so use Date.now() as the timestamp to ensure they are accepted.
      if (session.episodeId && session.duration > 0) {
        const prog = session.currentTime / session.duration;
        updateProgress(session.episodeId, {
          id: session.episodeId,
          progress: prog,
          isFinished: prog >= 0.95,
          currentTime: session.currentTime,
          duration: session.duration,
          updatedAt: Date.now(),
        });
      }
    });

    return () => {
      unsubscribeProgress();
      unsubscribeSession();
    };
  }, []);

  const playEpisode = (data: any) => {
    if (!data) return;
    
    // If passed a simple item (for backwards compatibility)
    if (!data.item && data.id) {
      // Old format, convert it
      const item = data;
      const episode = item.recentEpisode || item;
      const libraryItemId = item.libraryItemId || item.id;
      const episodeId = episode.id;
      
      if (!libraryItemId || !episodeId) {
        console.error('Missing required IDs for playback', { libraryItemId, episodeId });
        return;
      }
      
      const podcastTitle = item.media?.metadata?.title || item.podcastTitle || '';
      const author = item.media?.metadata?.author || '';
      
      playStoreItem(
        {
          id: libraryItemId,
          title: episode.title || 'Unknown Episode',
          author: `${podcastTitle}${author ? ` - ${author}` : ''}`,
          coverUrl: undefined,
        },
        { id: episodeId, title: episode.title || 'Unknown Episode' }
      );
      return;
    }
    
    // New format with pre-built cover URL
    const { item, episode, coverUrl } = data;
    const libraryItemId = item.libraryItemId || item.id;
    const episodeId = episode.id;
    
    if (!libraryItemId || !episodeId) {
      console.error('Missing required IDs for playback', { libraryItemId, episodeId });
      return;
    }
    
    // Get podcast metadata
    const podcastTitle = item.media?.metadata?.title || item.podcastTitle || '';
    const author = item.media?.metadata?.author || '';
    
    playStoreItem(
      {
        id: libraryItemId,
        title: episode.title || 'Unknown Episode',
        author: `${podcastTitle}${author ? ` - ${author}` : ''}`,
        coverUrl: coverUrl || undefined,
      },
      { id: episodeId, title: episode.title || 'Unknown Episode' }
    );
    
    // Start playing the episode
    usePlayerStore.getState().setIsPlaying(true);
  };

  const getShelfIcon = (shelfId: string) => {
    switch (shelfId) {
      case 'continue-listening':
        return '▶️';
      case 'newest-episodes':
        return '🆕';
      case 'recently-added':
        return '📥';
      case 'listen-again':
        return '🔄';
      default:
        return '📻';
    }
  };

  if (loading) {
    return <div className="loading">Loading podcasts...</div>;
  }

  const currentShelf = shelves.find(s => s.id === selectedShelf);

  if (shelves.length === 0) {
    return (
      <div className="podcasts">
        <div className="empty-state">
          <p>No podcasts found in this library</p>
        </div>
      </div>
    );
  }

  return (
    <div className="podcasts">
      {favouritePodcasts.length > 0 && (
        <div className="podcast-favourites-section">
          <h2 className="library-section-header">Favourites</h2>
          <div className="podcast-grid">
            {favouritePodcasts.map((item: any) => {
              const title = item.media?.metadata?.title || 'Unknown Podcast';
              const author = item.media?.metadata?.author || '';
              const coverPath = item.media?.coverPath;
              const coverUrl = coverPath
                ? `${useAuthStore.getState().serverUrl}/api/items/${item.id}/cover?token=${useAuthStore.getState().user?.token}`
                : null;

              return (
                <div
                  key={`fav-${item.id}`}
                  className="podcast-item podcast-series"
                  onClick={() => setDetailPodcast({ itemId: item.id, coverUrl })}
                >
                  <div className="podcast-cover">
                    {coverUrl ? (
                      <img src={coverUrl} alt={title} />
                    ) : null}
                    <div className={`podcast-cover-placeholder ${coverUrl ? 'hidden' : ''}`}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                        <path d="M12 14c1.66 0 2.99-1.34 2.99-3s-1.33-3-2.99-3c-1.66 0-3 1.34-3 3s1.34 3 3 3zm0 2c-2.33 0-6.98-1.12-7-7 7h14c-.02-5.86-4.67-7-7-7zm0-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                      </svg>
                    </div>
                    <button
                      className="podcast-favourite-button active"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavourite(item.id);
                      }}
                      aria-label="Remove from favourites"
                      title="Remove from favourites"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                    </button>
                  </div>
                  <div className="podcast-info">
                    <h3 className="podcast-title">{title}</h3>
                    {author && <p className="podcast-author">{author}</p>}
                    {item.recentEpisode && (
                      <p className="latest-episode">Latest: {item.recentEpisode.title}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="podcasts-tabs">
        {shelves.map((shelf) => (
          <button
            key={shelf.id}
            className={`podcast-tab ${selectedShelf === shelf.id ? 'active' : ''}`}
            onClick={() => {
              setSelectedShelf(shelf.id);
              // Refresh shelves when switching tabs so continue-listening is up to date
              loadPodcasts();
            }}
          >
            <span className="tab-icon">{getShelfIcon(shelf.id)}</span>
            <span className="tab-label">{shelf.label}</span>
          </button>
        ))}
      </div>

      {currentShelf && (
        <div className="podcast-shelf">
          <h2>{currentShelf.label}</h2>
          <div className="podcast-grid">
            {currentShelf.entities.map((item: any, index: number) => {
              // Determine if this is a podcast series or an episode
              const isPodcast = currentShelf.type === 'podcast';
              let title, author, coverPath, publishedAt, duration, episodeItem: any;
              
              let podcastName = '';
              
              if (isPodcast) {
                // This is a podcast series
                title = item.media?.metadata?.title || 'Unknown Podcast';
                author = item.media?.metadata?.author || '';
                coverPath = item.media?.coverPath;
                episodeItem = item.recentEpisode;
              } else {
                // For episode shelves, the structure varies
                if (item.recentEpisode) {
                  episodeItem = item.recentEpisode;
                  title = episodeItem.title || 'Unknown Episode';
                  author = item.media?.metadata?.author || '';
                  podcastName = item.media?.metadata?.title || '';
                  coverPath = item.media?.coverPath;
                  publishedAt = episodeItem.publishedAt;
                  duration = episodeItem.audioFile?.duration;
                } else if (item.title && (item.audioFile || item.episode)) {
                  episodeItem = item.episode || item;
                  title = episodeItem.title || item.title || 'Unknown Episode';
                  author = item.media?.metadata?.author || '';
                  podcastName = item.podcastTitle || item.podcast?.title || item.media?.metadata?.title || '';
                  coverPath = item.podcast?.coverPath || item.coverPath;
                  publishedAt = episodeItem.publishedAt || item.publishedAt;
                  duration = episodeItem.audioFile?.duration || episodeItem.duration || item.duration;
                } else {
                  title = item.media?.metadata?.title || item.title || 'Unknown';
                  author = item.media?.metadata?.author || '';
                  coverPath = item.media?.coverPath || item.coverPath;
                  episodeItem = item;
                }
              }
              
              // For cover URLs, we always need the podcast's library item ID
              // For episodes, this is either item.id (if from episode shelf) or item.libraryItemId
              let coverLibraryItemId = item.id;
              if (!isPodcast && item.libraryItemId) {
                // This is an episode entity, use the libraryItemId for the podcast
                coverLibraryItemId = item.libraryItemId;
              }
              
              const coverUrl = coverPath 
                ? `${useAuthStore.getState().serverUrl}/api/items/${coverLibraryItemId}/cover?token=${useAuthStore.getState().user?.token}`
                : null;
              
              return (
                <div
                  key={`${item.id}-${index}`}
                  className={`podcast-item ${isPodcast ? 'podcast-series' : 'podcast-episode'}`}
                  onClick={() => {
                    if (isPodcast) {
                      // Open the podcast detail modal for podcast series
                      setDetailPodcast({ itemId: item.id, coverUrl });
                    } else {
                      // Play the episode directly
                      const playData = {
                        item: item,
                        episode: episodeItem || item.recentEpisode || item,
                        coverUrl: coverUrl,
                      };
                      playEpisode(playData);
                    }
                  }}
                >
                  <div className="podcast-cover">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={title}
                        onError={(e) => {
                          // Fallback if cover fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const placeholder = target.nextElementSibling;
                          if (placeholder) {
                            placeholder.classList.remove('hidden');
                          }
                        }}
                      />
                    ) : null}
                    <div className={`podcast-cover-placeholder ${coverUrl ? 'hidden' : ''}`}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                        <path d="M12 14c1.66 0 2.99-1.34 2.99-3s-1.33-3-2.99-3c-1.66 0-3 1.34-3 3s1.34 3 3 3zm0 2c-2.33 0-6.98-1.12-7-7 7h14c-.02-5.86-4.67-7-7-7zm0-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                      </svg>
                    </div>
                    {!isPodcast && episodeItem && episodeProgress[episodeItem.id]?.isFinished && (
                      <div className="episode-finished-badge">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                          <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                        </svg>
                      </div>
                    )}
                    {isPodcast && (
                      <button
                        className={`podcast-favourite-button ${isFavourite(item.id) ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavourite(item.id);
                        }}
                        aria-label={isFavourite(item.id) ? 'Remove from favourites' : 'Add to favourites'}
                        title={isFavourite(item.id) ? 'Remove from favourites' : 'Add to favourites'}
                      >
                        {isFavourite(item.id) ? (
                          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                            <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/>
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="podcast-info">
                    <h3 className="podcast-title">{title}</h3>
                    {isPodcast && author && <p className="podcast-author">{author}</p>}
                    {!isPodcast && (podcastName || author) && (
                      <p
                        className="podcast-author podcast-author-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailPodcast({ itemId: coverLibraryItemId, coverUrl });
                        }}
                        title={`View ${podcastName || author}`}
                      >
                        {podcastName || author}
                      </p>
                    )}
                    {isPodcast && episodeItem && (
                      <p className="latest-episode">Latest: {episodeItem.title}</p>
                    )}
                    {!isPodcast && publishedAt && (
                      <p className="episode-date">
                        {new Date(publishedAt).toLocaleDateString()}
                      </p>
                    )}
                    {!isPodcast && duration && (
                      <p className="episode-duration">
                        {Math.floor(duration / 60)} min
                      </p>
                    )}
                    {!isPodcast && episodeItem && (() => {
                      const episodeId = episodeItem.id;
                      const progress = episodeProgress[episodeId];
                      const hasProgress = progress && progress.progress > 0;
                      
                      // Always render the container to reserve layout space and prevent shifts.
                      // The progress text is hidden via CSS until data is available.
                      return (
                        <div className="episode-progress-container">
                          <div className="episode-progress">
                            <div 
                              className="episode-progress-bar" 
                              style={{ width: hasProgress ? `${progress.progress * 100}%` : '0%' }} 
                            />
                          </div>
                          <p className={`episode-progress-text ${hasProgress ? 'visible' : ''}`}>
                            {progress?.isFinished 
                              ? 'Finished' 
                              : hasProgress ? `${Math.round(progress.progress * 100)}%` : ''}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {detailPodcast && (
        <PodcastDetail
          itemId={detailPodcast.itemId}
          coverUrl={detailPodcast.coverUrl}
          onClose={() => setDetailPodcast(null)}
        />
      )}
    </div>
  );
}