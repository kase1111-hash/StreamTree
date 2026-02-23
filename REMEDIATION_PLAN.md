# StreamTree Remediation Plan

**Source:** VIBE_CHECK_AUDIT.md (2026-02-23)
**Goal:** Address all 12 audit findings across 5 phases, ordered by blast radius and dependency chain.

---

## Phase 1: Fix Runtime Bugs (Critical)

These are bugs that will crash or silently fail in production. Fix before any other work.

### 1.1 Fix `card:updated` WebSocket data shape mismatch

**Severity:** Runtime crash
**Audit finding:** C2 (UI Depth), C5 (WebSocket)

The frontend handler treats `event.markedSquares` as an array of objects with `.position` and `.markedAt` properties, but the server sends it as an integer count.

**Server sends** (`apps/api/src/routes/episodes.ts:800`, `apps/api/src/routes/webhooks.ts:379`):
```ts
sendToUser(card.holderId, {
  type: 'card:updated',
  cardId: card.id,
  markedSquares: markedCount,  // <-- number
  patterns,
  triggeredBy: 'manual',
});
```

**Shared type confirms** (`packages/shared/src/types/websocket.ts:22-28`):
```ts
export interface CardUpdatedEvent {
  type: 'card:updated';
  cardId: string;
  markedSquares: number;  // <-- number
  patterns: Pattern[];
  triggeredBy?: string;
}
```

**Frontend expects** (`apps/web/src/app/play/[code]/page.tsx:126-131`):
```ts
const marked = event.markedSquares.find(       // <-- .find() on a number = TypeError
  (m: any) => m.position.row === sq.position.row && m.position.col === sq.position.col
);
return marked ? { ...sq, marked: true, markedAt: marked.markedAt } : sq;
```

**Original spec defined** (`SPEC.md:334-340`):
```ts
interface CardUpdatedEvent {
  type: 'card:updated';
  cardId: string;
  markedSquares: GridSquare[];  // <-- array of GridSquare
  newPatterns: Pattern[];
  totalMarked: number;
}
```

**Fix — Option A (recommended): Change the server to send the spec-defined shape.**

This is the correct fix because the frontend needs per-square position data to update the grid. A count alone isn't enough to know *which* squares changed.

Files to change:

| File | Change |
|------|--------|
| `packages/shared/src/types/websocket.ts:22-28` | Change `markedSquares: number` to `markedSquares: GridSquare[]`, add `totalMarked: number`, rename `patterns` to `newPatterns` |
| `apps/api/src/routes/episodes.ts:~790-803` | After updating card grid, collect the newly-marked `GridSquare[]` objects and send them as `markedSquares`, send `totalMarked` as the count, send `newPatterns` for newly-detected patterns only |
| `apps/api/src/routes/webhooks.ts:~370-382` | Same change — send array of newly-marked grid squares, not a count |

The frontend handler (`play/[code]/page.tsx:120-145`) is already written correctly for the spec shape — no frontend changes needed if you fix the server.

### 1.2 Apply unused rate limiters

**Severity:** Security gap
**Audit finding:** B2 (Configuration Used)

Two rate limiters are exported from `apps/api/src/middleware/rateLimit.ts` but never applied:

| Limiter | Purpose | Where to apply |
|---------|---------|---------------|
| `walletAuthRateLimiter` (5 req/15min) | Prevent wallet auth brute force | `apps/api/src/index.ts:146` — apply to wallet auth route specifically |
| `usernameCheckRateLimiter` (10 req/min) | Prevent username enumeration | `apps/api/src/routes/public.ts` — apply to the `GET /username-available/:username` endpoint |

**File: `apps/api/src/index.ts`**

Current line 146:
```ts
app.use('/api/auth', authRateLimiter, authRouter);
```

The `walletAuthRateLimiter` should be applied inside the auth router to the wallet-specific endpoint (`POST /api/auth/wallet`), since the generic `authRateLimiter` is already applied at the router level. The tighter wallet limiter should be middleware on the specific route.

**File: `apps/api/src/routes/auth.ts`**

Add at the top:
```ts
import { walletAuthRateLimiter } from '../middleware/rateLimit.js';
```

Apply to the wallet auth endpoint:
```ts
router.post('/wallet', walletAuthRateLimiter, async (req: AuthenticatedRequest, res, next) => {
```

