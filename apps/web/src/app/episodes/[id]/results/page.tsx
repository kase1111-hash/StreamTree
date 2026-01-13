'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { episodesApi } from '@/lib/api';
import { Leaderboard } from '@/components/Leaderboard';
import { clsx } from 'clsx';

interface EpisodeResults {
  id: string;
  name: string;
  artworkUrl: string | null;
  status: string;
  cardsMinted: number;
  totalRevenue: number;
  launchedAt: string;
  endedAt: string;
  streamer: {
    id: string;
    username: string;
    displayName: string | null;
  };
  leaderboard: any[];
  eventsFired: number;
  totalEvents: number;
}

export default function EpisodeResultsPage() {
  const params = useParams();
  const router = useRouter();
  const episodeId = params.id as string;
  const { user, token } = useAuth();

  const [results, setResults] = useState<EpisodeResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConfetti, setShowConfetti] = useState(true);

  const isStreamer = user?.id === results?.streamer.id;

  useEffect(() => {
    loadResults();
    // Hide confetti after 5 seconds
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, [episodeId, token]);

  const loadResults = async () => {
    try {
      const data = await episodesApi.getResults(episodeId, token || undefined);
      setResults(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load results');
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto mb-4" />
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mx-auto mb-8" />
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded mb-8" />
        </div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-2">Results not available</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error || 'Episode not found'}</p>
          <Link href="/" className="text-primary-600 hover:underline">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  if (results.status !== 'ended') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-2">Episode still in progress</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Results will be available when the episode ends.
          </p>
          {results.status === 'live' && (
            <Link
              href={isStreamer ? `/dashboard/${episodeId}` : `/play/${results.id}`}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              {isStreamer ? 'Go to Dashboard' : 'Join Episode'}
            </Link>
          )}
        </div>
      </div>
    );
  }

  const duration = results.endedAt && results.launchedAt
    ? Math.round((new Date(results.endedAt).getTime() - new Date(results.launchedAt).getTime()) / 60000)
    : 0;

  return (
    <div className="min-h-screen">
      {/* Confetti */}
      {showConfetti && (
        <div className="confetti-container">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute text-2xl animate-float-away"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-20px',
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${3 + Math.random() * 2}s`,
              }}
            >
              {['🎉', '✨', '🎊', '⭐', '🏆'][Math.floor(Math.random() * 5)]}
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-b from-primary-600 to-primary-700 text-white py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-5xl mb-4">🎬</div>
          <h1 className="text-4xl font-bold mb-2">That&apos;s a Wrap!</h1>
          <p className="text-xl opacity-90">{results.name}</p>
          <p className="opacity-75 mt-2">
            by {results.streamer.displayName || results.streamer.username}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-4xl mx-auto px-4 -mt-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg text-center">
            <div className="text-3xl font-bold text-primary-600">{results.cardsMinted}</div>
            <div className="text-sm text-gray-500">Cards Minted</div>
          </div>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg text-center">
            <div className="text-3xl font-bold text-accent-600">{results.eventsFired}</div>
            <div className="text-sm text-gray-500">Events Fired</div>
          </div>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg text-center">
            <div className="text-3xl font-bold text-green-600">{duration}m</div>
            <div className="text-sm text-gray-500">Duration</div>
          </div>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg text-center">
            <div className="text-3xl font-bold text-yellow-600">
              {results.leaderboard[0]?.markedSquares || 0}
            </div>
            <div className="text-sm text-gray-500">Top Score</div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Winner spotlight */}
        {results.leaderboard.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-center mb-6">Winner</h2>
            <div className="bg-gradient-to-r from-yellow-100 via-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:via-yellow-900/20 dark:to-yellow-900/30 p-8 rounded-2xl text-center">
              <div className="text-6xl mb-4">🏆</div>
              <div className="text-2xl font-bold mb-2">
                {results.leaderboard[0].username}
              </div>
              <div className="text-4xl font-bold text-yellow-600 mb-2">
                {results.leaderboard[0].markedSquares} squares
              </div>
              {results.leaderboard[0].patterns?.length > 0 && (
                <div className="text-sm text-yellow-700 dark:text-yellow-400">
                  {results.leaderboard[0].patterns.length} pattern
                  {results.leaderboard[0].patterns.length !== 1 ? 's' : ''} completed
                </div>
              )}
            </div>
          </div>
        )}

        {/* Full leaderboard */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Final Standings</h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-4">
            <Leaderboard
              entries={results.leaderboard}
              currentUserId={user?.id}
              maxEntries={20}
              animate={false}
            />
          </div>
        </div>

        {/* Streamer actions */}
        {isStreamer && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Streamer Actions</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Link
                href="/settings/payments"
                className="flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-400 transition"
              >
                <div className="text-2xl">💰</div>
                <div>
                  <div className="font-medium">Withdraw Earnings</div>
                  <div className="text-sm text-gray-500">
                    ${(results.totalRevenue / 100).toFixed(2)} earned
                  </div>
                </div>
              </Link>
              <Link
                href="/create"
                className="flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-400 transition"
              >
                <div className="text-2xl">🎬</div>
                <div>
                  <div className="font-medium">Create New Episode</div>
                  <div className="text-sm text-gray-500">Start another show</div>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* Call to action */}
        <div className="text-center">
          {user ? (
            <Link
              href="/gallery"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition"
            >
              <span>View Your Card</span>
              <span>→</span>
            </Link>
          ) : (
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition"
            >
              <span>Sign in to view your card</span>
              <span>→</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
