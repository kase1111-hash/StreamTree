'use client';

import { useMemo } from 'react';
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
  onSquareClick?: (position: { row: number; col: number }) => void;
}

export function CardRenderer({
  grid,
  events,
  patterns = [],
  isLive = false,
  showAnimation = true,
  compact = false,
  onSquareClick,
}: CardRendererProps) {
  const eventMap = useMemo(() => {
    const map = new Map<string, EventInfo>();
    events.forEach((e) => map.set(e.id, e));
    return map;
  }, [events]);

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

  return (
    <div className="inline-block bg-white dark:bg-gray-900 p-2 md:p-4 rounded-xl shadow-lg">
      <div
        className="grid gap-1 md:gap-2"
        style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
      >
        {grid.map((row, rowIdx) =>
          row.map((square, colIdx) => {
            const event = square.eventId === 'FREE'
              ? { id: 'FREE', name: 'FREE', icon: '⭐' }
              : eventMap.get(square.eventId);
            const isHighlighted = highlightedSquares.has(`${rowIdx}-${colIdx}`);

            return (
              <button
                key={`${rowIdx}-${colIdx}`}
                onClick={() => onSquareClick?.({ row: rowIdx, col: colIdx })}
                disabled={!isLive || square.marked}
                className={clsx(
                  squareSize,
                  'rounded-lg flex flex-col items-center justify-center transition-all',
                  'border-2',
                  square.marked
                    ? isHighlighted
                      ? 'bg-primary-500 border-primary-600 text-white pattern-highlight'
                      : 'bg-primary-100 dark:bg-primary-900 border-primary-300 dark:border-primary-700'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary-400',
                  showAnimation && square.marked && 'animate-mark',
                  onSquareClick && isLive && !square.marked && 'cursor-pointer hover:scale-105'
                )}
              >
                <span className={clsx('text-xl', compact && 'text-lg')}>
                  {event?.icon || '?'}
                </span>
                {!compact && (
                  <span className="text-xs text-center px-1 truncate max-w-full">
                    {event?.name || 'Unknown'}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
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
