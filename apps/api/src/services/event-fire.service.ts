import { Prisma } from '@prisma/client';
import { detectPatterns } from '@streamtree/shared';
import type { CardUpdatedEvent, GridSquare } from '@streamtree/shared';
import { prisma } from '../db/client.js';
import { sanitizeError } from '../utils/sanitize.js';
import { withSerializableRetry } from '../utils/transaction.js';

// A grid square as stored in the cards.grid JSON column
interface StoredSquare {
  eventId: string;
  position: { row: number; col: number };
  marked: boolean;
  markedAt: string | null;
}

// Fires queue behind mints on the episode lock and share the connection pool
// with them, so wait rather than fail under a burst
const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 20_000,
};

export class FireError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'FireError';
  }
}

export interface FireEventParams {
  episodeId: string;
  eventId: string;
  firedBy: string;
  triggeredBy: string;
  triggerData?: Prisma.InputJsonValue;
  // Called after each card update commits, to deliver the card:updated message
  onCardUpdated?: (holderId: string, event: CardUpdatedEvent) => void;
}

function hasUnmarkedSquare(grid: StoredSquare[][], eventId: string): boolean {
  return grid.some((row) => row.some((sq) => sq.eventId === eventId && !sq.marked));
}

/**
 * Fires an event: records firedAt and marks the event's squares on the
 * episode's cards.
 *
 * firedAt is recorded under the episode row lock that mintCardAtomically also
 * takes, and the cards are read after that commits. So every card is either
 * minted after firedAt is visible (and pre-marks the event) or is committed
 * before the read (and is marked here). Each card is then updated with a
 * locked read-modify-write of its current grid, so concurrent fires can't
 * overwrite each other's marks.
 */
export async function fireEvent(
  params: FireEventParams
): Promise<{ firedEvent: Prisma.FiredEventGetPayload<object>; cardsAffected: number }> {
  const { episodeId, eventId } = params;

  const firedEvent = await prisma.$transaction(async (tx) => {
    const episodes = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM episodes WHERE id = ${episodeId} FOR UPDATE
    `;
    if (episodes[0]?.status !== 'live') {
      throw new FireError('Episode is not live', 'INVALID_STATUS', 400);
    }

    await tx.eventDefinition.update({
      where: { id: eventId },
      data: { firedAt: new Date(), firedCount: { increment: 1 } },
    });

    return tx.firedEvent.create({
      data: {
        episodeId,
        eventDefinitionId: eventId,
        firedBy: params.firedBy,
        cardsAffected: 0,
        ...(params.triggerData !== undefined ? { triggerData: params.triggerData } : {}),
      },
    });
  }, TX_OPTIONS);

  // No status filter: the fire was accepted while the episode was live, so its
  // marks also belong on cards an end request is fruiting concurrently. Marks
  // are never removed, so only cards with an unmarked square can need an update.
  const cards = await prisma.card.findMany({
    where: { episodeId },
    select: { id: true, grid: true },
    orderBy: { id: 'asc' },
  });
  const cardIds = cards
    .filter((card) => hasUnmarkedSquare(card.grid as unknown as StoredSquare[][], eventId))
    .map((card) => card.id);

  // firedAt is already visible to mints, so finish as many cards as possible
  // rather than stopping at the first failure; marking is idempotent
  let cardsAffected = 0;
  let failed = 0;
  for (const cardId of cardIds) {
    try {
      const update = await withSerializableRetry(() =>
        markEventOnCard(cardId, eventId, params.triggeredBy)
      );
      if (update) {
        cardsAffected++;
        params.onCardUpdated?.(update.holderId, update.event);
      }
    } catch (error) {
      failed++;
      console.error(`Failed to mark event ${eventId} on card ${cardId}:`, sanitizeError(error));
    }
  }

  const recorded = await prisma.firedEvent.update({
    where: { id: firedEvent.id },
    data: { cardsAffected },
  });

  if (failed > 0) {
    // Firing the event again marks the remaining cards
    throw new FireError(
      `Event fired, but ${failed} card(s) could not be updated. Fire it again to retry them.`,
      'PARTIAL_FIRE',
      500
    );
  }

  return { firedEvent: recorded, cardsAffected };
}

async function markEventOnCard(
  cardId: string,
  eventId: string,
  triggeredBy: string
): Promise<{ holderId: string; event: CardUpdatedEvent } | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ grid: StoredSquare[][]; holder_id: string }[]>`
      SELECT grid, holder_id FROM cards WHERE id = ${cardId} FOR UPDATE
    `;
    const card = rows[0];
    if (!card) return null;

    const grid = card.grid;
    const markedAt = new Date().toISOString();
    const newlyMarked: StoredSquare[] = [];
    for (const row of grid) {
      for (const sq of row) {
        if (sq.eventId === eventId && !sq.marked) {
          sq.marked = true;
          sq.markedAt = markedAt;
          newlyMarked.push({ ...sq });
        }
      }
    }
    if (newlyMarked.length === 0) return null;

    const totalMarked = grid.flat().filter((sq) => sq.marked).length;
    const patterns = detectPatterns(grid as unknown as GridSquare[][]);

    await tx.card.update({
      where: { id: cardId },
      data: {
        grid: grid as unknown as Prisma.InputJsonValue,
        markedSquares: totalMarked,
        patterns: patterns as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      holderId: card.holder_id,
      event: {
        type: 'card:updated',
        cardId,
        // markedAt travels as an ISO string, as it always has over the wire
        markedSquares: newlyMarked as unknown as GridSquare[],
        newPatterns: patterns,
        totalMarked,
        triggeredBy,
      },
    };
  }, TX_OPTIONS);
}
