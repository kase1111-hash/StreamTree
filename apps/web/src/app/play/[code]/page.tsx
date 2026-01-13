'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { publicApi, cardsApi } from '@/lib/api';
import { useWebSocket, useEpisodeEvents, useCardEvents } from '@/lib/websocket';
import { CardRenderer } from '@/components/CardRenderer';
import { Leaderboard } from '@/components/Leaderboard';

interface PublicEpisode {
  id: string;
  name: string;
  artworkUrl: string | null;
  status: string;
  cardsMinted: number;
  maxCards: number | null;
  gridSize: number;
  shareCode: string;
  isSoldOut: boolean;
  events: { id: string; name: string; icon: string; firedAt: string | null }[];
  streamer: { username: string; displayName: string | null; avatarUrl: string | null };
}

interface Card {
  id: string;
  grid: any[][];
  markedSquares: number;
  patterns: any[];
  status: string;
}

export default function PlayPage() {
  const params = useParams();
  const router = useRouter();
  const shareCode = params.code as string;
  const { user, token } = useAuth();
  const { connected } = useWebSocket(token);

  const [episode, setEpisode] = useState<PublicEpisode | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadEpisode();
    loadLeaderboard();
  }, [shareCode]);

  useEffect(() => {
    if (token && episode) {
      loadMyCard();
    }
  }, [token, episode?.id]);

  const loadEpisode = async () => {
    try {
      const data = await publicApi.getEpisode(shareCode);
      setEpisode(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load episode');
    }
    setLoading(false);
  };

  const loadLeaderboard = async () => {
    try {
      const data = await publicApi.getLeaderboard(shareCode);
      setLeaderboard(data);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    }
  };

  const loadMyCard = async () => {
    if (!token || !episode) return;

    try {
      const data = await cardsApi.getMyForEpisode(episode.id, token);
      setCard(data);
    } catch {
      // No card yet, that's okay
    }
  };

  // Handle episode events
  const handleEpisodeEvent = useCallback((event: any) => {
    if (event.type === 'event:fired') {
      setEpisode((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          events: prev.events.map((e) =>
            e.id === event.eventId ? { ...e, firedAt: event.timestamp } : e
          ),
        };
      });
      loadLeaderboard();
    } else if (event.type === 'episode:state' && event.status === 'ended') {
      setEpisode((prev) => (prev ? { ...prev, status: 'ended' } : prev));
    }
  }, []);

  // Handle card updates
  const handleCardEvent = useCallback((event: any) => {
    if (event.type === 'card:updated') {
      setCard((prev) => {
        if (!prev) return prev;

        // Update grid with marked squares
        const newGrid = prev.grid.map((row) =>
          row.map((sq) => {
            const marked = event.markedSquares.find(
              (m: any) => m.position.row === sq.position.row && m.position.col === sq.position.col
            );
            return marked ? { ...sq, marked: true, markedAt: marked.markedAt } : sq;
          })
        );

        return {
          ...prev,
          grid: newGrid,
          markedSquares: event.totalMarked,
          patterns: event.newPatterns,
        };
      });
    } else if (event.type === 'card:fruited') {
      setCard((prev) => (prev ? { ...prev, status: 'fruited' } : prev));
    }
  }, []);

  useEpisodeEvents(episode?.id || null, handleEpisodeEvent);
  useCardEvents(card?.id || null, handleCardEvent);

  const handleMintCard = async () => {
    if (!token || !episode) {
      router.push(`/auth/login?redirect=/play/${shareCode}`);
      return;
    }

    setMinting(true);
    setError('');

    try {
      const newCard = await cardsApi.mint(episode.id, token);
      setCard(newCard);
    } catch (err: any) {
      setError(err.message || 'Failed to mint card');
    }

    setMinting(false);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto mb-4" />
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
        </div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-2">Episode not found</h1>
          <p className="text-gray-600 mb-4">{error || 'This episode may have been deleted.'}</p>
          <Link href="/" className="text-primary-600 hover:underline">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const isLive = episode.status === 'live';
  const isEnded = episode.status === 'ended';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span
            className={`px-2 py-1 rounded text-xs ${
              isLive
                ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 animate-pulse'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            {isLive ? 'LIVE' : isEnded ? 'ENDED' : episode.status.toUpperCase()}
          </span>
          {connected && token && (
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded text-xs">
              Connected
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold mb-2">{episode.name}</h1>
        <p className="text-gray-600 dark:text-gray-400">
          by {episode.streamer.displayName || episode.streamer.username}
        </p>
        <p className="text-sm text-gray-500 mt-2">
          {episode.cardsMinted} card{episode.cardsMinted !== 1 ? 's' : ''} minted
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 text-center">
          {error}
        </div>
      )}

      {/* Card or Mint CTA */}
      {card ? (
        <div className="mb-8">
          <div className="flex justify-center mb-4">
            <CardRenderer
              grid={card.grid}
              events={episode.events}
              patterns={card.patterns}
              isLive={isLive}
              showAnimation={true}
            />
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold">
              {card.markedSquares} / {card.grid.flat().length} squares marked
            </div>
            {card.patterns.length > 0 && (
              <div className="text-primary-600 dark:text-primary-400 mt-1">
                {card.patterns.length} pattern{card.patterns.length !== 1 ? 's' : ''} completed!
              </div>
            )}
            {isEnded && (
              <div className="mt-4 p-4 bg-accent-50 dark:bg-accent-950 rounded-lg">
                <div className="font-semibold text-accent-600 dark:text-accent-400">
                  This card is now a collectible!
                </div>
                <Link
                  href={`/card/${card.id}`}
                  className="text-sm text-accent-600 hover:underline"
                >
                  View your collectible
                </Link>
              </div>
            )}
          </div>
        </div>
      ) : isLive ? (
        <div className="text-center mb-8">
          <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-lg max-w-md mx-auto">
            <h2 className="text-xl font-semibold mb-2">Get your card!</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Mint a unique bingo card and play along with the stream
            </p>
            {episode.isSoldOut ? (
              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className="font-semibold text-gray-600">Sold Out</div>
                <div className="text-sm text-gray-500">
                  Max {episode.maxCards} cards reached
                </div>
              </div>
            ) : (
              <button
                onClick={handleMintCard}
                disabled={minting}
                className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 transition"
              >
                {minting ? 'Minting...' : user ? 'Mint Card (Free)' : 'Sign in to Mint'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center mb-8 p-8 bg-gray-100 dark:bg-gray-800 rounded-xl">
          <h2 className="text-xl font-semibold mb-2">Episode has ended</h2>
          <p className="text-gray-600 dark:text-gray-400">
            This episode is no longer accepting new cards
          </p>
        </div>
      )}

      {/* Events list */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-center">Events</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {episode.events.map((event) => (
            <div
              key={event.id}
              className={`p-3 rounded-lg text-center ${
                event.firedAt
                  ? 'bg-primary-100 dark:bg-primary-900 border-2 border-primary-400'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}
            >
              <div className="text-2xl mb-1">{event.icon}</div>
              <div className="text-sm truncate">{event.name}</div>
              {event.firedAt && (
                <div className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                  Triggered!
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-center">Leaderboard</h2>
        <div className="bg-white dark:bg-gray-900 p-4 rounded-xl shadow">
          <Leaderboard entries={leaderboard} currentUserId={user?.id} />
        </div>
      </div>
    </div>
  );
}
