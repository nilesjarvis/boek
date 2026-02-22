import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Library, LibraryItem as LibraryItemType, MediaProgress } from '../services/api';
import { absApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { usePlayerStore } from '../stores/playerStore';
import { useFavouritesStore } from '../stores/favouritesStore';
import Podcasts from './Podcasts';
import './Library.css';

export default function Library() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLib, setSelectedLib] = useState<Library | null>(null);
  const [items, setItems] = useState<LibraryItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemProgress, setItemProgress] = useState<Record<string, MediaProgress>>({});
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { setCurrentItem, setCurrentEpisode } = usePlayerStore();
  const { favouriteIds, toggleFavourite, isFavourite } = useFavouritesStore();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadLibraries();
  }, [isAuthenticated, navigate]);

  const loadLibraries = async () => {
    try {
      const libs = await absApi.getLibraries();
      setLibraries(libs);
      if (libs.length > 0) {
        setSelectedLib(libs[0]);
      }
    } catch (err) {
      console.error('Failed to load libraries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedLib) {
      // Clear stale items immediately so old content doesn't flash
      setItems([]);
      setItemProgress({});
      if (selectedLib.mediaType !== 'podcast') {
        setItemsLoading(true);
        loadItems(selectedLib.id);
      }
    }
  }, [selectedLib]);

  // Refresh progress when page gains focus
  useEffect(() => {
    const handleFocus = () => {
      if (selectedLib) {
        loadItems(selectedLib.id);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [selectedLib]);

  // Keyboard shortcuts: 'b' for books, 'p' for podcasts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'b') {
        const bookLib = libraries.find(lib => lib.mediaType === 'book');
        if (bookLib && selectedLib?.id !== bookLib.id) {
          e.preventDefault();
          setSelectedLib(bookLib);
        }
      } else if (e.key === 'p') {
        const podcastLib = libraries.find(lib => lib.mediaType === 'podcast');
        if (podcastLib && selectedLib?.id !== podcastLib.id) {
          e.preventDefault();
          setSelectedLib(podcastLib);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [libraries, selectedLib]);

  const loadItems = async (libraryId: string) => {
    try {
      const itemsData = await absApi.getLibraryItems(libraryId);
      setItems(itemsData);
      setItemsLoading(false);
      
      // Fetch progress for each item
      const progressMap: Record<string, MediaProgress> = {};
      await Promise.all(
        itemsData.map(async (item) => {
          try {
            const progress = await absApi.getPlaybackProgress(item.id);
            if (progress) {
              progressMap[item.id] = progress;
            }
          } catch (err) {
            console.error(`Failed to load progress for ${item.id}:`, err);
          }
        })
      );
      setItemProgress(progressMap);
    } catch (err) {
      console.error('Failed to load items:', err);
      setItemsLoading(false);
    }
  };

  const playItem = useCallback((item: LibraryItemType) => {
    const user = useAuthStore.getState().user;
    const serverUrl = useAuthStore.getState().serverUrl;
    const title = item.media?.metadata?.title || item.title;
    const author = item.media?.metadata?.authorName || item.authorName;
    const coverPath = item.media?.coverPath || item.coverPath;
    // Explicitly clear any stale podcast episode before loading a book
    setCurrentEpisode(null);
    setCurrentItem({
      id: item.id,
      title,
      author,
      coverUrl: coverPath
        ? `${serverUrl}/api/items/${item.id}/cover?token=${user?.token}`
        : undefined,
    });
    usePlayerStore.getState().setIsPlaying(true);
  }, [setCurrentItem, setCurrentEpisode]);

  // Split items into favourites and the rest
  const { favouriteItems, otherItems } = useMemo(() => {
    const favSet = new Set(favouriteIds);
    const favs: LibraryItemType[] = [];
    const rest: LibraryItemType[] = [];
    for (const item of items) {
      if (favSet.has(item.id)) {
        favs.push(item);
      } else {
        rest.push(item);
      }
    }
    return { favouriteItems: favs, otherItems: rest };
  }, [items, favouriteIds]);

  const hasFavourites = favouriteItems.length > 0;

  // Shared rendering for a single library item card
  const renderItem = useCallback((item: LibraryItemType) => {
    const title = item.media?.metadata?.title || item.title;
    const author = item.media?.metadata?.authorName || item.authorName;
    const coverPath = item.media?.coverPath || item.coverPath;
    const progress = itemProgress[item.id];
    const isFinished = progress?.isFinished || false;
    const progressValue = progress?.progress || 0;
    const favourited = isFavourite(item.id);

    return (
      <div
        key={item.id}
        className={`library-item ${isFinished ? 'finished' : ''}`}
        onClick={() => playItem(item)}
      >
        <div className="item-cover">
          {coverPath ? (
            <img
              src={`${useAuthStore.getState().serverUrl}/api/items/${item.id}/cover?token=${useAuthStore.getState().user?.token}`}
              alt={title}
            />
          ) : (
            <div className="item-cover-placeholder">
              <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
          {progressValue > 0 && (
            <div className="item-progress">
              <div className="item-progress-bar" style={{ width: `${progressValue * 100}%` }} />
            </div>
          )}
          {isFinished && (
            <div className="item-finished-badge">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
              </svg>
            </div>
          )}
          <button
            className={`item-favourite-button ${favourited ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavourite(item.id);
            }}
            aria-label={favourited ? 'Remove from favourites' : 'Add to favourites'}
            title={favourited ? 'Remove from favourites' : 'Add to favourites'}
          >
            {favourited ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/>
              </svg>
            )}
          </button>
        </div>
        <div className="item-info">
          <h3 className="item-title">{title}</h3>
          {author && (
            <p className="item-author">{author}</p>
          )}
          {progressValue > 0 && (
            <p className="item-progress-text">
              {isFinished ? 'Finished' : `${Math.round(progressValue * 100)}%`}
            </p>
          )}
        </div>
      </div>
    );
  }, [itemProgress, isFavourite, toggleFavourite, playItem]);

  // --- Library tabs (shared across all return paths) ---
  const libraryTabs = (
    <div className="library-tabs">
      {libraries.map((lib) => (
        <button
          key={lib.id}
          className={`lib-tab ${selectedLib?.id === lib.id ? 'active' : ''}`}
          onClick={() => setSelectedLib(lib)}
        >
          {lib.name}
          <kbd className="shortcut-hint">{lib.mediaType === 'book' ? 'B' : 'P'}</kbd>
        </button>
      ))}
    </div>
  );

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (libraries.length === 0) {
    return (
      <div className="library">
        <div className="empty-state">
          <p>No libraries found on server</p>
        </div>
      </div>
    );
  }

  // If this is a podcast library, show the podcast component instead
  if (selectedLib?.mediaType === 'podcast') {
    return (
      <div className="library">
        {libraryTabs}
        <Podcasts libraryId={selectedLib.id} />
      </div>
    );
  }

  if (itemsLoading || items.length === 0) {
    return (
      <div className="library">
        {libraryTabs}
        <div className="empty-state">
          {itemsLoading ? <p>Loading...</p> : <p>No items in this library</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="library">
      {libraryTabs}

      {hasFavourites && (
        <>
          <h2 className="library-section-header">Favourites</h2>
          <div className="library-items">
            {favouriteItems.map(renderItem)}
          </div>
          <h2 className="library-section-header">All Books</h2>
        </>
      )}

      <div className="library-items">
        {otherItems.map(renderItem)}
      </div>
    </div>
  );
}
