import { useEffect, useState, useMemo, useCallback } from 'react';
import { absApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { ListeningStats, ListeningStatsItem, ListeningSession } from '../services/api';
import './Stats.css';

type TabId = 'overview' | 'items' | 'sessions';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatDurationLong(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getItemAuthor(item: ListeningStatsItem): string {
  const meta = item.mediaMetadata;
  if (meta.author) return meta.author;
  if (meta.authors?.length) return meta.authors.map(a => a.name).join(', ');
  return '';
}

function getItemType(item: ListeningStatsItem): 'podcast' | 'book' {
  const t = item.mediaMetadata.type;
  return t === 'episodic' || t === 'serial' ? 'podcast' : 'book';
}

function getItemCoverUrl(item: ListeningStatsItem): string | null {
  return item.mediaMetadata.imageUrl || null;
}

export default function Stats() {
  const [stats, setStats] = useState<ListeningStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const { serverUrl, user } = useAuthStore();

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await absApi.getListeningStats();
      setStats(data);
    } catch (err) {
      console.error('[Stats] Failed to load listening stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Derived data
  const sortedItems = useMemo(() => {
    if (!stats) return [];
    return Object.values(stats.items).sort((a, b) => b.timeListening - a.timeListening);
  }, [stats]);

  const topItems = useMemo(() => sortedItems.slice(0, 10), [sortedItems]);

  const { bookCount, podcastCount, bookTime, podcastTime } = useMemo(() => {
    if (!stats) return { bookCount: 0, podcastCount: 0, bookTime: 0, podcastTime: 0 };
    let bc = 0, pc = 0, bt = 0, pt = 0;
    for (const item of Object.values(stats.items)) {
      if (getItemType(item) === 'podcast') {
        pc++;
        pt += item.timeListening;
      } else {
        bc++;
        bt += item.timeListening;
      }
    }
    return { bookCount: bc, podcastCount: pc, bookTime: bt, podcastTime: pt };
  }, [stats]);

  // Daily chart data - last 30 days
  const dailyData = useMemo(() => {
    if (!stats) return [];
    const entries = Object.entries(stats.days)
      .map(([date, seconds]) => ({ date, seconds }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return entries.slice(-30);
  }, [stats]);

  const maxDailySeconds = useMemo(() => {
    return Math.max(...dailyData.map(d => d.seconds), 1);
  }, [dailyData]);

  // Day of week data, ordered Mon-Sun
  const weekdayData = useMemo(() => {
    if (!stats) return [];
    const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return order.map(day => ({
      day: day.slice(0, 3),
      dayFull: day,
      seconds: stats.dayOfWeek[day] || 0,
    }));
  }, [stats]);

  const maxWeekdaySeconds = useMemo(() => {
    return Math.max(...weekdayData.map(d => d.seconds), 1);
  }, [weekdayData]);

  // Average daily listening
  const avgDaily = useMemo(() => {
    if (!stats || dailyData.length === 0) return 0;
    const total = dailyData.reduce((sum, d) => sum + d.seconds, 0);
    return total / dailyData.length;
  }, [stats, dailyData]);

  // Streak (consecutive days)
  const streak = useMemo(() => {
    if (!stats) return 0;
    const sortedDays = Object.keys(stats.days).sort().reverse();
    if (sortedDays.length === 0) return 0;
    let count = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      const prev = new Date(sortedDays[i - 1] + 'T00:00:00');
      const curr = new Date(sortedDays[i] + 'T00:00:00');
      const diff = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }, [stats]);

  const getCoverUrl = useCallback((libraryItemId: string): string | undefined => {
    if (!serverUrl || !user?.token) return undefined;
    return `${serverUrl}/api/items/${libraryItemId}/cover?token=${user.token}`;
  }, [serverUrl, user]);

  if (loading) {
    return <div className="loading">Loading stats...</div>;
  }

  if (error) {
    return (
      <div className="stats">
        <div className="stats-error">
          <p>Failed to load listening stats</p>
          <p className="stats-error-detail">{error}</p>
          <button className="stats-retry-button" onClick={loadStats}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="stats">
      <div className="stats-tabs">
        {([
          { id: 'overview' as TabId, label: 'Overview' },
          { id: 'items' as TabId, label: 'Library' },
          { id: 'sessions' as TabId, label: 'Recent Sessions' },
        ]).map(tab => (
          <button
            key={tab.id}
            className={`stats-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="stats-overview">
          {/* Summary cards */}
          <div className="stats-cards">
            <div className="stats-card">
              <span className="stats-card-label">Total Listening</span>
              <span className="stats-card-value">{formatDurationLong(stats.totalTime)}</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-label">Today</span>
              <span className="stats-card-value">{formatDuration(stats.today)}</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-label">Daily Average</span>
              <span className="stats-card-value">{formatDuration(avgDaily)}</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-label">Current Streak</span>
              <span className="stats-card-value">{streak} {streak === 1 ? 'day' : 'days'}</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-label">Books</span>
              <span className="stats-card-value">{bookCount}</span>
              <span className="stats-card-sub">{formatDuration(bookTime)}</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-label">Podcasts</span>
              <span className="stats-card-value">{podcastCount}</span>
              <span className="stats-card-sub">{formatDuration(podcastTime)}</span>
            </div>
          </div>

          {/* Daily chart */}
          <div className="stats-section">
            <h2 className="stats-section-title">Last 30 Days</h2>
            <div className="stats-chart">
              <div className="stats-chart-bars">
                {dailyData.map(d => (
                  <div key={d.date} className="stats-chart-col" title={`${formatDate(d.date)}: ${formatDuration(d.seconds)}`}>
                    <div
                      className="stats-chart-bar"
                      style={{ height: `${(d.seconds / maxDailySeconds) * 100}%` }}
                    />
                    <span className="stats-chart-label">
                      {formatDate(d.date)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Day of week chart */}
          <div className="stats-section">
            <h2 className="stats-section-title">By Day of Week</h2>
            <div className="stats-weekday-chart">
              {weekdayData.map(d => (
                <div key={d.day} className="stats-weekday-row" title={`${d.dayFull}: ${formatDuration(d.seconds)}`}>
                  <span className="stats-weekday-label">{d.day}</span>
                  <div className="stats-weekday-bar-track">
                    <div
                      className="stats-weekday-bar-fill"
                      style={{ width: `${(d.seconds / maxWeekdaySeconds) * 100}%` }}
                    />
                  </div>
                  <span className="stats-weekday-value">{formatDuration(d.seconds)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top 10 */}
          <div className="stats-section">
            <h2 className="stats-section-title">Top 10</h2>
            <div className="stats-top-list">
              {topItems.map((item, i) => {
                const author = getItemAuthor(item);
                const type = getItemType(item);
                const coverUrl = getItemCoverUrl(item) || getCoverUrl(item.id);
                return (
                  <div key={item.id} className="stats-top-item">
                    <span className="stats-top-rank">#{i + 1}</span>
                    <div className="stats-top-cover">
                      {coverUrl ? (
                        <img src={coverUrl} alt={item.mediaMetadata.title} />
                      ) : (
                        <div className="stats-top-cover-placeholder">
                          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="stats-top-info">
                      <span className="stats-top-title">{item.mediaMetadata.title}</span>
                      {author && <span className="stats-top-author">{author}</span>}
                    </div>
                    <span className={`stats-top-type stats-type-${type}`}>{type}</span>
                    <span className="stats-top-time">{formatDuration(item.timeListening)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'items' && (
        <div className="stats-items">
          <p className="stats-items-count">{sortedItems.length} items listened to</p>
          <div className="stats-items-list">
            {sortedItems.map(item => {
              const author = getItemAuthor(item);
              const type = getItemType(item);
              const coverUrl = getItemCoverUrl(item) || getCoverUrl(item.id);
              return (
                <div key={item.id} className="stats-item-row">
                  <div className="stats-item-cover">
                    {coverUrl ? (
                      <img src={coverUrl} alt={item.mediaMetadata.title} />
                    ) : (
                      <div className="stats-top-cover-placeholder">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="stats-item-info">
                    <span className="stats-item-title">{item.mediaMetadata.title}</span>
                    {author && <span className="stats-item-author">{author}</span>}
                  </div>
                  <span className={`stats-top-type stats-type-${type}`}>{type}</span>
                  <span className="stats-item-time">{formatDuration(item.timeListening)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="stats-sessions">
          <div className="stats-sessions-list">
            {stats.recentSessions.map((session: ListeningSession) => {
              const coverUrl = getCoverUrl(session.libraryItemId);
              return (
                <div key={session.id} className="stats-session-row">
                  <div className="stats-session-cover">
                    {coverUrl ? (
                      <img src={coverUrl} alt={session.displayTitle} />
                    ) : (
                      <div className="stats-top-cover-placeholder">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="stats-session-info">
                    <span className="stats-session-title">{session.displayTitle}</span>
                    <span className="stats-session-author">{session.displayAuthor}</span>
                    <div className="stats-session-meta">
                      <span className={`stats-top-type stats-type-${session.mediaType}`}>
                        {session.mediaType}
                      </span>
                      <span className="stats-session-device">
                        {session.deviceInfo?.clientName || 'Unknown client'}
                      </span>
                    </div>
                  </div>
                  <div className="stats-session-right">
                    <span className="stats-session-time">{formatDuration(session.timeListening)}</span>
                    <span className="stats-session-date">{formatTimestamp(session.updatedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
