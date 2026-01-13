'use client';

import { clsx } from 'clsx';

interface LeaderboardEntry {
  rank: number;
  cardId: string;
  username: string;
  markedSquares: number;
  patterns: number | any[];
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  maxEntries?: number;
}

export function Leaderboard({
  entries,
  currentUserId,
  maxEntries = 10,
}: LeaderboardProps) {
  const displayEntries = entries.slice(0, maxEntries);

  if (displayEntries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No cards minted yet. Be the first!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayEntries.map((entry) => {
        const patternCount = Array.isArray(entry.patterns)
          ? entry.patterns.length
          : entry.patterns;

        return (
          <div
            key={entry.cardId}
            className={clsx(
              'flex items-center gap-3 p-3 rounded-lg',
              entry.rank === 1
                ? 'bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800'
                : entry.rank === 2
                ? 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                : entry.rank === 3
                ? 'bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800'
                : 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800'
            )}
          >
            <div
              className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm',
                entry.rank === 1
                  ? 'bg-yellow-400 text-yellow-900'
                  : entry.rank === 2
                  ? 'bg-gray-400 text-gray-900'
                  : entry.rank === 3
                  ? 'bg-orange-400 text-orange-900'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              )}
            >
              {entry.rank}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{entry.username}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-primary-600 dark:text-primary-400">
                {entry.markedSquares}
              </div>
              <div className="text-xs text-gray-500">
                {patternCount > 0 && `${patternCount} pattern${patternCount !== 1 ? 's' : ''}`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Compact version for dashboard
export function LeaderboardCompact({
  entries,
  maxEntries = 5,
}: {
  entries: LeaderboardEntry[];
  maxEntries?: number;
}) {
  const displayEntries = entries.slice(0, maxEntries);

  return (
    <div className="space-y-1">
      {displayEntries.map((entry) => (
        <div
          key={entry.cardId}
          className="flex items-center gap-2 text-sm"
        >
          <span className="w-5 text-gray-400">#{entry.rank}</span>
          <span className="flex-1 truncate">{entry.username}</span>
          <span className="font-medium">{entry.markedSquares}</span>
        </div>
      ))}
    </div>
  );
}
