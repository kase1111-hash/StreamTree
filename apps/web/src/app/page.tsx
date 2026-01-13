'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      {/* Hero */}
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-6">
          <span className="text-primary-600">Stream</span>
          <span className="text-accent-600">Tree</span>
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-8">
          Turn your stream into an interactive game. Create bingo cards,
          trigger events live, and give your audience collectible memories.
        </p>
        <div className="flex gap-4 justify-center">
          {user?.isStreamer ? (
            <Link
              href="/create"
              className="px-8 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition"
            >
              Create Episode
            </Link>
          ) : (
            <Link
              href="/auth/login"
              className="px-8 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition"
            >
              Get Started
            </Link>
          )}
          <Link
            href="#how-it-works"
            className="px-8 py-3 border border-gray-300 dark:border-gray-600 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Learn More
          </Link>
        </div>
      </div>

      {/* How it Works */}
      <div id="how-it-works" className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">1</span>
            </div>
            <h3 className="text-xl font-semibold mb-2">Create</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Set up your episode with custom events that might happen during your stream.
            </p>
          </div>
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-accent-100 dark:bg-accent-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">2</span>
            </div>
            <h3 className="text-xl font-semibold mb-2">Play</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Your audience mints unique cards. As events happen, their cards update in real-time.
            </p>
          </div>
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">3</span>
            </div>
            <h3 className="text-xl font-semibold mb-2">Collect</h3>
            <p className="text-gray-600 dark:text-gray-400">
              When the show ends, cards become permanent collectibles proving their participation.
            </p>
          </div>
        </div>
      </div>

      {/* For Streamers */}
      <div className="bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-950 dark:to-accent-950 rounded-2xl p-8 mb-16">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">For Streamers</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Increase engagement with interactive bingo games. Define events like
            &quot;gets a sub&quot;, &quot;says catchphrase&quot;, or &quot;defeats boss&quot;, then trigger them
            live during your stream.
          </p>
          <ul className="text-left max-w-md mx-auto space-y-2 mb-6">
            <li className="flex items-center gap-2">
              <span className="text-primary-600">✓</span> Easy episode setup
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary-600">✓</span> One-click event triggering
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary-600">✓</span> Real-time viewer leaderboard
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary-600">✓</span> Optional paid cards for monetization
            </li>
          </ul>
          {!user?.isStreamer && (
            <Link
              href="/auth/become-streamer"
              className="inline-block px-6 py-2 bg-accent-600 text-white rounded-lg font-semibold hover:bg-accent-700 transition"
            >
              Become a Streamer
            </Link>
          )}
        </div>
      </div>

      {/* For Viewers */}
      <div className="text-center mb-16">
        <h2 className="text-3xl font-bold mb-4">For Viewers</h2>
        <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-6">
          Join your favorite streamer&apos;s episode, mint a unique card, and watch it
          update live as events happen. Complete patterns to climb the leaderboard
          and keep your card as a permanent collectible.
        </p>
        <div className="flex gap-4 justify-center">
          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="text-3xl mb-2">🎯</div>
            <div className="font-semibold">Unique Cards</div>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="text-3xl mb-2">⚡</div>
            <div className="font-semibold">Live Updates</div>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="text-3xl mb-2">🏆</div>
            <div className="font-semibold">Leaderboards</div>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="text-3xl mb-2">💎</div>
            <div className="font-semibold">Collectibles</div>
          </div>
        </div>
      </div>
    </div>
  );
}