**File: `apps/api/src/routes/public.ts`**

Add import and apply `usernameCheckRateLimiter` to the username availability endpoint:
```ts
import { usernameCheckRateLimiter } from '../middleware/rateLimit.js';

router.get('/username-available/:username', usernameCheckRateLimiter, async (req, res, next) => {
```

---

## Phase 2: Behavioral Testing (High Priority)

This is the highest-impact improvement. The project has zero behavioral API tests — only file-existence checks and smart contract tests.

### 2.1 Set up API test infrastructure

**New files to create:**

| File | Purpose |
|------|--------|
| `apps/api/vitest.config.ts` | Vitest config with test database setup |
| `apps/api/src/test/setup.ts` | Test database initialization, cleanup, helpers |
| `apps/api/src/test/fixtures.ts` | Factory functions for User, Episode, Card, EventDefinition |
| `apps/api/src/test/helpers.ts` | `createTestApp()`, `authenticateAs()`, `mintTestCard()` utilities |

**Test database strategy:** Use the same Prisma schema against a separate test database. Set `DATABASE_URL` in test setup to a `streamtree_test` database. Run `prisma db push --force-reset` before each test suite.

**File: `apps/api/vitest.config.ts`**
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
```

**File: `apps/api/src/test/setup.ts`**
```ts
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, afterEach } from 'vitest';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterEach(async () => {
  // Clean up in dependency order
  await prisma.pendingPayment.deleteMany();
  await prisma.withdrawal.deleteMany();
  await prisma.card.deleteMany();
  await prisma.firedEvent.deleteMany();
  await prisma.eventDefinition.deleteMany();
  await prisma.episode.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
```

**File: `apps/api/src/test/fixtures.ts`**
```ts
import { prisma } from './setup';

export async function createUser(overrides: Partial<{ username: string; isStreamer: boolean }> = {}) {
  return prisma.user.create({
    data: {
      username: overrides.username ?? `testuser_${Date.now()}`,
      isStreamer: overrides.isStreamer ?? false,
      authType: 'custodial',
    },
  });
}

export async function createEpisode(streamerId: string, overrides: Partial<{ cardPrice: number; maxCards: number; status: string }> = {}) {
  return prisma.episode.create({
    data: {
      name: `Test Episode ${Date.now()}`,
      streamerId,
      shareCode: `TST${Date.now().toString(36)}`,
      gridSize: 5,
      status: overrides.status ?? 'draft',
      cardPrice: overrides.cardPrice ?? 0,
      maxCards: overrides.maxCards ?? null,
    },
  });
}

export async function createEventDefinition(episodeId: string, name: string, sortOrder: number) {
  return prisma.eventDefinition.create({
    data: {
      episodeId,
      name,
      icon: '🎯',
      triggerType: 'manual',
      sortOrder,
    },
  });
}
```

### 2.2 Write critical path tests

**Priority test files (create these):**

| Test file | Tests | Why critical |
|-----------|-------|-------------|
| `apps/api/src/routes/__tests__/cards.test.ts` | Free mint, paid redirect (402), sold out (400), duplicate card (400), non-live episode (400), concurrent mints (serialization) | This is the money path — card minting |
| `apps/api/src/routes/__tests__/auth.test.ts` | Custodial login, wallet auth with signature verification, token refresh, logout, rate limit exhaustion | Auth bugs = total compromise |
| `apps/api/src/routes/__tests__/payments.test.ts` | Withdrawal calculation (net vs gross), double-withdrawal prevention, Stripe-not-configured error, earnings summary | Financial correctness |
| `apps/api/src/routes/__tests__/webhooks.test.ts` | Stripe signature verification, payment_intent.succeeded flow, card minting after payment, refund on sold-out | Payment webhook = revenue integrity |
| `apps/api/src/middleware/__tests__/auth.test.ts` | Valid JWT, expired JWT, missing cookie, malformed token, HttpOnly cookie extraction | Auth middleware = every protected route |

**Example test — card minting race condition:**
```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../index';
import { createUser, createEpisode, createEventDefinition } from '../test/fixtures';
import { generateToken } from '../test/helpers';

describe('POST /api/cards/mint/:episodeId', () => {
  it('should reject minting for a paid episode with 402', async () => {
    const streamer = await createUser({ isStreamer: true });
    const episode = await createEpisode(streamer.id, { cardPrice: 500, status: 'live' });
    const viewer = await createUser();
    const token = generateToken(viewer);

    const res = await request(app)
      .post(`/api/cards/mint/${episode.id}`)
      .set('Cookie', `access_token=${token}`)
      .expect(402);

    expect(res.body.error.code).toBe('PAYMENT_REQUIRED');
  });

  it('should prevent overselling when maxCards is reached', async () => {
    const streamer = await createUser({ isStreamer: true });
    const episode = await createEpisode(streamer.id, { maxCards: 1, status: 'live' });
    await createEventDefinition(episode.id, 'Event 1', 1);

    const viewer1 = await createUser({ username: 'viewer1' });
    const viewer2 = await createUser({ username: 'viewer2' });

    // First mint succeeds
    await request(app)
      .post(`/api/cards/mint/${episode.id}`)
      .set('Cookie', `access_token=${generateToken(viewer1)}`)
      .expect(201);

    // Second mint fails (sold out)
    const res = await request(app)
      .post(`/api/cards/mint/${episode.id}`)
      .set('Cookie', `access_token=${generateToken(viewer2)}`)
      .expect(400);

    expect(res.body.error.code).toBe('SOLD_OUT');
  });
});
```

**Dependencies to add** to `apps/api/package.json` devDependencies:
```json
{
  "vitest": "^1.2.0",
  "supertest": "^6.3.0",
  "@types/supertest": "^6.0.0"
}
```

Add test script to `apps/api/package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

---

## Phase 3: Observability & Cleanup (Medium Priority)

### 3.1 Replace `console.*` with structured logging

**Audit finding:** C7 (Logging) — scored 1/3 (Weak)
**Impact:** 132 `console.log/error/warn` calls across 16 files in `apps/api/src/`

**Approach:** Install `pino` + `pino-http`. Create a shared logger instance. Replace all `console.*` calls.

**New file: `apps/api/src/utils/logger.ts`**
```ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty' },
  }),
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
```

**New middleware: `apps/api/src/middleware/requestLogger.ts`**
```ts
import pinoHttp from 'pino-http';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

export const requestLogger = pinoHttp({
  logger,
  genReqId: () => randomUUID(),
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      // Don't log headers (may contain tokens)
    }),
  },
});
```

**File changelist — replace `console.*` (all 16 files):**

| File | `console.*` count | Change |
|------|--------------------|--------|
| `routes/webhooks.ts` | 20 | `import { logger } from '../utils/logger.js'` → `logger.info()`, `logger.error()` |
| `services/twitch.service.ts` | 27 | Same pattern — use `logger.child({ service: 'twitch' })` |
| `services/blockchain.service.ts` | 40 | `logger.child({ service: 'blockchain' })` |
| `routes/episodes.ts` | 6 | `logger.child({ route: 'episodes' })` |
| `routes/auth.ts` | 6 | `logger.child({ route: 'auth' })` |
| `index.ts` | 12 | `logger.info('Server started', { port: PORT })` |
| `websocket/server.ts` | 3 | `logger.child({ module: 'websocket' })` |
| `routes/users.ts` | 3 | Replace inline |
| `routes/upload.ts` | 3 | Replace inline |
| `routes/cards.ts` | 2 | Replace inline |
| `routes/payments.ts` | 2 | Replace inline |
| `routes/twitch.ts` | 3 | Replace inline |
| `middleware/auth.ts` | 2 | Replace inline |
| `middleware/error.ts` | 1 | Replace inline |
| `middleware/csrf.ts` | 1 | Replace inline |
| `services/stripe.service.ts` | 1 | Replace inline |

**Dependencies to add** to `apps/api/package.json`:
```json
{
  "pino": "^8.18.0",
  "pino-http": "^9.0.0",
  "pino-pretty": "^10.3.0"
}
```

**Wire in** `apps/api/src/index.ts`:
```ts
import { requestLogger } from './middleware/requestLogger.js';
// Add after cookieParser, before routes:
app.use(requestLogger);
```

### 3.2 Remove vestigial `token` parameter from frontend API client

**Audit finding:** C1 (API Design)
**Impact:** Every API function takes a `token: string` that is always `''`

The `token` parameter was needed pre-cookie migration. Now `credentials: 'include'` handles auth. The `token` param pollutes every call site.

**File: `apps/web/src/lib/api.ts`**

Remove the `token` parameter from the `ApiOptions` interface and the `api()` function. Remove the `Authorization` header logic:

```ts
// BEFORE:
export async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) { headers['Authorization'] = `Bearer ${token}`; }
  ...
}

// AFTER:
export async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  ...
}
```

Then remove `token` from every API object function signature. This touches:

| API Object | Functions to update |
|-----------|---------------------|
| `authApi` | `becomeStreamer()` |
| `episodesApi` | All 12 functions — remove `token` param |
| `cardsApi` | All 6 functions |
| `publicApi` | None (already no token) |
| `usersApi` | All 4 functions |
| `paymentsApi` | All 5 functions |
| `uploadApi` | `uploadArtwork()`, `uploadAvatar()`, `deleteArtwork()` — remove `token` from header |
| `templatesApi` | All 7 functions |

Then update every call site across `apps/web/src/`:

| File | Approximate changes |
|------|---------------------|
| `apps/web/src/lib/auth-context.tsx` | Remove `, ''` from `authApi.refresh('')`, `authApi.logout('')`, `authApi.becomeStreamer('')`, `usersApi.linkWallet('', address)` |
| `apps/web/src/app/play/[code]/page.tsx` | Remove `token` from `cardsApi.*` calls |
| `apps/web/src/app/dashboard/[id]/page.tsx` | Remove `token` from `episodesApi.*` calls |
| `apps/web/src/app/create/page.tsx` | Remove `token` from `episodesApi.create`, `templatesApi.*` |
| `apps/web/src/app/episodes/page.tsx` | Remove `token` from all `episodesApi.*` and `templatesApi.*` calls |
| `apps/web/src/app/gallery/page.tsx` | Remove `token` from `cardsApi.getGallery` |
| `apps/web/src/app/settings/payments/page.tsx` | Remove `token` from `paymentsApi.*` |
| All other pages using `token` | Same pattern |

Also remove `token` from the `AuthContextType` interface and the context provider value in `auth-context.tsx`.

### 3.3 Remove or use `swr` / `@tanstack/react-query`

**Audit finding:** C3 (Frontend State)

Both are declared in `apps/web/package.json` (lines 14, 19) but **zero imports exist** anywhere in `apps/web/src/`. All data fetching uses raw `useEffect` + `useState` + direct API calls.

**Recommended approach:** Remove both. The current pattern works and adding a data-fetching library mid-project without migrating all call sites creates inconsistency.

**File: `apps/web/package.json`**

Remove from `dependencies`:
```diff
-    "@tanstack/react-query": "^5.17.0",
-    "swr": "^2.2.4",
```

**Note:** `@tanstack/react-query` is a peer dependency of `@rainbow-me/rainbowkit`. Check if RainbowKit still works after removing it. If it breaks, keep `@tanstack/react-query` but remove `swr`. RainbowKit may provide its own QueryClient internally.

### 3.4 Remove or use `zod`

**Audit finding:** A4 (Import Hygiene)

`zod` is in `apps/api/package.json` dependencies but the codebase uses hand-written validators in `packages/shared/src/utils/validation.ts`.

**Recommended approach:** Remove `zod` from `apps/api/package.json`. The custom validators are already comprehensive and shared across frontend/backend.

```diff
// apps/api/package.json dependencies
-    "zod": "^3.22.0",
```

Verify no file imports from `zod`:
```bash
grep -r "from 'zod'" apps/api/src/
grep -r "from \"zod\"" apps/api/src/
```

### 3.5 Remove ghost env vars

**Audit finding:** B2 (Configuration)

**File: `apps/api/.env.example`**

```diff
-# WebSocket
-WS_PORT=3002
-
 # Stripe
 STRIPE_SECRET_KEY=sk_test_...
 STRIPE_WEBHOOK_SECRET=whsec_...
-STRIPE_CONNECT_CLIENT_ID=ca_...
```

`WS_PORT` is never read — WebSocket uses the HTTP server (line `index.ts:163`).
`STRIPE_CONNECT_CLIENT_ID` is never read — Connect uses account links, not OAuth.

---

## Phase 4: Resource Management & Reliability (Medium Priority)

### 4.1 Add `PendingPayment` cleanup job

**Audit finding:** B7 (Resource Management)

The `PendingPayment` model has an `expiresAt` field (set to 30 minutes from creation at `cards.ts:306`), but no code ever deletes expired records. Over time this table will grow unbounded.

**New file: `apps/api/src/jobs/cleanup.ts`**
```ts
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';

/**
 * Cleans up expired PendingPayment records.
 * Runs periodically (e.g., every 15 minutes).
 */
export async function cleanupExpiredPayments(): Promise<number> {
  const result = await prisma.pendingPayment.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
      status: 'pending',
    },
  });

  if (result.count > 0) {
    logger.info({ count: result.count }, 'Cleaned up expired pending payments');
  }

  return result.count;
}

/**
 * Starts the periodic cleanup interval.
 * Call on server startup.
 */
export function startCleanupJobs(): NodeJS.Timeout {
  // Run immediately on startup
  cleanupExpiredPayments().catch((err) =>
    logger.error({ err }, 'Cleanup job failed')
  );

  // Then every 15 minutes
  return setInterval(() => {
    cleanupExpiredPayments().catch((err) =>
      logger.error({ err }, 'Cleanup job failed')
    );
  }, 15 * 60 * 1000);
}
```

**Wire in** `apps/api/src/index.ts` — inside the `start()` function after `initializeWebhookSecretsCache()`:
```ts
import { startCleanupJobs } from './jobs/cleanup.js';

// Inside start():
const cleanupInterval = startCleanupJobs();

// Inside SIGINT handler:
clearInterval(cleanupInterval);
```

### 4.2 Add WebSocket message deduplication

**Audit finding:** C5 (WebSocket)

On reconnect, the client re-joins episodes and cards but may receive duplicate events during the transition.

**Server-side: Add sequence numbers to events.**

**File: `apps/api/src/websocket/server.ts`**

Add a per-episode sequence counter:
```ts
const episodeSequence = new Map<string, number>(); // episodeId -> sequence

// In broadcastToEpisode:
export function broadcastToEpisode(episodeId: string, event: ServerToClientEvent) {
  const seq = (episodeSequence.get(episodeId) ?? 0) + 1;
  episodeSequence.set(episodeId, seq);

  const eventWithSeq = { ...event, seq };
  // ... send eventWithSeq
}
```

**Client-side: Track last seen sequence per episode.**

**File: `apps/web/src/lib/websocket.ts`**

Add to the `WebSocketClient` class:
```ts
private lastSeq = new Map<string, number>(); // episodeId -> last seen seq

// In the message handler, skip events with seq <= lastSeq
```

### 4.3 Add error auto-dismiss in frontend

**Audit finding:** C6 (Error UX)

Error banners persist indefinitely. Add auto-dismiss after 8 seconds.

**Pattern to apply in all pages** (`play/[code]/page.tsx`, `dashboard/[id]/page.tsx`, `create/page.tsx`, `episodes/page.tsx`, `gallery/page.tsx`, `settings/payments/page.tsx`):

```ts
// After any setError(message) call:
useEffect(() => {
  if (error) {
    const timer = setTimeout(() => setError(''), 8000);
    return () => clearTimeout(timer);
  }
}, [error]);
```

Or extract as a shared hook:

**New file: `apps/web/src/hooks/useAutoError.ts`**
```ts
import { useState, useEffect } from 'react';

export function useAutoError(dismissMs = 8000) {
  const [error, setError] = useState('');

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), dismissMs);
      return () => clearTimeout(timer);
    }
  }, [error, dismissMs]);

  return [error, setError] as const;
}
```

---

## Phase 5: Type Safety & Documentation (Low Priority)

### 5.1 Replace `any` types in frontend API client

**Audit finding:** C2 (UI Depth)
**Impact:** 30+ uses of `any` in `apps/web/src/lib/api.ts`

**Approach:** Define response interfaces using the shared types, then replace `any` in return types.

**File: `apps/web/src/lib/api.ts`**

Create typed return interfaces at the top of the file or in a separate `apps/web/src/types/api.ts`:

```ts
import type { Pattern, GridSquare } from '@streamtree/shared';

interface EpisodeSummary {
  id: string;
  name: string;
  artworkUrl: string | null;
  status: string;
  cardPrice: number;
  cardsMinted: number;
  maxCards: number | null;
  shareCode: string;
  streamer: { username: string; displayName: string | null };
}

interface CardDetail {
  id: string;
  episodeId: string;
  grid: GridSquare[][];
  markedSquares: number;
  patterns: Pattern[];
  cardNumber: number;
  status: string;
  mintedAt: string;
}

interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isStreamer: boolean;
  walletAddress: string | null;
}
```

Then update each API object:
```ts
// BEFORE:
export const episodesApi = {
  list: (token: string) => api<any[]>('/api/episodes', { token }),
  get: (id: string, token: string) => api<any>(`/api/episodes/${id}`, { token }),
};

// AFTER:
export const episodesApi = {
  list: () => api<EpisodeSummary[]>('/api/episodes'),
  get: (id: string) => api<EpisodeDetail>(`/api/episodes/${id}`),
};
```

### 5.2 Update README to match current state

**Audit finding:** A6 (Documentation vs Reality)

The README mentions removed features. Update these sections:

| Section | Issue | Fix |
|---------|-------|-----|
| "Integrated (Advanced)" | Mentions "Custom webhooks" | Remove — custom webhooks were deleted in Phase 1 refocus |
| "Integrated (Advanced)" | Mentions "OBS scene changes" | Remove — never implemented |
| "Integrated (Advanced)" | Mentions "Chat keyword detection" | Remove — `ChatKeyword` model was deleted |

---

## Execution Checklist

| # | Phase | Finding | Files Changed | Estimated Scope |
|---|-------|---------|--------------|-----------------|
| 1.1 | Phase 1 | `card:updated` data shape | 3 files | Small (type + 2 emitters) |
| 1.2 | Phase 1 | Unused rate limiters | 2 files | Tiny (add imports + middleware) |
| 2.1 | Phase 2 | Test infrastructure | 4 new files | Medium (setup + fixtures) |
| 2.2 | Phase 2 | Critical path tests | 5 new files | Large (50+ test cases) |
| 3.1 | Phase 3 | Structured logging | 18 files (2 new, 16 modified) | Large (132 replacements) |
| 3.2 | Phase 3 | Remove `token` param | ~15 files | Large (API + all pages) |
| 3.3 | Phase 3 | Remove swr/react-query | 1 file | Tiny (package.json) |
| 3.4 | Phase 3 | Remove zod | 1 file | Tiny (package.json) |
| 3.5 | Phase 3 | Remove ghost env vars | 1 file | Tiny (.env.example) |
| 4.1 | Phase 4 | PendingPayment cleanup | 2 files (1 new, 1 modified) | Small |
| 4.2 | Phase 4 | WS message dedup | 2 files | Small |
| 4.3 | Phase 4 | Error auto-dismiss | 1 new + 6 modified | Small |
| 5.1 | Phase 5 | Replace `any` types | 1-2 files | Medium |
| 5.2 | Phase 5 | Update README | 1 file | Tiny |

---

## Dependency Graph

```
Phase 1 (bugs) ─── has no dependencies, do first
    │
    ├── 1.1 card:updated fix
    └── 1.2 rate limiter wiring
         │
Phase 2 (tests) ─── depends on Phase 1 (tests should pass against fixed code)
    │
    ├── 2.1 test infrastructure
    └── 2.2 test cases (depends on 2.1)
         │
Phase 3 (cleanup) ─── can run in parallel with Phase 2
    │
    ├── 3.1 structured logging (independent)
    ├── 3.2 remove token param (independent)
    ├── 3.3 remove swr/react-query (independent)
    ├── 3.4 remove zod (independent)
    └── 3.5 remove ghost env vars (independent)
         │
Phase 4 (reliability) ─── depends on 3.1 (uses logger)
    │
    ├── 4.1 cleanup job (depends on 3.1 for logger)
    ├── 4.2 WS dedup (independent)
    └── 4.3 error auto-dismiss (independent)
         │
Phase 5 (polish) ─── depends on 3.2 (type the new API signatures)
    │
    ├── 5.1 replace any types (depends on 3.2)
    └── 5.2 update README (independent)
```

**Phases 1 and 2 are critical.** The `card:updated` bug (1.1) will cause a runtime `TypeError` in production whenever a streamer fires an event. The missing rate limiters (1.2) leave wallet auth and username enumeration unprotected. Behavioral tests (Phase 2) are the single highest-value addition for long-term code health.
