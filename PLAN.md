# Plan: Fix Remaining Race Conditions

## Issue 1: Card Minting Race Condition

### Problem
Two concurrent mint requests can both pass the `maxCards` check and both read the same
`cardsMinted` value, producing duplicate `cardNumber` values and exceeding the cap.

**Affected code paths:**
- `apps/api/src/routes/cards.ts` — `POST /mint/:episodeId` (free cards)
- `apps/api/src/routes/webhooks.ts` — `handlePaymentSuccess()` (paid cards via Stripe webhook)

**Race window:**
```
Request A: reads cardsMinted=5, maxCards=6 → passes check
Request B: reads cardsMinted=5, maxCards=6 → passes check
Request A: creates card with cardNumber=6, increments to 6
Request B: creates card with cardNumber=6, increments to 7  ← DUPLICATE + OVER CAP
```

### Solution
Wrap the check-then-create-then-increment sequence in a Prisma interactive transaction
with `Serializable` isolation level. Use an atomic conditional update on `cardsMinted`
(increment WHERE cardsMinted < maxCards) as the concurrency guard, and derive `cardNumber`
from the post-increment value.

### Steps

#### Step 1: Create a shared helper `mintCardAtomically` in a new file

**File:** `apps/api/src/services/card-mint.service.ts`

This helper encapsulates the entire mint-card logic inside a serializable transaction:

```typescript
import { prisma } from '../db/client.js';
import { Prisma } from '@prisma/client';
import { generateCardGrid, detectPatterns } from '@streamtree/shared';

interface MintCardParams {
  episodeId: string;
  holderId: string;
  paymentId?: string;
  pricePaid?: number;
}

interface MintCardResult {
  card: any;
  cardNumber: number;
  markedSquares: number;
}

export async function mintCardAtomically(params: MintCardParams): Promise<MintCardResult> {
  return prisma.$transaction(async (tx) => {
    // 1. Lock the episode row with a SELECT ... FOR UPDATE via raw query
    const episodes = await tx.$queryRaw<Array<any>>`
      SELECT * FROM episodes WHERE id = ${params.episodeId} FOR UPDATE
    `;
    const episode = episodes[0];

    if (!episode) throw new Error('Episode not found');
    if (episode.status !== 'live') throw new Error('Episode is not accepting cards');
    if (episode.max_cards && episode.cards_minted >= episode.max_cards) {
      throw new Error('Episode is sold out');
    }

    // 2. Check for existing card (unique constraint as fallback)
    const existing = await tx.card.findUnique({
      where: {
        episodeId_holderId: {
          episodeId: params.episodeId,
          holderId: params.holderId,
        },
      },
    });
    if (existing) throw new Error('Already have a card for this episode');

    // 3. Atomically increment cardsMinted and get the new value
    const updatedEpisode = await tx.episode.update({
      where: { id: params.episodeId },
      data: {
        cardsMinted: { increment: 1 },
        ...(params.pricePaid ? { totalRevenue: { increment: params.pricePaid } } : {}),
      },
    });
    const cardNumber = updatedEpisode.cardsMinted; // post-increment = correct number

    // 4. Fetch event definitions for grid generation
    const eventDefinitions = await tx.eventDefinition.findMany({
      where: { episodeId: params.episodeId },
      orderBy: { sortOrder: 'asc' },
    });

    // 5. Generate grid and mark already-fired events
    const grid = generateCardGrid(
      eventDefinitions.map((e) => ({
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
      episode.grid_size
    );

    const firedEventIds = eventDefinitions
      .filter((e) => e.firedAt !== null)
      .map((e) => e.id);

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

    return { card, cardNumber, markedSquares: markedCount };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 10000, // 10s timeout for blockchain-heavy flows
  });
}
```

#### Step 2: Refactor `cards.ts` mint endpoint to use the helper

