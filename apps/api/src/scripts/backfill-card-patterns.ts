/**
 * One-off backfill for cards minted before patterns were recorded at mint time.
 *
 * Cards minted after events had already fired were stored with patterns = []
 * even when their pre-marked squares completed a line. The fire-event paths
 * only re-detect patterns on cards they mark a new square on, and never touch
 * cards in ended episodes, so these cards stay wrong without this script.
 *
 * Stored patterns are always either [] or the full detectPatterns(grid) result,
 * so only [] rows are candidates, and each write is guarded on the row still
 * being [] so a concurrent event fire can't be overwritten. Safe to re-run.
 *
 * Usage, from apps/api after `npm run build`:
 *   npm run backfill:patterns -- --dry-run
 *   npm run backfill:patterns
 */
import { Prisma } from '@prisma/client';
import { detectPatterns } from '@streamtree/shared';
import type { GridSquare } from '@streamtree/shared';
import { prisma } from '../db/client.js';

const BATCH_SIZE = 500;
// No pattern can be complete with fewer marks than the smallest grid's side
const MIN_GRID_SIZE = 3;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  let scanned = 0;
  let updated = 0;
  let lastId: string | undefined;

  for (;;) {
    const cards = await prisma.card.findMany({
      where: {
        patterns: { equals: [] },
        markedSquares: { gte: MIN_GRID_SIZE },
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      select: { id: true, episodeId: true, status: true, fruitTokenId: true, grid: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (cards.length === 0) break;
    lastId = cards[cards.length - 1].id;

    for (const card of cards) {
      scanned++;
      const patterns = detectPatterns(card.grid as unknown as GridSquare[][]);
      if (patterns.length === 0) continue;

      if (!dryRun) {
        const result = await prisma.card.updateMany({
          where: { id: card.id, patterns: { equals: [] } },
          data: { patterns: patterns as unknown as Prisma.InputJsonValue },
        });
        if (result.count === 0) continue; // An event fire already recorded them
      }
      updated++;

      // The on-chain fruit token keeps the pattern count it was minted with
      const onChain = card.fruitTokenId ? `, fruit token ${card.fruitTokenId} keeps its old count` : '';
      console.log(`card ${card.id} (episode ${card.episodeId}, ${card.status}): 0 -> ${patterns.length} patterns${onChain}`);
    }
  }

  console.log(`${dryRun ? '[dry run] ' : ''}Checked ${scanned} cards, ${dryRun ? 'would update' : 'updated'} ${updated}`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
