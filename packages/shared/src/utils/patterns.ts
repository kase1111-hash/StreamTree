import type { GridSquare, Pattern } from '../types/card.js';

/**
 * Detects all completed patterns in a grid
 */
export function detectPatterns(grid: GridSquare[][]): Pattern[] {
  const patterns: Pattern[] = [];
  const size = grid.length;

  if (size === 0) return patterns;

  // Check rows
  for (let row = 0; row < size; row++) {
    if (grid[row].every((sq) => sq.marked)) {
      patterns.push({ type: 'row', index: row });
    }
  }

  // Check columns
  for (let col = 0; col < size; col++) {
    if (grid.every((row) => row[col].marked)) {
      patterns.push({ type: 'column', index: col });
    }
  }

  // Check main diagonal (top-left to bottom-right)
  let mainDiagonal = true;
  for (let i = 0; i < size; i++) {
    if (!grid[i][i].marked) {
      mainDiagonal = false;
      break;
    }
  }
  if (mainDiagonal) {
    patterns.push({ type: 'diagonal', direction: 'main' });
  }

  // Check anti-diagonal (top-right to bottom-left)
  let antiDiagonal = true;
  for (let i = 0; i < size; i++) {
    if (!grid[i][size - 1 - i].marked) {
      antiDiagonal = false;
      break;
    }
  }
  if (antiDiagonal) {
    patterns.push({ type: 'diagonal', direction: 'anti' });
  }

  // Check blackout (all squares marked)
  if (grid.every((row) => row.every((sq) => sq.marked))) {
    patterns.push({ type: 'blackout' });
  }

  return patterns;
}

/**
 * Detects new patterns after a grid update
 */
export function detectNewPatterns(
  previousPatterns: Pattern[],
  currentGrid: GridSquare[][]
): Pattern[] {
  const allPatterns = detectPatterns(currentGrid);

  return allPatterns.filter((pattern) => {
    return !previousPatterns.some((prev) => patternsEqual(prev, pattern));
  });
}

/**
 * Checks if two patterns are equal
 */
export function patternsEqual(a: Pattern, b: Pattern): boolean {
  if (a.type !== b.type) return false;

  switch (a.type) {
    case 'row':
    case 'column':
      return (b as typeof a).index === a.index;
    case 'diagonal':
      return (b as typeof a).direction === a.direction;
    case 'blackout':
      return true;
    default:
      return false;
  }
}

/**
 * Gets a human-readable description of a pattern
 */
export function getPatternDescription(pattern: Pattern): string {
  switch (pattern.type) {
    case 'row':
      return `Row ${pattern.index + 1}`;
    case 'column':
      return `Column ${pattern.index + 1}`;
    case 'diagonal':
      return pattern.direction === 'main' ? 'Main Diagonal' : 'Anti-Diagonal';
    case 'blackout':
      return 'Blackout!';
    default:
      return 'Unknown Pattern';
  }
}

/**
 * Calculates a score based on patterns
 */
export function calculatePatternScore(patterns: Pattern[]): number {
  let score = 0;

  for (const pattern of patterns) {
    switch (pattern.type) {
      case 'row':
      case 'column':
        score += 100;
        break;
      case 'diagonal':
        score += 150;
        break;
      case 'blackout':
        score += 500;
        break;
    }
  }

  return score;
}

/**
 * Checks if a specific row is complete
 */
export function isRowComplete(grid: GridSquare[][], rowIndex: number): boolean {
  if (rowIndex < 0 || rowIndex >= grid.length) return false;
  return grid[rowIndex].every((sq) => sq.marked);
}

/**
 * Checks if a specific column is complete
 */
export function isColumnComplete(grid: GridSquare[][], colIndex: number): boolean {
  // SECURITY: Check grid.length > 0 BEFORE accessing grid[0] to prevent undefined access
  if (grid.length === 0 || colIndex < 0 || colIndex >= (grid[0]?.length ?? 0)) return false;
  return grid.every((row) => row[colIndex]?.marked ?? false);
}

/**
 * Gets squares that would complete a pattern
 */
export function getSquaresToComplete(
  grid: GridSquare[][],
  pattern: Omit<Pattern, 'type'> & { type: 'row' | 'column' | 'diagonal' }
): GridSquare[] {
  const size = grid.length;
  const unmarked: GridSquare[] = [];

  switch (pattern.type) {
    case 'row': {
      const rowIndex = (pattern as { type: 'row'; index: number }).index;
      if (rowIndex >= 0 && rowIndex < size) {
        grid[rowIndex].forEach((sq) => {
          if (!sq.marked) unmarked.push(sq);
        });
      }
      break;
    }
    case 'column': {
      const colIndex = (pattern as { type: 'column'; index: number }).index;
      if (colIndex >= 0 && colIndex < size) {
        grid.forEach((row) => {
          if (!row[colIndex].marked) unmarked.push(row[colIndex]);
        });
      }
      break;
    }
    case 'diagonal': {
      const direction = (pattern as { type: 'diagonal'; direction: 'main' | 'anti' }).direction;
      for (let i = 0; i < size; i++) {
        const col = direction === 'main' ? i : size - 1 - i;
        if (!grid[i][col].marked) {
          unmarked.push(grid[i][col]);
        }
      }
      break;
    }
  }

  return unmarked;
}
