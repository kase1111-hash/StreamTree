'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { cardsApi, usersApi } from '@/lib/api';

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
  fruitTokenId?: string | null;
}

interface UserStats {
  cardsTotal: number;
  cardsFruited: number;
  patternsCompleted: number;
  episodesCreated: number;
  episodesLive: number;
}

type SortOption = 'newest' | 'oldest' | 'score' | 'patterns';
type FilterOption = 'all' | 'bingo' | 'blackout' | 'nft';

export default function GalleryPage() {
  const { user, token } = useAuth();
  const [cards, setCards] = useState<GalleryCard[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters and sorting
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token]);

  const loadData = async () => {
    if (!token) return;

    try {
      const [cardsData, statsData] = await Promise.all([
        cardsApi.getGallery(token),
        usersApi.getStats(token),
      ]);
      setCards(cardsData);
      setStats(statsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load gallery');
    }
    setLoading(false);
  };

  // Filter and sort cards
  const filteredCards = useMemo(() => {
    let result = [...cards];

    // Filter
    switch (filterBy) {
      case 'bingo':
        result = result.filter((c) => c.patterns.length > 0);
        break;
      case 'blackout':
        result = result.filter((c) => c.patterns.some((p) => p.type === 'blackout'));
        break;
      case 'nft':
        result = result.filter((c) => c.fruitTokenId);
        break;
    }

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.episodeName.toLowerCase().includes(query) ||
          c.streamerName.toLowerCase().includes(query)
      );
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.fruitedAt || b.mintedAt).getTime() - new Date(a.fruitedAt || a.mintedAt).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.fruitedAt || a.mintedAt).getTime() - new Date(b.fruitedAt || b.mintedAt).getTime());
        break;
      case 'score':
        result.sort((a, b) => b.markedSquares - a.markedSquares);
        break;
      case 'patterns':
        result.sort((a, b) => b.patterns.length - a.patterns.length);
        break;
    }

    return result;
  }, [cards, filterBy, sortBy, searchQuery]);

  // Calculate achievements
  const achievements = useMemo(() => {
    const total = cards.length;
    const withBingo = cards.filter((c) => c.patterns.length > 0).length;
    const withBlackout = cards.filter((c) => c.patterns.some((p) => p.type === 'blackout')).length;
    const totalPatterns = cards.reduce((sum, c) => sum + c.patterns.length, 0);
    const uniqueStreamers = new Set(cards.map((c) => c.streamerName)).size;

    return {
      total,
      withBingo,
      withBlackout,
      totalPatterns,
      uniqueStreamers,
    };
  }, [cards]);

  // Get rarity badge for a card
  const getRarityBadge = (card: GalleryCard) => {
    if (card.patterns.some((p) => p.type === 'blackout')) {
      return { label: 'Legendary', color: 'bg-yellow-500 text-black' };
    }
    if (card.patterns.length >= 4) {
      return { label: 'Epic', color: 'bg-purple-500 text-white' };
    }
    if (card.patterns.length >= 2) {
      return { label: 'Rare', color: 'bg-blue-500 text-white' };
    }
    if (card.patterns.length >= 1) {
      return { label: 'Uncommon', color: 'bg-green-500 text-white' };
    }
    return { label: 'Common', color: 'bg-gray-500 text-white' };
  };

  if (!token) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">My Collectibles</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Your permanent bingo cards from past episodes
        </p>
      </div>

      {/* Stats Overview */}
      {stats && cards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-primary-600">{achievements.total}</div>
            <div className="text-sm text-gray-500">Total Cards</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-green-500">{achievements.withBingo}</div>
            <div className="text-sm text-gray-500">Bingos Won</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-yellow-500">{achievements.withBlackout}</div>
            <div className="text-sm text-gray-500">Blackouts</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-purple-500">{achievements.totalPatterns}</div>
            <div className="text-sm text-gray-500">Total Patterns</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-blue-500">{achievements.uniqueStreamers}</div>
            <div className="text-sm text-gray-500">Streamers</div>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      {cards.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by episode or streamer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Filter */}
            <div className="flex gap-2">
              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as FilterOption)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Cards</option>
                <option value="bingo">With Bingo</option>
                <option value="blackout">Blackouts</option>
                <option value="nft">On-Chain NFTs</option>
              </select>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="score">Highest Score</option>
                <option value="patterns">Most Patterns</option>
              </select>
            </div>
          </div>

          {/* Active filters indicator */}
          {(filterBy !== 'all' || searchQuery) && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500">Showing {filteredCards.length} of {cards.length} cards</span>
              <button
                onClick={() => {
                  setFilterBy('all');
                  setSearchQuery('');
                }}
                className="text-primary-600 hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 p-4 rounded-xl animate-pulse">
              <div className="aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg mb-3" />
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
      ) : filteredCards.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl">
          <div className="text-4xl mb-4">🔍</div>
          <h2 className="text-xl font-semibold mb-2">No matches found</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Try adjusting your filters or search query
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCards.map((card) => {
            const rarity = getRarityBadge(card);
            return (
              <Link
                key={card.id}
                href={`/card/${card.id}`}
                className="bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-xl transition-all duration-300 group overflow-hidden"
              >
                {/* Card Preview */}
                <div className="relative aspect-square bg-gradient-to-br from-primary-100 to-accent-100 dark:from-primary-900 dark:to-accent-900">
                  {card.artworkUrl ? (
                    <img
                      src={card.artworkUrl}
                      alt={card.episodeName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-6xl opacity-50 group-hover:opacity-75 transition">
                        🎯
                      </span>
                    </div>
                  )}

                  {/* Rarity Badge */}
                  <div className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold ${rarity.color}`}>
                    {rarity.label}
                  </div>

                  {/* NFT Badge */}
                  {card.fruitTokenId && (
                    <div className="absolute top-2 left-2 px-2 py-1 bg-blue-600 text-white rounded-full text-xs font-bold">
                      NFT
                    </div>
                  )}

                  {/* Card Number */}
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-sm text-white rounded text-xs">
                    #{card.cardNumber}
                  </div>
                </div>

                {/* Card Info */}
                <div className="p-4">
                  <h3 className="font-semibold truncate group-hover:text-primary-600 transition">
                    {card.episodeName}
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">{card.streamerName}</p>

                  {/* Stats Row */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <span className="text-lg">✅</span>
                        <span className="font-medium">{card.markedSquares}</span>
                      </div>
                      {card.patterns.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-lg">🏆</span>
                          <span className="font-medium">{card.patterns.length}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Date */}
                  <div className="mt-2 text-xs text-gray-400">
                    {card.fruitedAt
                      ? new Date(card.fruitedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : `Minted ${new Date(card.mintedAt).toLocaleDateString()}`}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Achievements Section */}
      {cards.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-6">Achievements</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <AchievementCard
              icon="🎯"
              title="First Blood"
              description="Collect your first card"
              unlocked={achievements.total >= 1}
            />
            <AchievementCard
              icon="🏆"
              title="Winner"
              description="Get your first bingo"
              unlocked={achievements.withBingo >= 1}
            />
            <AchievementCard
              icon="⭐"
              title="Blackout Master"
              description="Complete a blackout"
              unlocked={achievements.withBlackout >= 1}
            />
            <AchievementCard
              icon="🎪"
              title="Collector"
              description="Collect 10 cards"
              unlocked={achievements.total >= 10}
              progress={achievements.total < 10 ? achievements.total / 10 : 1}
            />
            <AchievementCard
              icon="💫"
              title="Pattern Hunter"
              description="Get 25 total patterns"
              unlocked={achievements.totalPatterns >= 25}
              progress={achievements.totalPatterns < 25 ? achievements.totalPatterns / 25 : 1}
            />
            <AchievementCard
              icon="🌟"
              title="Super Fan"
              description="Watch 5 different streamers"
              unlocked={achievements.uniqueStreamers >= 5}
              progress={achievements.uniqueStreamers < 5 ? achievements.uniqueStreamers / 5 : 1}
            />
            <AchievementCard
              icon="🔥"
              title="On Fire"
              description="Get 3 bingos in one card"
              unlocked={cards.some((c) => c.patterns.length >= 3)}
            />
            <AchievementCard
              icon="💎"
              title="Elite Collector"
              description="Collect 50 cards"
              unlocked={achievements.total >= 50}
              progress={achievements.total < 50 ? achievements.total / 50 : 1}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AchievementCard({
  icon,
  title,
  description,
  unlocked,
  progress,
}: {
  icon: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress?: number;
}) {
  return (
    <div
      className={`p-4 rounded-xl border-2 transition-all ${
        unlocked
          ? 'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-yellow-400'
          : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 opacity-60'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`text-3xl ${unlocked ? '' : 'grayscale'}`}>{icon}</div>
        <div className="flex-1">
          <h3 className={`font-semibold ${unlocked ? 'text-yellow-700 dark:text-yellow-400' : ''}`}>
            {title}
          </h3>
          <p className="text-sm text-gray-500">{description}</p>
          {progress !== undefined && !unlocked && (
            <div className="mt-2">
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <div className="text-xs text-gray-400 mt-1">{Math.round(progress * 100)}%</div>
            </div>
          )}
        </div>
        {unlocked && (
          <div className="text-green-500 text-xl">✓</div>
        )}
      </div>
    </div>
  );
}
