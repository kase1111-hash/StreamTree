import type { GridSquare, Position } from '../types/card.js';
import type { EventDefinition } from '../types/episode.js';

/**
 * Shuffles an array using Fisher-Yates algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generates a randomized bingo grid from event definitions
 */
export function generateCardGrid(
  events: EventDefinition[],
  gridSize: number = 5
): GridSquare[][] {
  const totalSquares = gridSize * gridSize;

  if (events.length === 0) {
    throw new Error('At least one event is required to generate a grid');
  }

  let eventPool: string[] = [];

  if (events.length >= totalSquares) {
    // Randomly select which events appear
    eventPool = shuffleArray(events.map((e) => e.id)).slice(0, totalSquares);
  } else {
    // Repeat events to fill grid (distribute evenly)
    const repetitions = Math.ceil(totalSquares / events.length);
    for (let i = 0; i < repetitions; i++) {
      eventPool.push(...events.map((e) => e.id));
    }
    eventPool = shuffleArray(eventPool).slice(0, totalSquares);
  }

  // Shuffle for random placement
  eventPool = shuffleArray(eventPool);

  // Build grid
  const grid: GridSquare[][] = [];
  let eventIndex = 0;

  for (let row = 0; row < gridSize; row++) {
    grid[row] = [];
    for (let col = 0; col < gridSize; col++) {
      grid[row][col] = {
        eventId: eventPool[eventIndex++],
        position: { row, col },
        marked: false,
        markedAt: null,
      };
    }
  }

  return grid;
}

/**
 * Adds a free center square to the grid (optional)
 */
export function addFreeCenter(grid: GridSquare[][]): GridSquare[][] {
  const size = grid.length;
  if (size % 2 === 0) {
    // No center for even grids
    return grid;
  }

  const center = Math.floor(size / 2);
  const result = grid.map((row) => [...row]);

  result[center][center] = {
    eventId: 'FREE',
    position: { row: center, col: center },
    marked: true,
    markedAt: new Date(),
  };

  return result;
}

/**
 * Gets the square at a position
 */
export function getSquareAtPosition(
  grid: GridSquare[][],
  position: Position
): GridSquare | null {
  // SECURITY: Add bounds check for empty grids to prevent undefined access
  if (
    grid.length === 0 ||
    position.row < 0 ||
    position.row >= grid.length ||
    position.col < 0 ||
    position.col >= (grid[0]?.length ?? 0)
  ) {
    return null;
  }
  return grid[position.row][position.col];
}

/**
 * Marks a square on the grid
 */
export function markSquare(
  grid: GridSquare[][],
  position: Position,
  markedAt: Date = new Date()
): GridSquare[][] {
  const result = grid.map((row) =>
    row.map((square) => ({ ...square }))
  );

  // SECURITY: Add bounds check for empty grids to prevent undefined access
  if (
    result.length > 0 &&
    position.row >= 0 &&
    position.row < result.length &&
    position.col >= 0 &&
    position.col < (result[0]?.length ?? 0)
  ) {
    result[position.row][position.col].marked = true;
    result[position.row][position.col].markedAt = markedAt;
  }

  return result;
}

/**
 * Marks all squares with a specific event ID
 */
export function markSquaresByEventId(
  grid: GridSquare[][],
  eventId: string,
  markedAt: Date = new Date()
): { grid: GridSquare[][]; markedPositions: Position[] } {
  const markedPositions: Position[] = [];

  const result = grid.map((row) =>
    row.map((square) => {
      if (square.eventId === eventId && !square.marked) {
        markedPositions.push(square.position);
        return {
          ...square,
          marked: true,
          markedAt,
        };
      }
      return { ...square };
    })
  );

  return { grid: result, markedPositions };
}

/**
 * Counts marked squares in a grid
 */
export function countMarkedSquares(grid: GridSquare[][]): number {
  return grid.flat().filter((square) => square.marked).length;
}

/**
 * Gets all squares for a specific event
 */
export function getSquaresForEvent(
  grid: GridSquare[][],
  eventId: string
): GridSquare[] {
  return grid.flat().filter((square) => square.eventId === eventId);
}
