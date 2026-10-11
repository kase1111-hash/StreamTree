/**
 * Concurrency tests for minting, firing events and ending episodes.
 *
 * Races are forced deterministically: a test holds a real row lock to freeze one
 * side, waits until Postgres reports the other side blocked on it, then lets it
 * go. Correct code gives the same result in every interleaving, so these tests
 * can't flake on it.
 *
 * Needs DATABASE_URL and JWT_SECRET (the API's), as in CI. Users, episodes and
 * pre-existing cards are created in the database directly, so only the requests
 * under test go through the API and its rate limiters.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { api, randomString } from './utils';

const canRun = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);
if (process.env.CI && !canRun) {
  throw new Error('DATABASE_URL and JWT_SECRET must be set to run the mint/fire race tests in CI');
}

describe.skipIf(!canRun)('Minting and firing concurrently', () => {
  let prisma: PrismaClient;
  let streamer: { id: string; token: string };

  async function createUser(isStreamer = false) {
    const user = await prisma.user.create({
      data: {
        username: `race_${randomString()}`,
        authProvider: 'test',
        authProviderId: randomUUID(),
        isStreamer,
      },
    });
    const token = jwt.sign(
      { userId: user.id, username: user.username, isStreamer },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    return { id: user.id, token };
  }

  // One event on a 3x3 grid means every square is that event
  async function liveEpisode(events = ['Only Event']) {
    return prisma.episode.create({
      data: {
        streamerId: streamer.id,
        name: `Race ${randomString()}`,
        gridSize: 3,
        shareCode: randomString(10),
        status: 'live',
        launchedAt: new Date(),
        eventDefinitions: {
          create: events.map((name, sortOrder) => ({ name, sortOrder })),
        },
      },
      include: { eventDefinitions: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async function mint(episodeId: string, token: string) {
    return api(`/api/cards/mint/${episodeId}`, { method: 'POST', token });
  }

  async function fire(episodeId: string, eventId: string) {
    return api(`/api/episodes/${episodeId}/events/${eventId}/fire`, {
      method: 'POST',
      token: streamer.token,
    });
  }

  // Holds a row lock in its own transaction until the returned release() is called
  async function holdRowLock(table: 'cards' | 'episodes' | 'users', id: string) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let onLocked!: () => void;
    const locked = new Promise<void>((resolve) => (onLocked = resolve));
    const done = prisma.$transaction(
      async (tx) => {
        if (table === 'cards') {
          await tx.$queryRaw`SELECT id FROM cards WHERE id = ${id} FOR UPDATE`;
        } else if (table === 'episodes') {
          await tx.$queryRaw`SELECT id FROM episodes WHERE id = ${id} FOR UPDATE`;
        } else {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
        }
        onLocked();
        await released;
      },
      { timeout: 30_000 }
    );
    // Surface a failure to take the lock instead of waiting forever
    await Promise.race([locked, done]);
    return async () => {
      release();
      await done;
    };
  }

  // Waits until `count` sessions are blocked on a lock, or `settled` resolves
  // (code that doesn't take the lock finishes without blocking)
  async function waitForLockWaiters(count: number, settled?: Promise<unknown>) {
    let finished = false;
    settled?.then(() => (finished = true), () => (finished = true));
    for (let i = 0; i < 400; i++) {
      const rows = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
      `;
      if (rows[0].n >= count || finished) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for ${count} blocked session(s)`);
  }

  async function storedCard(episodeId: string, holderId: string) {
    return prisma.card.findUniqueOrThrow({
      where: { episodeId_holderId: { episodeId, holderId } },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    streamer = await createUser(true);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('marks a card minted while the fire is still updating other cards', async () => {
    const episode = await liveEpisode();
    const eventId = episode.eventDefinitions[0].id;
    const early = await mint(episode.id, (await createUser()).token);
    expect(early.success).toBe(true);
    const lateViewer = await createUser();

    // Stall the fire on the existing card, then mint a new one
    const release = await holdRowLock('cards', early.data.id);
    let firing: ReturnType<typeof fire> | undefined;
    let late;
    try {
      firing = fire(episode.id, eventId);
      await waitForLockWaiters(1, firing);
      late = await mint(episode.id, lateViewer.token);
    } finally {
      await release();
    }

    expect((await firing!).success).toBe(true);
    expect(late.success).toBe(true);
    expect((await storedCard(episode.id, lateViewer.id)).markedSquares).toBe(9);
  });

  it('marks a card whose mint was in progress for the whole fire', async () => {
    const episode = await liveEpisode();
    const eventId = episode.eventDefinitions[0].id;
    const viewer = await createUser();

    // Stall the mint on the episode row, then fire while it waits
    const release = await holdRowLock('episodes', episode.id);
    let minting: ReturnType<typeof mint> | undefined;
    let firing: ReturnType<typeof fire> | undefined;
    try {
      minting = mint(episode.id, viewer.token);
      await waitForLockWaiters(1, minting);
      firing = fire(episode.id, eventId);
      await waitForLockWaiters(2, firing);
    } finally {
      await release();
    }
    const [minted, fired] = await Promise.all([minting!, firing!]);

    expect(minted.success).toBe(true);
    expect(fired.success).toBe(true);
    expect((await storedCard(episode.id, viewer.id)).markedSquares).toBe(9);
  });

  it('marks a card whose mint read the events just before the fire', async () => {
    const episode = await liveEpisode();
    const eventId = episode.eventDefinitions[0].id;
    const viewer = await createUser();

    // Park the mint after it has read which events fired but before its card
    // commits: queue it on the episode row, lock the viewer's user row (the
    // card insert's foreign-key check needs it), then let the mint proceed
    const releaseEpisode = await holdRowLock('episodes', episode.id);
    let releaseUser: (() => Promise<void>) | undefined;
    let minting: ReturnType<typeof mint> | undefined;
    let firing: ReturnType<typeof fire> | undefined;
    try {
      minting = mint(episode.id, viewer.token);
      await waitForLockWaiters(1, minting);
      releaseUser = await holdRowLock('users', viewer.id);
    } finally {
      await releaseEpisode();
    }
    try {
      await waitForLockWaiters(1, minting);
      // The fire must wait for that mint rather than miss its card
      firing = fire(episode.id, eventId);
      await waitForLockWaiters(2, firing);
    } finally {
      await releaseUser?.();
    }
    const [minted, fired] = await Promise.all([minting!, firing!]);

    expect(minted.success).toBe(true);
    expect(fired.success).toBe(true);
    expect((await storedCard(episode.id, viewer.id)).markedSquares).toBe(9);
  });

  it('keeps the marks of two events fired at the same time', async () => {
    const episode = await liveEpisode(['First', 'Second']);
    const [first, second] = episode.eventDefinitions;
    const viewer = await createUser();
    const minted = await mint(episode.id, viewer.token);
    expect(minted.success).toBe(true);

    // Make both fires reach the same card together
    const release = await holdRowLock('cards', minted.data.id);
    let firing: ReturnType<typeof fire>[] = [];
    try {
      firing = [fire(episode.id, first.id), fire(episode.id, second.id)];
      await waitForLockWaiters(2, Promise.all(firing));
    } finally {
      await release();
    }
    const results = await Promise.all(firing);

    expect(results.every((r) => r.success)).toBe(true);
    expect((await storedCard(episode.id, viewer.id)).markedSquares).toBe(9);
  });

  it('marks cards that ending the episode fruits while the fire is running', async () => {
    const episode = await liveEpisode();
    const eventId = episode.eventDefinitions[0].id;
    const grid = Array.from({ length: 3 }, (_, row) =>
      Array.from({ length: 3 }, (_, col) => ({ eventId, position: { row, col }, marked: false, markedAt: null }))
    );
    // The fire visits cards in id order and the end's bulk update in insertion
    // order, so insert the higher id first and lock the lower one: the fire
    // stalls on the locked card while the end fruits the other
    const [lowId, highId] = [randomUUID(), randomUUID()].sort();
    const holders = [await createUser(), await createUser()];
    for (const [i, id] of [highId, lowId].entries()) {
      await prisma.card.create({
        data: { id, episodeId: episode.id, holderId: holders[i].id, grid, cardNumber: i + 1 },
      });
    }

    const release = await holdRowLock('cards', lowId);
    let firing: ReturnType<typeof fire> | undefined;
    let ending: ReturnType<typeof api> | undefined;
    try {
      firing = fire(episode.id, eventId);
      await waitForLockWaiters(1, firing);
      ending = api(`/api/episodes/${episode.id}/end`, { method: 'POST', token: streamer.token });
      await waitForLockWaiters(2, ending);
    } finally {
      await release();
    }
    const [fired, ended] = await Promise.all([firing!, ending!]);

    expect(fired.success).toBe(true);
    expect(ended.success).toBe(true);
    const cards = await prisma.card.findMany({ where: { episodeId: episode.id } });
    expect(cards.map((c) => [c.status, c.markedSquares])).toEqual([
      ['fruited', 9],
      ['fruited', 9],
    ]);
  });

  it('mints every card when many viewers mint at once', async () => {
    const episode = await liveEpisode();
    const viewers = await Promise.all(Array.from({ length: 10 }, () => createUser()));

    const results = await Promise.all(viewers.map((v) => mint(episode.id, v.token)));

    expect(results.filter((r) => !r.success).map((r) => r.error?.code)).toEqual([]);
    const numbers = results.map((r) => r.data.cardNumber).sort((a: number, b: number) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
