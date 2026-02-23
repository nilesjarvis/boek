import { useEffect, useState, useCallback, useRef } from 'react';
import { absApi } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useEpisodeProgressStore } from '../stores/episodeProgressStore';
import './EpisodeRecommendations.css';

interface EpisodeData {
  id: string;
  libraryItemId: string;
  title: string;
  description?: string;
  publishedAt?: number;
  audioFile?: { duration?: number };
  season?: string;
  episode?: string;
}

interface CachedPodcast {
  itemId: string;
  episodes: EpisodeData[];
  metadata: { title?: string; author?: string } | null;
  coverUrl: string | undefined;
}

export default function EpisodeRecommendations() {
  const { currentItem, currentEpisode, playItem, setIsPlaying } = usePlayerStore();
  const episodeProgress = useEpisodeProgressStore((s) => s.progress);

  const [collapsed, setCollapsed] = useState(false);
  const [episodes, setEpisodes] = useState<EpisodeData[]>([]);
  const [podcastMeta, setPodcastMeta] = useState<{ title?: string; author?: string } | null>(null);
  const [podcastCoverUrl, setPodcastCoverUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cache ref to avoid re-fetching when switching episodes within the same podcast.
  // Using a ref (not state) so updates don't trigger re-renders or effect re-runs.
  const cacheRef = useRef<CachedPodcast | null>(null);

  // The item ID we should be fetching for. Stable reference for the effect.
  const itemId = currentEpisode ? currentItem?.id : undefined;

  // Fetch episodes when the podcast (itemId) changes
  useEffect(() => {
    if (!itemId) {
      // Not a podcast -- clear state
      setEpisodes([]);
      setPodcastMeta(null);
      setPodcastCoverUrl(undefined);
      return;
    }

    // Check cache -- if we already fetched this podcast, reuse it
    if (cacheRef.current && cacheRef.current.itemId === itemId) {
      setEpisodes(cacheRef.current.episodes);
      setPodcastMeta(cacheRef.current.metadata);
      setPodcastCoverUrl(cacheRef.current.coverUrl);
      return;
    }

    let cancelled = false;

    const fetchEpisodes = async () => {
      setLoading(true);
      try {
        const data = await absApi.getLibraryItemExpanded(itemId);
        if (cancelled) return;

        const allEpisodes: EpisodeData[] = data?.media?.episodes || [];
        const meta = data?.media?.metadata || null;

        // Build cover URL
        const serverUrl = useAuthStore.getState().serverUrl;
        const token = useAuthStore.getState().user?.token;
        const cover = data?.media?.coverPath
          ? `${serverUrl}/api/items/${itemId}/cover?token=${token}`
          : currentItem?.coverUrl;

        // Update cache
        cacheRef.current = {
          itemId,
          episodes: allEpisodes,
          metadata: meta,
          coverUrl: cover,
        };

        setEpisodes(allEpisodes);
        setPodcastMeta(meta);
        setPodcastCoverUrl(cover);
      } catch {
        // Non-critical feature -- silently fail
        if (!cancelled) {
          setEpisodes([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchEpisodes();

    return () => {
      cancelled = true;
    };
  }, [itemId]); // Only re-run when the podcast item changes, not on episode switch

  const handlePlayEpisode = useCallback(
    (ep: EpisodeData) => {
      if (!currentItem) return;
      playItem(
        {
          id: currentItem.id,
          title: ep.title,
          author: `${podcastMeta?.title || ''}${podcastMeta?.author ? ` - ${podcastMeta.author}` : ''}`,
          coverUrl: podcastCoverUrl,
        },
        { id: ep.id, title: ep.title }
      );
      setIsPlaying(true);
    },
    [currentItem, podcastMeta, podcastCoverUrl, playItem, setIsPlaying]
  );

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  // Convert vertical mouse wheel to horizontal scroll on the episode list.
  // Must be an imperative listener with { passive: false } so preventDefault() works.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || collapsed) return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [collapsed, episodes]); // re-attach when collapsed state changes or episodes load

  // Don't render if not a podcast or no item
  if (!currentItem || !currentEpisode) return null;

  // Filter out current episode, sort newest first
  const filteredEpisodes = episodes
    .filter((ep) => ep.id !== currentEpisode.id)
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));

  // Nothing to recommend
  if (!loading && filteredEpisodes.length === 0) return null;

  return (
    <div className={`episode-recommendations ${collapsed ? 'collapsed' : ''}`}>
      <button
        className="episode-rec-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Show episode recommendations' : 'Hide episode recommendations'}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          width="16"
          height="16"
          className={`episode-rec-chevron ${collapsed ? 'chevron-down' : 'chevron-up'}`}
        >
          <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
        </svg>
        <span className="episode-rec-toggle-label">More Episodes</span>
      </button>

      {!collapsed && (
        <div className="episode-rec-scroll" ref={scrollRef}>
          {loading && (
            <div className="episode-rec-loading">
              <span>Loading episodes...</span>
            </div>
          )}
          {!loading &&
            filteredEpisodes.map((ep) => {
              const progress = episodeProgress[ep.id];
              const progressPct = progress
                ? progress.isFinished
                  ? 100
                  : Math.round(progress.progress * 100)
                : 0;

              return (
                <button
                  key={ep.id}
                  className={`episode-rec-card ${progressPct === 100 ? 'is-finished' : ''}`}
                  onClick={() => handlePlayEpisode(ep)}
                  title={ep.title}
                >
                  <div className="episode-rec-card-title">{ep.title}</div>
                  <div className="episode-rec-card-meta">
                    {ep.publishedAt && <span>{formatDate(ep.publishedAt)}</span>}
                    {ep.audioFile?.duration && (
                      <span>{formatDuration(ep.audioFile.duration)}</span>
                    )}
                  </div>
                  {progressPct > 0 && (
                    <div className="episode-rec-card-progress">
                      <div
                        className="episode-rec-card-progress-fill"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
