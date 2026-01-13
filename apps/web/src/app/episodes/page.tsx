'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { episodesApi } from '@/lib/api';

interface Episode {
  id: string;
  name: string;
  status: string;
  cardsMinted: number;
  shareCode: string;
  createdAt: string;
  launchedAt: string | null;
  endedAt: string | null;
}

export default function EpisodesPage() {
  const { user, token } = useAuth();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      loadEpisodes();
    }
  }, [token]);

  const loadEpisodes = async () => {
    if (!token) return;

    try {
      const data = await episodesApi.list(token);
      setEpisodes(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load episodes');
    }
    setLoading(false);
  };

  if (!user || !user.isStreamer) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Streamer Access Required</h1>
          <Link
            href="/auth/become-streamer"
            className="px-6 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition"
          >
            Become a Streamer
          </Link>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded">Draft</span>;
      case 'live':
        return <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 text-xs rounded animate-pulse">Live</span>;
      case 'ended':
        return <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-xs rounded">Ended</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">{status}</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">My Episodes</h1>
        <Link
          href="/create"
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
        >
          Create New
        </Link>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 p-6 rounded-lg animate-pulse">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600">
          {error}
        </div>
      ) : episodes.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">No episodes yet</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Create your first episode to get started
          </p>
          <Link
            href="/create"
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Create Episode
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {episodes.map((episode) => (
            <div
              key={episode.id}
              className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow hover:shadow-md transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl font-semibold">{episode.name}</h2>
                    {getStatusBadge(episode.status)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {episode.cardsMinted} cards minted
                    {episode.launchedAt && (
                      <> · Launched {new Date(episode.launchedAt).toLocaleDateString()}</>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {episode.status === 'draft' && (
                    <Link
                      href={`/create?edit=${episode.id}`}
                      className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                    >
                      Edit
                    </Link>
                  )}
                  {episode.status === 'live' && (
                    <Link
                      href={`/dashboard/${episode.id}`}
                      className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition"
                    >
                      Dashboard
                    </Link>
                  )}
                  {episode.status === 'ended' && (
                    <Link
                      href={`/episodes/${episode.id}/results`}
                      className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                    >
                      Results
                    </Link>
                  )}
                </div>
              </div>
              {episode.status === 'live' && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded">
                  <div className="text-sm text-gray-500 mb-1">Share link:</div>
                  <code className="text-sm text-primary-600">
                    {typeof window !== 'undefined' && window.location.origin}/play/{episode.shareCode}
                  </code>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
