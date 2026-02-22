import { useEffect, useState, useCallback } from 'react';
import { absApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { usePlayerStore } from '../stores/playerStore';
import './PodcastDetail.css';

interface PodcastDetailProps {
  itemId: string;
  coverUrl?: string | null;
  onClose: () => void;
}

interface PodcastEpisodeData {
  id: string;
  libraryItemId: string;
  title: string;
  description?: string;
  publishedAt?: number;
  audioFile?: { duration?: number };
  season?: string;
  episode?: string;
}

export default function PodcastDetail({ itemId, coverUrl, onClose }: PodcastDetailProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playItem } = usePlayerStore();

  useEffect(() => {
    const load = async () => {
      try {
        const result = await absApi.getLibraryItemExpanded(itemId);
        setData(result);
      } catch (err) {
        setError('Failed to load podcast details');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [itemId]);

  const playEpisode = useCallback((ep: PodcastEpisodeData) => {
    const meta = data?.media?.metadata;
    playItem(
      {
        id: itemId,
        title: ep.title,
        author: `${meta?.title || ''}${meta?.author ? ` - ${meta.author}` : ''}`,
        coverUrl: coverUrl || undefined,
      },
      { id: ep.id, title: ep.title }
    );
    usePlayerStore.getState().setIsPlaying(true);
    onClose();
  }, [data, itemId, coverUrl, playItem, onClose]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Close on escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const meta = data?.media?.metadata;
  const episodes: PodcastEpisodeData[] = data?.media?.episodes || [];
  // Sort newest first
  const sortedEpisodes = [...episodes].sort(
    (a, b) => (b.publishedAt || 0) - (a.publishedAt || 0)
  );

  const resolvedCover = coverUrl ||
    (data?.media?.coverPath
      ? `${useAuthStore.getState().serverUrl}/api/items/${itemId}/cover?token=${useAuthStore.getState().user?.token}`
      : null);

  return (
    <div className="podcast-detail-overlay" onClick={onClose}>
      <div className="podcast-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="podcast-detail-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>

        {loading && (
          <div className="podcast-detail-loading">Loading...</div>
        )}

        {error && (
          <div className="podcast-detail-error">{error}</div>
        )}

        {!loading && !error && data && (
          <>
            <div className="podcast-detail-header">
              <div className="podcast-detail-cover">
                {resolvedCover ? (
                  <img src={resolvedCover} alt={meta?.title} />
                ) : (
                  <div className="podcast-detail-cover-placeholder">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                      <path d="M12 14c1.66 0 2.99-1.34 2.99-3s-1.33-3-2.99-3c-1.66 0-3 1.34-3 3s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V22h14v-2.5c0-2.33-4.67-3.5-7-3.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                    </svg>
                  </div>
                )}
              </div>
              <div className="podcast-detail-info">
                <h2>{meta?.title || 'Unknown Podcast'}</h2>
                {meta?.author && <p className="podcast-detail-author">{meta.author}</p>}
                {meta?.genres && meta.genres.length > 0 && (
                  <div className="podcast-detail-genres">
                    {meta.genres.map((g: string) => (
                      <span key={g} className="genre-tag">{g}</span>
                    ))}
                  </div>
                )}
                <p className="podcast-detail-episode-count">
                  {episodes.length} episode{episodes.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {meta?.description && (
              <p className="podcast-detail-description">{meta.description}</p>
            )}

            <div className="podcast-detail-episodes">
              <h3>Episodes</h3>
              <div className="podcast-detail-episode-list">
                {sortedEpisodes.map((ep) => (
                  <button
                    key={ep.id}
                    className="podcast-detail-episode"
                    onClick={() => playEpisode(ep)}
                  >
                    <div className="episode-main">
                      <span className="episode-title">{ep.title}</span>
                      <div className="episode-meta">
                        {ep.publishedAt && (
                          <span>{formatDate(ep.publishedAt)}</span>
                        )}
                        {ep.audioFile?.duration && (
                          <span>{formatDuration(ep.audioFile.duration)}</span>
                        )}
                      </div>
                    </div>
                    <div className="episode-play-icon">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
