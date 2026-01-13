'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import type { GridSquare, Pattern } from '@streamtree/shared';

interface EventInfo {
  id: string;
  name: string;
  icon: string;
}

interface CardRendererProps {
  grid: GridSquare[][];
  events: EventInfo[];
  patterns?: Pattern[];
  isLive?: boolean;
  showAnimation?: boolean;
  compact?: boolean;
  recentlyMarked?: Set<string>; // For highlighting newly marked squares
  onSquareClick?: (position: { row: number; col: number }) => void;
}

export function CardRenderer({
  grid,
  events,
  patterns = [],
  isLive = false,
  showAnimation = true,
  compact = false,
  recentlyMarked = new Set(),
  onSquareClick,
}: CardRendererProps) {
  const [celebratePattern, setCelebratePattern] = useState(false);
  const prevPatternCount = useRef(patterns.length);

  const eventMap = useMemo(() => {
    const map = new Map<string, EventInfo>();
    events.forEach((e) => map.set(e.id, e));
    return map;
  }, [events]);

  // Celebrate when new pattern is achieved
  useEffect(() => {
    if (patterns.length > prevPatternCount.current) {
      setCelebratePattern(true);
      setTimeout(() => setCelebratePattern(false), 1500);
    }
    prevPatternCount.current = patterns.length;
  }, [patterns.length]);

  const highlightedSquares = useMemo(() => {
    const highlighted = new Set<string>();

    patterns.forEach((pattern) => {
      switch (pattern.type) {
        case 'row':
          for (let col = 0; col < grid[0].length; col++) {
            highlighted.add(`${pattern.index}-${col}`);
          }
          break;
        case 'column':
          for (let row = 0; row < grid.length; row++) {
            highlighted.add(`${row}-${pattern.index}`);
          }
          break;
        case 'diagonal':
          for (let i = 0; i < grid.length; i++) {
            const col = pattern.direction === 'main' ? i : grid.length - 1 - i;
            highlighted.add(`${i}-${col}`);
          }
          break;
        case 'blackout':
          grid.forEach((row, rowIdx) => {
            row.forEach((_, colIdx) => {
              highlighted.add(`${rowIdx}-${colIdx}`);
            });
          });
          break;
      }
    });

    return highlighted;
  }, [patterns, grid]);

  const gridSize = grid.length;
  const squareSize = compact ? 'w-12 h-12' : 'w-16 h-16 md:w-20 md:h-20';
  const hasBlackout = patterns.some(p => p.type === 'blackout');

  return (
    <div className={clsx(
      'inline-block p-2 md:p-4 rounded-xl shadow-lg transition-all duration-300',
      hasBlackout
        ? 'bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 animate-pulse-slow'
        : 'bg-white dark:bg-gray-900',
      celebratePattern && 'ring-4 ring-yellow-400 ring-opacity-75'
    )}>
      {/* Pattern celebration overlay */}
      {celebratePattern && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
          <div className="absolute inset-0 bg-yellow-400/20 animate-ping" />
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute text-2xl animate-float-away"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${i * 0.1}s`,
              }}
            >
              ✨
            </div>
          ))}
        </div>
      )}

      <div
        className="grid gap-1 md:gap-2 relative"
        style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
      >
        {grid.map((row, rowIdx) =>
          row.map((square, colIdx) => {
            const event = square.eventId === 'FREE'
              ? { id: 'FREE', name: 'FREE', icon: '⭐' }
              : eventMap.get(square.eventId);
            const isHighlighted = highlightedSquares.has(`${rowIdx}-${colIdx}`);
            const isRecent = recentlyMarked.has(`${rowIdx}-${colIdx}`);

            return (
              <button
                key={`${rowIdx}-${colIdx}`}
                onClick={() => onSquareClick?.({ row: rowIdx, col: colIdx })}
                disabled={!isLive || square.marked}
                className={clsx(
                  squareSize,
                  'rounded-lg flex flex-col items-center justify-center transition-all duration-200',
                  'border-2 relative overflow-hidden',
                  square.marked
                    ? isHighlighted
                      ? 'bg-gradient-to-br from-primary-400 to-primary-600 border-primary-600 text-white shadow-lg shadow-primary-500/50'
                      : 'bg-primary-100 dark:bg-primary-900 border-primary-300 dark:border-primary-700'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:shadow-md',
                  isRecent && 'animate-pop ring-2 ring-accent-400',
                  onSquareClick && isLive && !square.marked && 'cursor-pointer hover:scale-105 active:scale-95'
                )}
              >
                {/* Shine effect for highlighted */}
                {isHighlighted && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shine" />
                )}

                {/* Mark animation burst */}
                {isRecent && (
                  <div className="absolute inset-0 bg-accent-400/50 animate-ping-once rounded-lg" />
                )}

                <span className={clsx(
                  'relative z-10 transition-transform',
                  compact ? 'text-lg' : 'text-xl md:text-2xl',
                  square.marked && showAnimation && 'animate-bounce-once'
                )}>
                  {event?.icon || '?'}
                </span>
                {!compact && (
                  <span className={clsx(
                    'text-xs text-center px-1 truncate max-w-full relative z-10',
                    isHighlighted ? 'text-white/90' : ''
                  )}>
                    {event?.name || 'Unknown'}
                  </span>
                )}

                {/* Checkmark for marked squares */}
                {square.marked && (
                  <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Pattern indicators */}
      {patterns.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1 justify-center">
          {patterns.map((pattern, idx) => (
            <span
              key={idx}
              className={clsx(
                'px-2 py-0.5 text-xs font-medium rounded-full',
                pattern.type === 'blackout'
                  ? 'bg-yellow-400 text-yellow-900 animate-pulse'
                  : 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
              )}
            >
              {pattern.type === 'row' && `Row ${pattern.index + 1}`}
              {pattern.type === 'column' && `Col ${pattern.index + 1}`}
              {pattern.type === 'diagonal' && (pattern.direction === 'main' ? 'Diagonal ↘' : 'Diagonal ↗')}
              {pattern.type === 'blackout' && '🎉 BLACKOUT! 🎉'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Compact version for previews
export function CardPreview({
  grid,
  events,
}: {
  grid: GridSquare[][];
  events: EventInfo[];
}) {
  const markedCount = grid.flat().filter((s) => s.marked).length;
  const totalCount = grid.flat().length;

  return (
    <div className="bg-white dark:bg-gray-900 p-3 rounded-lg shadow">
      <div className="grid grid-cols-5 gap-0.5 mb-2">
        {grid.flat().slice(0, 25).map((square, idx) => (
          <div
            key={idx}
            className={clsx(
              'w-4 h-4 rounded-sm',
              square.marked
                ? 'bg-primary-500'
                : 'bg-gray-200 dark:bg-gray-700'
            )}
          />
        ))}
      </div>
      <div className="text-xs text-gray-500">
        {markedCount}/{totalCount} marked
      </div>
    </div>
  );
}
