'use client';

import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';

interface LeaderboardEntry {
  rank: number;
  cardId: string;
  holderId?: string;
  username: string;
  markedSquares: number;
  patterns: number | any[];
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  maxEntries?: number;
  animate?: boolean;
}

const RANK_MEDALS = ['🥇', '🥈', '🥉'];
const RANK_COLORS = {
  1: {
    bg: 'bg-gradient-to-r from-yellow-100 to-yellow-50 dark:from-yellow-900/30 dark:to-yellow-900/10',
    border: 'border-yellow-300 dark:border-yellow-700',
    badge: 'bg-gradient-to-br from-yellow-400 to-yellow-500 text-yellow-900 shadow-lg shadow-yellow-400/30',
  },
  2: {
    bg: 'bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-700/30 dark:to-gray-700/10',
    border: 'border-gray-300 dark:border-gray-600',
    badge: 'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-900 shadow-lg shadow-gray-400/30',
  },
  3: {
    bg: 'bg-gradient-to-r from-orange-100 to-orange-50 dark:from-orange-900/30 dark:to-orange-900/10',
    border: 'border-orange-300 dark:border-orange-700',
    badge: 'bg-gradient-to-br from-orange-400 to-orange-500 text-orange-900 shadow-lg shadow-orange-400/30',
  },
};

export function Leaderboard({
  entries,
  currentUserId,
  maxEntries = 10,
  animate = true,
}: LeaderboardProps) {
  const [prevEntries, setPrevEntries] = useState<LeaderboardEntry[]>([]);
  const [rankChanges, setRankChanges] = useState<Map<string, 'up' | 'down' | 'same'>>(new Map());
  const isFirstRender = useRef(true);

  // Track rank changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setPrevEntries(entries);
      return;
    }

    const changes = new Map<string, 'up' | 'down' | 'same'>();
    const prevRanks = new Map(prevEntries.map(e => [e.cardId, e.rank]));

    entries.forEach(entry => {
      const prevRank = prevRanks.get(entry.cardId);
      if (prevRank === undefined) {
        changes.set(entry.cardId, 'same'); // New entry
      } else if (entry.rank < prevRank) {
        changes.set(entry.cardId, 'up');
      } else if (entry.rank > prevRank) {
        changes.set(entry.cardId, 'down');
      } else {
        changes.set(entry.cardId, 'same');
      }
    });

    setRankChanges(changes);
    setPrevEntries(entries);

    // Clear changes after animation
    const timer = setTimeout(() => {
      setRankChanges(new Map());
    }, 1000);

    return () => clearTimeout(timer);
  }, [entries]);

  const displayEntries = entries.slice(0, maxEntries);

  if (displayEntries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-4xl mb-2">🎯</div>
        <div>No cards minted yet. Be the first!</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayEntries.map((entry, idx) => {
        const patternCount = Array.isArray(entry.patterns)
          ? entry.patterns.length
          : entry.patterns;
        const isCurrentUser = entry.holderId === currentUserId;
        const rankChange = rankChanges.get(entry.cardId);
        const colors = RANK_COLORS[entry.rank as 1 | 2 | 3];

        return (
          <div
            key={entry.cardId}
            style={{ animationDelay: `${idx * 50}ms` }}
            className={clsx(
              'flex items-center gap-3 p-3 rounded-xl border transition-all duration-300',
              animate && 'animate-slide-up',
              colors?.bg || 'bg-white dark:bg-gray-900',
              colors?.border || 'border-gray-100 dark:border-gray-800',
              isCurrentUser && 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-900',
              rankChange === 'up' && 'animate-rank-up'
            )}
          >
            {/* Rank badge */}
            <div
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0',
                colors?.badge || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              )}
            >
              {entry.rank <= 3 ? (
                <span className="text-xl">{RANK_MEDALS[entry.rank - 1]}</span>
              ) : (
                entry.rank
              )}
            </div>

            {/* User info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">
                  {entry.username}
                </span>
                {isCurrentUser && (
                  <span className="px-1.5 py-0.5 text-xs bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded">
                    You
                  </span>
                )}
                {rankChange === 'up' && (
                  <span className="text-green-500 animate-bounce-once">↑</span>
                )}
                {rankChange === 'down' && (
                  <span className="text-red-500">↓</span>
                )}
              </div>
              {patternCount > 0 && (
                <div className="flex items-center gap-1 mt-0.5">
                  {Array.from({ length: Math.min(patternCount, 5) }).map((_, i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-accent-500"
                    />
                  ))}
                  {patternCount > 5 && (
                    <span className="text-xs text-gray-500">+{patternCount - 5}</span>
                  )}
                </div>
              )}
            </div>

            {/* Score */}
            <div className="text-right">
              <div className={clsx(
                'text-xl font-bold',
                entry.rank === 1 ? 'text-yellow-600 dark:text-yellow-400' :
                entry.rank === 2 ? 'text-gray-600 dark:text-gray-400' :
                entry.rank === 3 ? 'text-orange-600 dark:text-orange-400' :
                'text-primary-600 dark:text-primary-400'
              )}>
                {entry.markedSquares}
              </div>
              <div className="text-xs text-gray-500">
                {patternCount > 0
                  ? `${patternCount} pattern${patternCount !== 1 ? 's' : ''}`
                  : 'squares'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Compact version for dashboard sidebar
export function LeaderboardCompact({
  entries,
  maxEntries = 5,
  currentUserId,
}: {
  entries: LeaderboardEntry[];
  maxEntries?: number;
  currentUserId?: string;
}) {
  const displayEntries = entries.slice(0, maxEntries);

  if (displayEntries.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        No cards yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayEntries.map((entry) => {
        const isCurrentUser = entry.holderId === currentUserId;
        const patternCount = Array.isArray(entry.patterns)
          ? entry.patterns.length
          : entry.patterns;

        return (
          <div
            key={entry.cardId}
            className={clsx(
              'flex items-center gap-2 text-sm p-2 rounded-lg transition-colors',
              isCurrentUser && 'bg-primary-50 dark:bg-primary-900/20'
            )}
          >
            <span className={clsx(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
              entry.rank === 1 && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
              entry.rank === 2 && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
              entry.rank === 3 && 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
              entry.rank > 3 && 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
            )}>
              {entry.rank <= 3 ? RANK_MEDALS[entry.rank - 1] : entry.rank}
            </span>
            <span className={clsx(
              'flex-1 truncate',
              isCurrentUser && 'font-medium text-primary-700 dark:text-primary-300'
            )}>
              {entry.username}
            </span>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-primary-600 dark:text-primary-400">
                {entry.markedSquares}
              </span>
              {patternCount > 0 && (
                <span className="text-xs text-accent-600 dark:text-accent-400">
                  ({patternCount})
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Live leaderboard with auto-refresh animation
export function LiveLeaderboard({
  entries,
  currentUserId,
  maxEntries = 10,
}: LeaderboardProps) {
  return (
    <div className="relative">
      {/* Live indicator */}
      <div className="absolute -top-2 -right-2 flex items-center gap-1 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
        LIVE
      </div>

      <Leaderboard
        entries={entries}
        currentUserId={currentUserId}
        maxEntries={maxEntries}
        animate
      />
    </div>
  );
}
