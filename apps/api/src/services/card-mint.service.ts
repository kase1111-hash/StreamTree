import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { generateCardGrid, detectPatterns } from '@streamtree/shared';
import type { TriggerType, TriggerConfig } from '@streamtree/shared';
import { withSerializableRetry } from '../utils/transaction.js';

export interface MintCardParams {
  episodeId: string;
  holderId: string;
  paymentId?: string;
  pricePaid?: number;
}

export interface MintCardResult {
  card: {
    id: string;
    episodeId: string;
    holderId: string;
    grid: any;
    markedSquares: number;
    cardNumber: number;
    paymentId: string | null;
    pricePaid: number;
    status: string;
    mintedAt: Date;
    [key: string]: any;
  };
  cardNumber: number;
}

export class MintError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'MintError';
  }
}

/**
 * Atomically mints a card.
 *
 * SELECT ... FOR UPDATE on the episode row serializes concurrent mints,
 * preventing both duplicate cardNumber values and over-minting past maxCards.
 * Firing an event takes the same lock while it records firedAt, and reads the
 * episode's cards only after that commits, so a card is either minted with the
 * event pre-marked or included in that fire.
 *
 * The transaction is READ COMMITTED on purpose: every statement after the lock
 * sees the latest committed data. Under SERIALIZABLE the snapshot is taken by
 * the lock statement itself, before the wait, so each queued mint read stale
 * data and failed with a serialization error once the mint ahead of it
 * committed.
 */
export async function mintCardAtomically(
  params: MintCardParams
): Promise<MintCardResult> {
  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        // 1. Lock the episode row to serialize with other mints and event fires
        const episodes: any[] = await tx.$queryRaw`
          SELECT * FROM episodes WHERE id = ${params.episodeId} FOR UPDATE
        `;
        const ep = episodes[0];

        if (!ep) {
          throw new MintError('Episode not found', 'NOT_FOUND', 404);
        }
        if (ep.status !== 'live') {
          throw new MintError(
            'Episode is not accepting cards',
            'INVALID_STATUS',
            400
          );
        }
        if (ep.max_cards && ep.cards_minted >= ep.max_cards) {
          throw new MintError('Episode is sold out', 'SOLD_OUT', 400);
        }

        // 2. Check for existing card (unique constraint is the ultimate backstop)
        const existing = await tx.card.findUnique({
          where: {
            episodeId_holderId: {
              episodeId: params.episodeId,
              holderId: params.holderId,
            },
          },
        });
        if (existing) {
          throw new MintError(
            'Already have a card for this episode',
            'DUPLICATE',
            400
          );
        }

        // 3. Atomically increment cardsMinted (and totalRevenue for paid cards)
        const updatedEpisode = await tx.episode.update({
          where: { id: params.episodeId },
          data: {
            cardsMinted: { increment: 1 },
            ...(params.pricePaid
              ? { totalRevenue: { increment: params.pricePaid } }
              : {}),
          },
        });
        const cardNumber = updatedEpisode.cardsMinted;

        // 4. Fetch event definitions for grid generation
        const eventDefinitions = await tx.eventDefinition.findMany({
          where: { episodeId: params.episodeId },
          orderBy: { sortOrder: 'asc' },
        });

        // 5. Generate grid and mark already-fired events
        type EventDef = (typeof eventDefinitions)[number];
        const grid = generateCardGrid(
          eventDefinitions.map((e: EventDef) => ({
            id: e.id,
            episodeId: e.episodeId,
            name: e.name,
            icon: e.icon,
            description: e.description,
            triggerType: e.triggerType as TriggerType,
            triggerConfig: e.triggerConfig as unknown as TriggerConfig | null,
            firedAt: e.firedAt,
            firedCount: e.firedCount,
            createdAt: e.createdAt,
            order: e.sortOrder,
          })),
          updatedEpisode.gridSize
        );

        const firedEventIds = eventDefinitions
          .filter((e: EventDef) => e.firedAt !== null)
          .map((e: EventDef) => e.id);

        let markedCount = 0;
        for (let row = 0; row < grid.length; row++) {
          for (let col = 0; col < grid[row].length; col++) {
            if (firedEventIds.includes(grid[row][col].eventId)) {
              grid[row][col].marked = true;
              grid[row][col].markedAt = new Date();
              markedCount++;
            }
          }
        }

        // 6. Create the card. Squares pre-marked above can already complete
        // patterns, and the fire-event paths only re-detect patterns on cards
        // they mark a new square on, so record them now.
        const card = await tx.card.create({
          data: {
            episodeId: params.episodeId,
            holderId: params.holderId,
            grid: grid as any,
            markedSquares: markedCount,
            patterns: detectPatterns(grid) as unknown as Prisma.InputJsonValue,
            cardNumber,
            ...(params.paymentId ? { paymentId: params.paymentId } : {}),
            ...(params.pricePaid ? { pricePaid: params.pricePaid } : {}),
          },
        });

        return { card, cardNumber };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 10000,
      }
    )
  );
}
