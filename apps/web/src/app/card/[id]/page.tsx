'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { cardsApi } from '@/lib/api';
import { CardRenderer } from '@/components/CardRenderer';
import { detectPatterns, getPatternDescription } from '@streamtree/shared';

interface Card {
  id: string;
  episodeId: string;
  grid: any[][];
  markedSquares: number;
  patterns: any[];
  status: string;
  cardNumber: number;
  mintedAt: string;
  fruitedAt: string | null;
  episode: {
    id: string;
    name: string;
    artworkUrl: string | null;
    status: string;
    eventDefinitions: { id: string; name: string; icon: string }[];
    streamer: { username: string; displayName: string | null };
  };
  holder: { id: string; username: string; displayName: string | null };
}

export default function CardPage() {
  const params = useParams();
  const cardId = params.id as string;
  const { user, token } = useAuth();

  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      loadCard();
    }
  }, [token, cardId]);

  const loadCard = async () => {
    if (!token) return;

    try {
      const data = await cardsApi.get(cardId, token);
      setCard(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load card');
    }
    setLoading(false);
  };

  if (!token) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Sign in to view cards</h1>
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

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto" />
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-2">Card not found</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link href="/gallery" className="text-primary-600 hover:underline">
            Back to gallery
          </Link>
        </div>
      </div>
    );
  }

  const patterns = detectPatterns(card.grid);
  const isFruited = card.status === 'fruited';
  const isOwner = user?.id === card.holder.id;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        {isFruited && (
          <div className="inline-block px-3 py-1 bg-accent-100 dark:bg-accent-900 text-accent-600 dark:text-accent-400 rounded-full text-sm mb-4">
            Collectible
          </div>
        )}
        <h1 className="text-3xl font-bold mb-2">{card.episode.name}</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Card #{card.cardNumber} · {card.episode.streamer.displayName || card.episode.streamer.username}
        </p>
        {!isOwner && (
          <p className="text-sm text-gray-500 mt-1">
            Owned by {card.holder.displayName || card.holder.username}
          </p>
        )}
      </div>

      {/* Card */}
      <div className="flex justify-center mb-8">
        <CardRenderer
          grid={card.grid}
          events={card.episode.eventDefinitions}
          patterns={patterns}
          isLive={false}
          showAnimation={false}
        />
      </div>

      {/* Stats */}
      <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow mb-8">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-primary-600">{card.markedSquares}</div>
            <div className="text-sm text-gray-500">Squares Marked</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-accent-600">{patterns.length}</div>
            <div className="text-sm text-gray-500">Patterns</div>
          </div>
          <div>
            <div className="text-2xl font-bold">#{card.cardNumber}</div>
            <div className="text-sm text-gray-500">Card Number</div>
          </div>
        </div>

        {patterns.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium mb-2">Completed Patterns:</div>
            <div className="flex flex-wrap gap-2">
              {patterns.map((pattern, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400 rounded text-sm"
                >
                  {getPatternDescription(pattern)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow">
        <h2 className="font-semibold mb-4">Details</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Minted</span>
            <span>{new Date(card.mintedAt).toLocaleString()}</span>
          </div>
          {card.fruitedAt && (
            <div className="flex justify-between">
              <span className="text-gray-500">Fruited</span>
              <span>{new Date(card.fruitedAt).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Episode</span>
            <Link
              href={`/play/${card.episodeId}`}
              className="text-primary-600 hover:underline"
            >
              {card.episode.name}
            </Link>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Status</span>
            <span className="capitalize">{card.status}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 flex justify-center gap-4">
        <Link
          href="/gallery"
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          Back to Gallery
        </Link>
        {card.episode.status === 'live' && isOwner && (
          <Link
            href={`/play/${card.episode.id}`}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Return to Episode
          </Link>
        )}
      </div>
    </div>
  );
}