Replace the check/create/increment sequence in `POST /mint/:episodeId` with a call to
`mintCardAtomically()`. Keep the blockchain minting and WebSocket broadcasting OUTSIDE
the transaction (they don't need atomicity and would slow down the lock).

**Changes to `apps/api/src/routes/cards.ts`:**
- Remove: episode status check, maxCards check, existing card check, grid generation,
  card creation, episode stats update (lines ~148-285)
- Replace with: single call to `mintCardAtomically({ episodeId, holderId })`
- Keep: blockchain minting (after transaction), broadcastStats (after transaction),
  response building

#### Step 3: Refactor `webhooks.ts` paid card handler to use the helper

Same refactor for `handlePaymentSuccess()`:
- Replace: maxCards check, grid generation, card creation, episode stats update
  (lines ~119-201)
- Replace with: single call to `mintCardAtomically({ episodeId, holderId: userId,
  paymentId: paymentIntent.id, pricePaid: paymentIntent.amount })`
- Keep: refund logic on failure, pending payment update, WebSocket notifications

#### Step 4: Map AppError codes from service exceptions

The helper throws plain `Error` messages. The callers need to map these to proper
`AppError` responses:
- `'Episode not found'` → 404 NOT_FOUND
- `'Episode is not accepting cards'` → 400 INVALID_STATUS
- `'Episode is sold out'` → 400 SOLD_OUT
- `'Already have a card for this episode'` → 400 DUPLICATE

---

## Issue 2: Double Withdrawal Race Condition

### Problem
Two concurrent withdrawal requests both calculate the same `available` amount, both
create withdrawal records, and both initiate separate Stripe transfers (each with a
unique idempotency key from their unique withdrawal ID).

**Affected code:** `apps/api/src/routes/payments.ts` — `POST /withdraw/:episodeId`

**Race window:**
```
Request A: reads withdrawals, calculates available=$100
Request B: reads withdrawals, calculates available=$100
Request A: creates withdrawal record, transfers $100
Request B: creates withdrawal record, transfers $100  ← DOUBLE PAYOUT
```

### Solution
Wrap the availability check + withdrawal creation inside a Prisma interactive transaction
with `Serializable` isolation, using `SELECT ... FOR UPDATE` on the episode row to
serialize concurrent withdrawal attempts.

### Steps

#### Step 1: Refactor the withdrawal endpoint in `payments.ts`

Wrap the critical section (lines 224-281) in `prisma.$transaction()`:

```typescript
const { withdrawal, available } = await prisma.$transaction(async (tx) => {
  // 1. Lock the episode row
  const episodes = await tx.$queryRaw<Array<any>>`
    SELECT * FROM episodes
    WHERE id = ${episodeId}
    AND streamer_id = ${req.user!.id}
    FOR UPDATE
  `;
  const episode = episodes[0];

  if (!episode) throw new AppError('Episode not found', 404, 'NOT_FOUND');
  if (episode.status !== 'ended') {
    throw new AppError('Episode must be ended before withdrawal', 400, 'INVALID_STATUS');
  }

  // 2. Get withdrawals within the transaction (sees consistent snapshot)
  const withdrawals = await tx.withdrawal.findMany({
    where: { episodeId },
  });

  // 3. Calculate available (same logic as before)
  const completedWithdrawals = withdrawals
    .filter(w => w.status === 'completed')
    .reduce((sum, w) => sum + w.netAmount, 0);
  const pendingWithdrawals = withdrawals
    .filter(w => w.status === 'pending' || w.status === 'processing')
    .reduce((sum, w) => sum + w.netAmount, 0);

  const netTotal = calculateStreamerPayout(episode.total_revenue);
  const available = netTotal - completedWithdrawals - pendingWithdrawals;

  if (available <= 0) {
    throw new AppError('No funds available for withdrawal', 400, 'NO_FUNDS');
  }

  // 4. Create withdrawal record INSIDE transaction (holds the lock)
  const withdrawalGrossAmount = Math.round((available * 100) / (100 - PLATFORM_FEE_PERCENT));
  const withdrawalPlatformFee = withdrawalGrossAmount - available;

  const withdrawal = await tx.withdrawal.create({
    data: {
      streamerId: req.user!.id,
      episodeId,
      amount: withdrawalGrossAmount,
      platformFee: withdrawalPlatformFee,
      netAmount: available,
      status: 'processing',
    },
  });

  return { withdrawal, available };
}, {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: 10000,
});

// 5. Stripe transfer OUTSIDE transaction (don't hold DB lock during network call)
try {
  const transferId = await createTransfer(available, user.stripeAccountId, episodeId, withdrawal.id);
  await prisma.withdrawal.update({
    where: { id: withdrawal.id },
    data: { stripeTransferId: transferId, status: 'completed', completedAt: new Date() },
  });
  res.json({ success: true, data: { withdrawalId: withdrawal.id, amount: available, status: 'completed' } });
} catch (err: any) {
  // ... existing error handling ...
}
```

#### Step 2: Move episode fetch + auth check before the transaction

The episode ownership check (`episode.streamerId !== req.user!.id`) and user Stripe
account checks should stay OUTSIDE the transaction (they don't need serialization and
reduce lock hold time). Only the availability calculation and withdrawal creation go
inside.

#### Step 3: Handle transaction retry on serialization failure

Prisma may throw a `P2034` error when serializable transactions conflict. Add retry
logic:

```typescript
import { Prisma } from '@prisma/client';

async function withSerializableRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034' &&
        attempt < maxRetries
      ) {
        // Serialization conflict — retry
        await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

This helper should be placed in `apps/api/src/db/client.ts` (or a new
`apps/api/src/utils/transaction.ts`) and used by both the mint and withdrawal
transaction wrappers.

---

## Implementation Order

1. **Create `apps/api/src/utils/transaction.ts`** — `withSerializableRetry` helper
2. **Create `apps/api/src/services/card-mint.service.ts`** — `mintCardAtomically` helper
3. **Refactor `apps/api/src/routes/cards.ts`** — use `mintCardAtomically` in free mint
4. **Refactor `apps/api/src/routes/webhooks.ts`** — use `mintCardAtomically` in paid mint
5. **Refactor `apps/api/src/routes/payments.ts`** — wrap withdrawal in serializable txn
6. **Verify** — ensure all existing test assertions still pass with the new flow

## Risk Notes

- `SELECT ... FOR UPDATE` requires PostgreSQL (already the configured DB)
- Serializable transactions may produce `P2034` on conflict; the retry helper handles this
- Blockchain minting and Stripe transfers MUST stay outside transactions to avoid
  holding DB locks during slow external calls
- The `episodeId_holderId` unique constraint on `Card` is a safety net — if the
  transaction somehow fails to prevent a duplicate, the DB constraint catches it
