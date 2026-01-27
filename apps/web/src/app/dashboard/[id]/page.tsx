'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { episodesApi } from '@/lib/api';
import { useWebSocket, useEpisodeEvents } from '@/lib/websocket';
import { EventGridDisplay } from '@/components/EventGrid';
import { LeaderboardCompact } from '@/components/Leaderboard';

interface Episode {
  id: string;
  name: string;
  status: string;
  cardsMinted: number;
  totalRevenue: number;
  shareCode: string;
  eventDefinitions: EventDef[];
}

interface EventDef {
  id: string;
  name: string;
  icon: string;
  firedAt: string | null;
  firedCount: number;
}

interface Stats {
  cardsMinted: number;
  totalRevenue: number;
  eventsTriggered: number;
  leaderboard: any[];
}

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const episodeId = params.id as string;
  const { token } = useAuth();
  const { connected } = useWebSocket(token);

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (token && episodeId) {
      loadEpisode();
      loadStats();
    }
  }, [token, episodeId]);

  const loadEpisode = async () => {
    if (!token) return;

    try {
      const data = await episodesApi.get(episodeId, token);
      setEpisode(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load episode');
    }
    setLoading(false);
  };

  const loadStats = async () => {
    if (!token) return;

    try {
      const data = await episodesApi.getStats(episodeId, token);
      setStats(data);
    } catch (err: any) {
      console.error('Failed to load stats:', err);
    }
  };

  // Handle real-time updates
  const handleEpisodeEvent = useCallback((event: any) => {
    if (event.type === 'stats:update') {
      setStats((prev) => ({
        ...prev!,
        cardsMinted: event.cardsMinted,
        totalRevenue: event.revenue,
        leaderboard: event.leaderboard,
      }));
    } else if (event.type === 'event:fired') {
      setEpisode((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          eventDefinitions: prev.eventDefinitions.map((e) =>
            e.id === event.eventId
              ? { ...e, firedAt: event.timestamp, firedCount: (e.firedCount || 0) + 1 }
              : e
          ),
        };
      });
      loadStats();
    } else if (event.type === 'episode:state' && event.status === 'ended') {
      router.push(`/episodes/${episodeId}/results`);
    }
  }, [episodeId, router]);

  useEpisodeEvents(episodeId, handleEpisodeEvent);

  const handleFireEvent = async (eventId: string) => {
    if (!token) return;

    try {
      await episodesApi.fireEvent(episodeId, eventId, token);
      // UI will update via WebSocket
    } catch (err: any) {
      setError(err.message || 'Failed to fire event');
    }
  };

  const handleEndShow = async () => {
    if (!token || !confirm('Are you sure you want to end this episode? This cannot be undone.')) {
      return;
    }

    setEnding(true);
    try {
      await episodesApi.end(episodeId, token);
      router.push(`/episodes/${episodeId}/results`);
    } catch (err: any) {
      setError(err.message || 'Failed to end episode');
    }
    setEnding(false);
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-8" />
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-2">Episode not found</h1>
          <Link href="/episodes" className="text-primary-600 hover:underline">
            Back to episodes
          </Link>
        </div>
      </div>
    );
  }

  if (episode.status !== 'live') {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-2">Episode is not live</h1>
          <p className="text-gray-600 mb-4">Status: {episode.status}</p>
          <Link href="/episodes" className="text-primary-600 hover:underline">
            Back to episodes
          </Link>
        </div>
      </div>
    );
  }

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/play/${episode.shareCode}`
    : `/play/${episode.shareCode}`;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{episode.name}</h1>
            <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 rounded-full text-sm animate-pulse">
              LIVE
            </span>
            {connected && (
              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded text-xs">
                Connected
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>Share link:</span>
            <code className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">{shareUrl}</code>
            <button
              onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="text-primary-600 hover:underline"
            >
              Copy
            </button>
          </div>
        </div>
        <button
          onClick={handleEndShow}
          disabled={ending}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
        >
          {ending ? 'Ending...' : 'End Show'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-1">Cards Minted</div>
          <div className="text-3xl font-bold text-primary-600">
            {stats?.cardsMinted || episode.cardsMinted}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-1">Events Fired</div>
          <div className="text-3xl font-bold text-accent-600">
            {episode.eventDefinitions.filter((e) => e.firedAt).length}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-1">Total Events</div>
          <div className="text-3xl font-bold">{episode.eventDefinitions.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-1">Revenue</div>
          <div className="text-3xl font-bold text-green-600">
            ${((stats?.totalRevenue || 0) / 100).toFixed(2)}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Events */}
        <div className="md:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Fire Events</h2>
          <EventGridDisplay
            events={episode.eventDefinitions}
            onFire={handleFireEvent}
          />
        </div>

        {/* Leaderboard */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Leaderboard</h2>
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow">
            {stats?.leaderboard && stats.leaderboard.length > 0 ? (
              <LeaderboardCompact entries={stats.leaderboard} />
            ) : (
              <div className="text-center py-4 text-gray-500">
                No cards yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
