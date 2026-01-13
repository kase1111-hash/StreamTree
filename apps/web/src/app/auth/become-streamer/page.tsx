'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function BecomeStreamerPage() {
  const router = useRouter();
  const { user, becomeStreamer } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect if not logged in
  if (!user) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Sign in first</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            You need to be signed in to become a streamer.
          </p>
          <Link
            href="/auth/login"
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  // Already a streamer
  if (user.isStreamer) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">You&apos;re already a streamer!</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Start creating episodes for your audience.
          </p>
          <Link
            href="/create"
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Create Episode
          </Link>
        </div>
      </div>
    );
  }

  const handleBecomeStreamer = async () => {
    setLoading(true);
    setError('');

    try {
      await becomeStreamer();
      router.push('/create');
    } catch (err: any) {
      setError(err.message || 'Failed to upgrade account');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Become a Streamer</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Unlock the ability to create interactive bingo episodes
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">What you&apos;ll get:</h2>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="text-primary-600 mt-0.5">✓</span>
                <div>
                  <div className="font-medium">Create Episodes</div>
                  <div className="text-sm text-gray-500">
                    Set up interactive bingo games with custom events
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary-600 mt-0.5">✓</span>
                <div>
                  <div className="font-medium">Live Dashboard</div>
                  <div className="text-sm text-gray-500">
                    Trigger events in real-time during your stream
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary-600 mt-0.5">✓</span>
                <div>
                  <div className="font-medium">Viewer Analytics</div>
                  <div className="text-sm text-gray-500">
                    Track engagement with real-time leaderboards
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary-600 mt-0.5">✓</span>
                <div>
                  <div className="font-medium">Shareable Links</div>
                  <div className="text-sm text-gray-500">
                    Easy join links for your audience
                  </div>
                </div>
              </li>
            </ul>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleBecomeStreamer}
            disabled={loading}
            className="w-full px-4 py-3 bg-accent-600 text-white rounded-lg font-semibold hover:bg-accent-700 disabled:opacity-50 transition"
          >
            {loading ? 'Upgrading...' : 'Become a Streamer'}
          </button>

          <p className="mt-4 text-center text-xs text-gray-500">
            This is free during the beta period
          </p>
        </div>
      </div>
    </div>
  );
}
