import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/stores/authStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useFavouritesStore } from '@/stores/favouritesStore';
import { absApi } from '@/services/api';
import type { Library, SearchResult } from '@/services/api';
import PodcastDetail from './PodcastDetail';
import './Search.css';

interface ProcessedBook {
  libraryItemId: string;
  title: string;
  author: string;
  coverUrl?: string;
  narrator?: string;
  duration?: number;
}

interface ProcessedEpisode {
  libraryItemId: string;
  episodeId: string;
  title: string;
  podcastTitle: string;
  author: string;
  coverUrl?: string;
  publishedAt?: number;
  duration?: number;
}

interface ProcessedPodcast {
  libraryItemId: string;
  title: string;
  author: string;
  coverUrl?: string;
  recentEpisode?: { id: string; title: string };
}

// Aggregated results across all libraries
interface MergedResults {
  books: ProcessedBook[];
  podcasts: ProcessedPodcast[];
  episodes: ProcessedEpisode[];
  authors: { name: string }[];
  series: { name: string }[];
}

function buildCoverUrl(itemId: string): string {
  const { serverUrl, user } = useAuthStore.getState();
  return `${serverUrl}/api/items/${itemId}/cover?token=${user?.token}`;
}

export default function Search() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rawResults, setRawResults] = useState<{ library: Library; data: SearchResult }[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { playItem: playStoreItem } = usePlayerStore();
  const { isFavourite, toggleFavourite } = useFavouritesStore();
  const [detailPodcast, setDetailPodcast] = useState<{ itemId: string; coverUrl: string | null } | null>(null);

  // Fetch libraries once on first open
  const fetchLibraries = useCallback(async () => {
    if (libraries.length > 0) return;
    try {
      const libs = await absApi.getLibraries();
      setLibraries(libs);
    } catch (err) {
      console.error('Failed to fetch libraries for search:', err);
    }
  }, [libraries.length]);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl/Cmd+K or 's' (when not in an input) opens search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        fetchLibraries();
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (
        e.key === 's' &&
        !isOpen &&
        !e.metaKey && !e.ctrlKey && !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setIsOpen(true);
        fetchLibraries();
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, fetchLibraries]);

  // Search across all libraries
  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setRawResults([]);
      return;
    }

    setLoading(true);
    try {
      const results = await Promise.all(
        libraries.map(async (lib) => {
          try {
            const data = await absApi.searchLibrary(lib.id, searchQuery);
            return { library: lib, data };
          } catch (err) {
            console.error(`Search failed for library ${lib.name}:`, err);
            return { library: lib, data: {} as SearchResult };
          }
        })
      );
      setRawResults(results);
    } catch (err) {
      console.error('Search failed:', err);
      setRawResults([]);
    } finally {
      setLoading(false);
    }
  }, [libraries]);

  // Debounce search
  useEffect(() => {
    if (!query) {
      setRawResults([]);
      return;
    }
    const timer = setTimeout(() => {
      handleSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, handleSearch]);

  // Process and merge results from all libraries
  const merged: MergedResults = useMemo(() => {
    const books: ProcessedBook[] = [];
    const podcasts: ProcessedPodcast[] = [];
    const episodes: ProcessedEpisode[] = [];
    const authorSet = new Set<string>();
    const seriesSet = new Set<string>();

    for (const { data } of rawResults) {
      // Books
      if (data.book && Array.isArray(data.book)) {
        for (const item of data.book) {
          // The ABS search API wraps results: item.libraryItem is the actual item
          const li = item.libraryItem || item;
          const meta = li.media?.metadata;
          books.push({
            libraryItemId: li.id,
            title: meta?.title || li.title || 'Unknown',
            author: meta?.authorName || meta?.author || li.authorName || '',
            coverUrl: li.media?.coverPath ? buildCoverUrl(li.id) : undefined,
            narrator: meta?.narrator,
            duration: li.media?.duration,
          });
        }
      }

      // Podcasts
      if (data.podcast && Array.isArray(data.podcast)) {
        for (const item of data.podcast) {
          const li = item.libraryItem || item;
          const meta = li.media?.metadata;
          const recent = li.recentEpisode;
          podcasts.push({
            libraryItemId: li.id,
            title: meta?.title || li.title || 'Unknown Podcast',
            author: meta?.author || '',
            coverUrl: li.media?.coverPath ? buildCoverUrl(li.id) : undefined,
            recentEpisode: recent ? { id: recent.id, title: recent.title } : undefined,
          });
        }
      }

      // Episodes
      if (data.episodes && Array.isArray(data.episodes)) {
        for (const result of data.episodes) {
          const li = result.libraryItem;
          if (!li) continue;
          const meta = li.media?.metadata;
          const ep = li.recentEpisode;
          if (!ep) continue;
          episodes.push({
            libraryItemId: li.id,
            episodeId: ep.id,
            title: ep.title || 'Unknown Episode',
            podcastTitle: meta?.title || 'Unknown Podcast',
            author: meta?.author || '',
            coverUrl: li.media?.coverPath ? buildCoverUrl(li.id) : undefined,
            publishedAt: ep.publishedAt,
            duration: ep.duration || ep.audioFile?.duration,
          });
        }
      }

      // Authors
      if (data.authors && Array.isArray(data.authors)) {
        for (const a of data.authors) {
          const name = a.name || a.libraryItem?.media?.metadata?.authorName;
          if (name) authorSet.add(name);
        }
      }

      // Series
      if (data.series && Array.isArray(data.series)) {
        for (const s of data.series) {
          const name = s.name || s.series?.name;
          if (name) seriesSet.add(name);
        }
      }
    }

    // Deduplicate episodes by episodeId
    const uniqueEpisodes = episodes.filter(
      (ep, idx, arr) => idx === arr.findIndex(e => e.episodeId === ep.episodeId)
    ).slice(0, 10);

    return {
      books: books.slice(0, 10),
      podcasts: podcasts.slice(0, 10),
      episodes: uniqueEpisodes,
      authors: Array.from(authorSet).map(name => ({ name })),
      series: Array.from(seriesSet).map(name => ({ name })),
    };
  }, [rawResults]);

  const hasResults = merged.books.length > 0 || merged.podcasts.length > 0 ||
    merged.episodes.length > 0 || merged.authors.length > 0 || merged.series.length > 0;

  // --- Action handlers ---

  const playBook = useCallback((book: ProcessedBook) => {
    playStoreItem({
      id: book.libraryItemId,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
    });
    usePlayerStore.getState().setIsPlaying(true);
    closeSearch();
  }, [playStoreItem]);

  const playEpisode = useCallback((episode: ProcessedEpisode) => {
    playStoreItem(
      {
        id: episode.libraryItemId,
        title: episode.title,
        author: `${episode.podcastTitle}${episode.author ? ` - ${episode.author}` : ''}`,
        coverUrl: episode.coverUrl,
      },
      { id: episode.episodeId, title: episode.title }
    );
    usePlayerStore.getState().setIsPlaying(true);
    closeSearch();
  }, [playStoreItem]);

  const openPodcastDetail = useCallback((podcast: ProcessedPodcast) => {
    setDetailPodcast({
      itemId: podcast.libraryItemId,
      coverUrl: podcast.coverUrl || null,
    });
  }, []);

  const closeSearch = () => {
    setIsOpen(false);
    setQuery('');
    setRawResults([]);
  };

  const openSearch = () => {
    setIsOpen(true);
    fetchLibraries();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <>
      <button
        className="icon-button search-button"
        onClick={openSearch}
        title="Search (S)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <kbd className="shortcut-hint">S</kbd>
      </button>

      {isOpen && createPortal(
        <div className="search-overlay">
          <div className="search-container" ref={searchRef}>
            <div className="search-header">
              <div className={`search-input-wrapper ${focused ? 'focused' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" className="search-icon">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search books, podcasts, and episodes..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  className="search-input"
                  autoFocus
                />
                {query && (
                  <button
                    className="search-clear"
                    onClick={() => {
                      setQuery('');
                      setRawResults([]);
                      inputRef.current?.focus();
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                )}
              </div>
              <button className="search-close" onClick={closeSearch}>
                <kbd>ESC</kbd>
              </button>
            </div>

            {loading && (
              <div className="search-loading">Searching...</div>
            )}

            {!loading && query && !hasResults && (
              <div className="search-results">
                <div className="search-empty">
                  No results found for &quot;{query}&quot;
                </div>
              </div>
            )}

            {!loading && hasResults && (
              <div className="search-results">

                {/* Books */}
                {merged.books.length > 0 && (
                  <div className="search-section">
                    <h3>Books</h3>
                    <div className="search-items">
                      {merged.books.map((book) => (
                        <div
                          key={book.libraryItemId}
                          className="search-item book-item"
                          onClick={() => playBook(book)}
                        >
                          <div className="item-cover">
                            {book.coverUrl && (
                              <img src={book.coverUrl} alt={book.title} />
                            )}
                          </div>
                          <div className="item-info">
                            <div className="item-title">{book.title}</div>
                            {book.author && <div className="item-author">{book.author}</div>}
                            {book.narrator && (
                              <div className="item-narrator">Narrated by {book.narrator}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Podcasts */}
                {merged.podcasts.length > 0 && (
                  <div className="search-section">
                    <h3>Podcasts</h3>
                    <div className="search-items">
                      {merged.podcasts.map((podcast) => (
                        <div
                          key={podcast.libraryItemId}
                          className="search-item podcast-item"
                          onClick={() => openPodcastDetail(podcast)}
                        >
                          <div className="item-cover">
                            {podcast.coverUrl && (
                              <img src={podcast.coverUrl} alt={podcast.title} />
                            )}
                            <button
                              className={`search-favourite-button ${isFavourite(podcast.libraryItemId) ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavourite(podcast.libraryItemId);
                              }}
                              aria-label={isFavourite(podcast.libraryItemId) ? 'Remove from favourites' : 'Add to favourites'}
                              title={isFavourite(podcast.libraryItemId) ? 'Remove from favourites' : 'Add to favourites'}
                            >
                              {isFavourite(podcast.libraryItemId) ? (
                                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                  <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/>
                                </svg>
                              )}
                            </button>
                          </div>
                          <div className="item-info">
                            <div className="item-title">{podcast.title}</div>
                            {podcast.author && <div className="item-author">{podcast.author}</div>}
                            {podcast.recentEpisode && (
                              <div className="item-subtitle">Latest: {podcast.recentEpisode.title}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Episodes */}
                {merged.episodes.length > 0 && (
                  <div className="search-section">
                    <h3>Episodes</h3>
                    <div className="search-items">
                      {merged.episodes.map((episode) => (
                        <div
                          key={`${episode.libraryItemId}-${episode.episodeId}`}
                          className="search-item episode-item"
                          onClick={() => playEpisode(episode)}
                        >
                          <div className="item-cover">
                            {episode.coverUrl && (
                              <img src={episode.coverUrl} alt={episode.title} />
                            )}
                          </div>
                          <div className="item-info">
                            <div className="item-title">{episode.title}</div>
                            <div className="item-subtitle">{episode.podcastTitle}</div>
                            {episode.publishedAt && (
                              <div className="item-date">
                                {new Date(episode.publishedAt).toLocaleDateString()}
                              </div>
                            )}
                            {episode.duration && (
                              <div className="item-duration">
                                {Math.floor(episode.duration / 60)} min
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Authors */}
                {merged.authors.length > 0 && (
                  <div className="search-section">
                    <h3>Authors</h3>
                    <div className="search-items">
                      {merged.authors.map((author) => (
                        <div key={author.name} className="search-item author-item">
                          <div className="item-cover author-avatar">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                            </svg>
                          </div>
                          <div className="item-info">
                            <div className="item-title">{author.name}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Series */}
                {merged.series.length > 0 && (
                  <div className="search-section">
                    <h3>Series</h3>
                    <div className="search-items">
                      {merged.series.map((s) => (
                        <div key={s.name} className="search-item series-item">
                          <div className="item-cover series-icon">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
                            </svg>
                          </div>
                          <div className="item-info">
                            <div className="item-title">{s.name}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {detailPodcast && createPortal(
        <PodcastDetail
          itemId={detailPodcast.itemId}
          coverUrl={detailPodcast.coverUrl}
          onClose={() => setDetailPodcast(null)}
        />,
        document.body
      )}
    </>
  );
}
