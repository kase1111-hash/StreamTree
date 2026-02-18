import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { generateCardGrid } from '@streamtree/shared';
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
 * Atomically mints a card inside a serializable transaction.
 *
 * Uses SELECT ... FOR UPDATE on the episode row to serialize concurrent mints,
 * preventing both duplicate cardNumber values and over-minting past maxCards.
 */
export async function mintCardAtomically(
  params: MintCardParams
): Promise<MintCardResult> {
  return withSerializableRetry(() =>
    prisma.$transaction(
      async (txRaw) => {
        // Cast to any — Prisma 5.9's TS types don't expose $queryRaw/models
        // on the interactive transaction client, but they are available at runtime
        const tx = txRaw as any;
        // 1. Lock the episode row to serialize concurrent mints
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
            triggerType: e.triggerType as 'manual' | 'twitch' | 'custom',
            triggerConfig: e.triggerConfig as Record<string, unknown> | null,
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

        // 6. Create the card
        const card = await tx.card.create({
          data: {
            episodeId: params.episodeId,
            holderId: params.holderId,
            grid: grid as any,
            markedSquares: markedCount,
            cardNumber,
            ...(params.paymentId ? { paymentId: params.paymentId } : {}),
            ...(params.pricePaid ? { pricePaid: params.pricePaid } : {}),
          },
        });

        return { card, cardNumber };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      }
    )
  );
}
