'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { cardsApi } from '@/lib/api';

interface GalleryCard {
  id: string;
  episodeId: string;
  episodeName: string;
  artworkUrl: string | null;
  streamerName: string;
  cardNumber: number;
  markedSquares: number;
  patterns: any[];
  mintedAt: string;
  fruitedAt: string | null;
}

export default function GalleryPage() {
  const { user, token } = useAuth();
  const [cards, setCards] = useState<GalleryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      loadCards();
    }
  }, [token]);

  const loadCards = async () => {
    if (!token) return;

    try {
      const data = await cardsApi.getGallery(token);
      setCards(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load gallery');
    }
    setLoading(false);
  };

  if (!token) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Sign in to view your gallery</h1>
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-2">My Collectibles</h1>
      <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
        Your permanent bingo cards from past episodes
      </p>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 p-4 rounded-lg animate-pulse">
              <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 text-center">
          {error}
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl">
          <div className="text-6xl mb-4">💎</div>
          <h2 className="text-xl font-semibold mb-2">No collectibles yet</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Join a live episode to get your first card!
          </p>
          <Link
            href="/"
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Find Episodes
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <Link
              key={card.id}
              href={`/card/${card.id}`}
              className="bg-white dark:bg-gray-900 p-4 rounded-xl shadow hover:shadow-lg transition group"
            >
              {/* Preview */}
              <div className="aspect-square bg-gradient-to-br from-primary-100 to-accent-100 dark:from-primary-900 dark:to-accent-900 rounded-lg mb-3 flex items-center justify-center">
                <div className="text-6xl opacity-50 group-hover:opacity-75 transition">
                  🎯
                </div>
              </div>

              {/* Info */}
              <h3 className="font-semibold truncate group-hover:text-primary-600 transition">
                {card.episodeName}
              </h3>
              <p className="text-sm text-gray-500 mb-2">{card.streamerName}</p>

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="font-medium text-primary-600">{card.markedSquares}</span>
                  <span className="text-gray-500"> marked</span>
                </div>
                {card.patterns.length > 0 && (
                  <div>
                    <span className="font-medium text-accent-600">{card.patterns.length}</span>
                    <span className="text-gray-500"> patterns</span>
                  </div>
                )}
              </div>

              {/* Date */}
              <div className="mt-2 text-xs text-gray-400">
                {card.fruitedAt
                  ? `Collected ${new Date(card.fruitedAt).toLocaleDateString()}`
                  : `Minted ${new Date(card.mintedAt).toLocaleDateString()}`}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
