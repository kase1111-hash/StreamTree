# StreamTree Refocus Plan

This plan restructures StreamTree from a sprawling v0.1 with 13 API routes, 13 frontend pages, and 17 database tables into a focused product that does one thing well: **sell interactive bingo cards that update live and become NFT collectibles.**

The plan is organized into 5 phases, ordered by dependency. Each phase has a clear goal, a file-level changelist, and a definition of done.

---

## Phase 1: Cut Dead Weight

**Goal:** Remove features that don't serve the core Episode → Card → Collectible lifecycle. Reduce surface area, reclaim complexity budget.

### 1A. Remove Collaborator System

The collaborator system (team management, invitations, revenue splitting) is a separate product. It adds 557 lines of route code, a Prisma model, permission checks threaded through episodes, and two frontend pages — all for a feature no user needs until the core product works.

**Delete files:**
- `apps/api/src/routes/collaborators.ts`
- `apps/web/src/app/dashboard/[id]/collaborators/page.tsx`
- `apps/web/src/app/invitations/page.tsx`
- `packages/e2e-tests/src/collaborators.test.ts`

**Modify files:**

| File | Change |
|------|--------|
| `apps/api/src/index.ts` | Remove `import { collaboratorsRouter }` (line 19) and `app.use('/api/collaborators', ...)` (line 158) |
| `apps/api/prisma/schema.prisma` | Delete `EpisodeCollaborator` model (~lines 298-318). Remove `collaborators EpisodeCollaborator[]` from `User` model (line 36) and `Episode` model (line 74) |
| `apps/api/src/routes/episodes.ts` | Remove collaborator permission checks from stats endpoint (~lines 449-490) and fire-event endpoint (~lines 725-829). Simplify to owner-only checks. |
| `apps/web/src/lib/api.ts` | Delete `collaboratorsApi` export (~lines 350-387) |
| `packages/e2e-tests/src/code-validation.test.ts` | Remove "Collaborators Feature" test section (~lines 100-263) |

**Database:** Run `npx prisma db push` after schema changes to drop `episode_collaborators` table.

### 1B. Remove Chat Keyword Automation

Manual event triggering works. Chat automation adds a route file, a Prisma model, shared type definitions, and complex cooldown logic — all premature.

**Delete files:**
- `apps/api/src/routes/automation.ts`

**Modify files:**

| File | Change |
|------|--------|
| `apps/api/src/index.ts` | Remove `import { automationRouter }` and `app.use('/api/automation', ...)` |
| `apps/api/prisma/schema.prisma` | Delete `ChatKeyword` model (~lines 253-272). Remove `chatKeywords ChatKeyword[]` from `Episode` model (line 73) and `EventDefinition` model (line 100) |
| `packages/shared/src/types/episode.ts` | Remove `ChatTriggerConfig` type definition (~line 94-99). Remove `'chat'` from `TriggerType` union (line 76). Keep `'manual'`, `'twitch'`, `'webhook'` for now |
| `packages/shared/src/types/websocket.ts` | Remove `chatInfo` field from `EventFiredEvent` (line 20) |

### 1C. Remove Custom Webhook Triggers

External webhook integrations are premature. Keep Stripe and Twitch webhooks (they're verified and serve the core flow). Remove the custom webhook feature.

**Modify files:**

| File | Change |
|------|--------|
| `apps/api/src/routes/webhooks.ts` | Delete custom webhook handler (lines ~468-649). Keep Stripe handler (lines ~1-190) and Twitch handler (lines ~191-467) |
| `apps/api/prisma/schema.prisma` | Delete `CustomWebhook` model (~lines 215-232). Remove `customWebhooks CustomWebhook[]` from `Episode` model (line 71) |
| `packages/shared/src/types/episode.ts` | Remove `'webhook'` from `TriggerType` union. Keep `'manual'` and `'twitch'` |

### 1D. Simplify Template System

Keep basic save/load (a streamer's personal templates). Remove the marketplace (browse, popularity, public/private, categories).

**Delete files:**
- `apps/web/src/app/templates/page.tsx` (browse gallery)
- `apps/web/src/app/templates/my/page.tsx` (my templates page)

**Modify files:**

| File | Change |
|------|--------|
| `apps/api/src/routes/templates.ts` | Delete `GET /browse` endpoint (~lines 12-71). Remove `isPublic`, `category`, `usageCount` references from all remaining endpoints. Keep: `GET /my`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/use`, `POST /from-episode/:episodeId` |
| `apps/api/prisma/schema.prisma` | Remove `isPublic`, `usageCount`, `category` fields from `Template` model. Remove associated indexes |
| `apps/web/src/lib/api.ts` | Remove `browse()` method from `templatesApi` (~lines 305-312). Remove `isPublic` and `category` params from `create()` and `update()` |
| `apps/web/src/app/create/page.tsx` | Simplify template selector: load only user's own templates instead of browsing public marketplace |
| `packages/e2e-tests/src/templates.test.ts` | Remove "Browse Templates" describe block (~lines 123-170). Remove assertions on `isPublic`, `category`, `usageCount` |

### 1E. Consolidate Pattern Detection

Three identical copies of the same function exist in the API. The canonical version already lives in `packages/shared/src/utils/patterns.ts` and is properly exported.

**Modify files:**

| File | Change |
|------|--------|
| `apps/api/src/routes/episodes.ts` | Delete `detectCardPatterns()` function (~line 873-907). Add `detectPatterns` to existing `@streamtree/shared` import. Replace calls from `detectCardPatterns(grid)` to `detectPatterns(grid)` |
| `apps/api/src/routes/webhooks.ts` | Delete local `detectPatterns()` function (~line 418-466). Add `detectPatterns` to existing `@streamtree/shared` import |
| `apps/api/src/routes/automation.ts` | If not deleted in 1B, add `import { detectPatterns } from '@streamtree/shared'` and delete local copy (~line 556-599) |

**Definition of Done — Phase 1:**
- `npm run build` passes with 0 errors
- `npm run lint` passes
- `npx prisma db push` succeeds with reduced schema
- Collaborator, automation, custom webhook routes return 404
- Template browse returns 404
- Pattern detection has exactly 1 implementation (shared package)
- Net deletion: ~2,500+ lines of code, 3 Prisma models, 4 frontend pages, 3 API routes

---

## Phase 2: Complete the Revenue Engine

**Goal:** Make paid card minting work end-to-end. This is the single highest-impact change — it turns the product from a free demo into a revenue-generating platform.

### Current State
- Free cards: work end-to-end
- Stripe service: fully implemented (payment intents, Connect, transfers, refunds)
- Stripe webhook: handles `payment_intent.succeeded` and creates cards — but with bugs
- Frontend: shows "Mint Card (Free)" for all episodes
- `cards.ts:174-176`: returns `NOT_IMPLEMENTED` for paid cards

### 2A. Add Payment Intent Creation Endpoint

**File:** `apps/api/src/routes/cards.ts`

Add a new route: `POST /api/cards/mint/:episodeId/payment`

Logic:
1. Require authentication
2. Validate episode exists, is live, has `cardPrice > 0`
3. Validate user doesn't already have a card for this episode
4. Validate episode is not sold out (`cardsMinted < maxCards`)
5. Call `stripeService.createPaymentIntent(cardPrice, { episodeId, userId, type: 'card_mint' })`
6. Create/update `PendingPayment` record
7. Return `{ clientSecret, paymentIntentId }` to frontend

### 2B. Fix Webhook Card Creation Bugs

**File:** `apps/api/src/routes/webhooks.ts` (lines ~145-152)

Current bug: event definition mapping is incomplete when creating cards from payment webhooks. Missing fields: `description`, `triggerType`, `triggerConfig`, `firedAt`, `firedCount`, `createdAt`, `order`.

Fixes:
1. Map all event definition fields (match the mapping in `cards.ts:181-193`)
2. Mark squares for events that have already fired (match logic in `cards.ts:197-211`)
3. Update `PendingPayment` status to `completed` after card creation
4. Send user-specific WebSocket notification (`sendToUser`) in addition to episode broadcast

### 2C. Frontend Payment Flow

**File:** `apps/web/src/app/play/[code]/page.tsx`

Changes:
1. Conditional rendering: if `episode.cardPrice > 0`, show "Buy Card — $X.XX" button instead of "Mint Card (Free)"
2. On click: call `paymentsApi.createPaymentIntent(episodeId, token)` to get `clientSecret`
3. Show Stripe Payment Element (from `@stripe/react-stripe-js`) in a modal
4. On payment confirmation: show loading state, wait for WebSocket `card:minted` event
5. On success: redirect to card view

**New dependency:** `@stripe/stripe-js` and `@stripe/react-stripe-js` in `apps/web/package.json`

**New file:** `apps/web/src/components/PaymentModal.tsx` — extracted Stripe Payment Element component

### 2D. Remove NOT_IMPLEMENTED Block

**File:** `apps/api/src/routes/cards.ts` (line ~174-176)

Replace the `NOT_IMPLEMENTED` response with a redirect to the payment intent endpoint, or return an error with the payment URL so the frontend knows to initiate payment.

**Definition of Done — Phase 2:**
- A viewer can visit `/play/[code]` for a paid episode, click "Buy Card", pay with Stripe, and receive a card
- Card is created with correct grid, marked squares for already-fired events, and all event metadata
- WebSocket notifies the specific user and the episode room
- Streamer sees revenue increment in dashboard
- PendingPayment record tracks the full lifecycle
- Free cards continue to work unchanged

---

## Phase 3: Harden Smart Contracts

**Goal:** Fix security issues that would block mainnet deployment. All changes are in `packages/contracts/`.

### 3A. Add Missing Reentrancy Guards

**File:** `packages/contracts/contracts/StreamTree.sol`

| Function | Line | Change |
|----------|------|--------|
| `createRoot()` | ~154 | Add `nonReentrant` modifier |
| `endRoot()` | ~191 | Add `nonReentrant` modifier |

Both functions call `_safeMint()` which executes external code via `onERC721Received`. The `nonReentrant` modifier is already used on `mintBranch()`, `mintFruit()`, and `batchMintFruit()` — this is a consistency fix.

### 3B. Fix Authorization Model

**File:** `packages/contracts/contracts/StreamTree.sol` (lines 123-126)

Current:
```solidity
modifier onlyAuthorizedMinter() {
    require(authorizedMinters[msg.sender] || msg.sender == owner(), "Not authorized minter");
    _;
}
```

Fix: Remove the `|| msg.sender == owner()` bypass. The owner is already set as an authorized minter in the constructor (line 142: `authorizedMinters[msg.sender] = true`). The bypass creates a privilege escalation vector — if a new owner is set via `transferOwnership()`, they gain minting rights without explicit authorization.

```solidity
modifier onlyAuthorizedMinter() {
    require(authorizedMinters[msg.sender], "Not authorized minter");
    _;
}
```

### 3C. Block Approvals on Soulbound Fruits

**File:** `packages/contracts/contracts/StreamTree.sol`

The `_update()` override (lines 409-422) prevents fruit transfers, but `approve()` and `setApprovalForAll()` still succeed for fruits — confusing UX where approval works but transfer fails.

Add overrides:
```solidity
function approve(address to, uint256 tokenId) public override {
    require(tokenType[tokenId] != TokenType.Fruit, "Cannot approve soulbound tokens");
    super.approve(to, tokenId);
}
```

For `setApprovalForAll()`: this applies to all tokens, not per-token. Leave it as-is — the `_update()` override already prevents actual transfers. Document this decision.

### 3D. Constructor Validation

**File:** `packages/contracts/contracts/StreamTree.sol` (line ~141)

Add: `require(_platformAddress != address(0), "Invalid platform address");`

This matches the validation in `setPlatformAddress()` (line 398) for consistency.

### 3E. Add Pagination to getRootBranches

**File:** `packages/contracts/contracts/StreamTree.sol` (lines 359-361)

Replace the current function that returns the entire array with a paginated version:
```solidity
function getRootBranches(uint256 rootId, uint256 offset, uint256 limit) external view returns (uint256[] memory)
```

Add a helper: `getRootBranchCount(uint256 rootId) external view returns (uint256)`

### 3F. Expand Test Coverage

**File:** `packages/contracts/test/StreamTree.test.ts`

Add test cases for:
- Reentrancy protection on `createRoot()` and `endRoot()`
- Authorization without owner bypass
- `approve()` reverts on fruit tokens
- Constructor with `address(0)` reverts
- Paginated `getRootBranches()` with offset/limit
- `batchMintFruit()` with invalid branch IDs
- Max supply = 1 (create root, mint 1 branch, fail on 2nd)
- `safeTransferFrom()` fails on fruits (not just `transferFrom()`)

**Definition of Done — Phase 3:**
- All existing tests pass
- 15+ new test cases pass
- No reentrancy vectors remain
- Owner cannot bypass authorization without explicit minter status
- Fruit approvals revert
- Constructor validates inputs
- Contract is ready for professional audit

---

## Phase 4: Frontend Cleanup

**Goal:** Fix type safety, extract god-components, add error recovery. Make the frontend reliable enough to support paying users.

### 4A. Replace `any` Types with Shared Types

The shared package exports `GridSquare`, `Pattern`, `Card`, `LeaderboardEntry`, `Episode`, `EventDefinition` — all of which are currently ignored in the frontend.

| File | Change |
|------|--------|
| `apps/web/src/app/create/page.tsx` | Replace `events: any[]` with `EventDefinition[]` |
| `apps/web/src/app/dashboard/[id]/page.tsx` | Replace `leaderboard: any[]` with `LeaderboardEntry[]`. Type `handleEpisodeEvent` parameter |
| `apps/web/src/app/play/[code]/page.tsx` | Replace `grid: any[][]` with `GridSquare[][]`, `patterns: any[]` with `Pattern[]`, `leaderboard: any[]` with `LeaderboardEntry[]` |
| `apps/web/src/app/gallery/page.tsx` | Replace `patterns: any[]` with `Pattern[]` |
| `apps/web/src/components/Leaderboard.tsx` | Replace `patterns: number \| any[]` with proper `Pattern[]` type |
| `apps/web/src/lib/api.ts` | Remove `as any` casts. Type all return values |

### 4B. Extract God-Components

**`apps/web/src/app/create/page.tsx`** — Split into:
- `CreateEpisodeForm.tsx` — name, grid size, price, max cards
- `EventsSetup.tsx` — add/remove/reorder events
- `TemplateSelector.tsx` — load user's templates

**`apps/web/src/app/play/[code]/page.tsx`** — Split into:
- `EpisodeInfo.tsx` — episode details, streamer info, status
- `MintCard.tsx` — mint button, payment flow (free or paid)
- Page component orchestrates these + existing `CardRenderer`, `Leaderboard`

### 4C. Add Error Recovery

Every page that makes API calls should have:
1. Error boundary wrapping the main content
2. Retry button on failed loads (not just a static error message)
3. WebSocket reconnection indicator (already has basic retry — add visual feedback)

Priority pages: `/play/[code]`, `/dashboard/[id]`, `/card/[id]`

### 4D. Build Results Page

**New file:** `apps/web/src/app/episodes/[id]/results/page.tsx`

This page is referenced in the dashboard (`/episodes/${episodeId}/results`) but doesn't exist. It's the emotional payoff — showing the final leaderboard, patterns achieved, and collectible NFTs after a show ends.

Content:
- Final leaderboard (all cards, sorted by patterns/score)
- Episode summary (events fired, cards minted, revenue earned)
- Individual card preview with final state
- Link to gallery for collectible display

**Definition of Done — Phase 4:**
- Zero `any` types in frontend page components
- Create and Play pages split into focused components
- All pages have retry-on-error capability
- Results page renders with correct data after episode end
- `npm run build` passes with 0 TypeScript errors

---

## Phase 5: Optimize and Test the Core Loop

**Goal:** Make the full lifecycle (create → play → collect) performant and tested.

### 5A. Fix N+1 Episode End

**File:** `apps/api/src/routes/episodes.ts` (~lines 362-425)

The episode-end handler updates cards one-by-one in a loop. Replace with a batched approach:
1. Batch mint fruit tokens (already exists: `batchMintFruitTokens`)
2. Batch update cards with `prisma.card.updateMany()` or `prisma.$transaction()` with grouped updates
3. Single WebSocket broadcast at the end (not per-card)

### 5B. Fix WebSocket JWT Validation

**File:** `apps/api/src/websocket/server.ts` (line ~62-65)

Use the same `getJwtSecret()` function from `apps/api/src/middleware/auth.ts` instead of raw `process.env.JWT_SECRET!`. Import and reuse the validated secret.

### 5C. Add Integration Tests for Core Flow

**New file:** `packages/e2e-tests/src/core-flow.test.ts`

Test the complete lifecycle:
1. Create episode with events → verify draft state
2. Launch episode → verify live state, root token created
3. Mint free card → verify grid, marked squares, WebSocket event
4. Fire events → verify cards updated, patterns detected
5. End episode → verify cards frozen, fruit tokens minted
6. Verify gallery shows collectible

### 5D. Add WebSocket Integration Tests

**New file:** `packages/e2e-tests/src/websocket.test.ts`

Test real-time flows:
1. Connect to WebSocket → verify auth
2. Subscribe to episode → receive updates
3. Fire event → verify all subscribers notified
4. Card update → verify specific user notified
5. Reconnection → verify state recovery

**Definition of Done — Phase 5:**
- Episode end completes in < 5 seconds for 100 cards
- WebSocket JWT validation is consistent with HTTP auth
- Core flow integration test passes end-to-end
- WebSocket integration test passes with real connections

---

## Phase Summary

| Phase | Goal | Key Metric | Estimated Scope |
|-------|------|------------|-----------------|
| **1. Cut** | Remove feature creep | -2,500+ lines, -3 Prisma models, -4 pages, -3 routes | Medium (deletions + cleanup) |
| **2. Revenue** | Paid cards work | Viewer can pay → receive card → play live | Large (new endpoint + frontend flow + bug fixes) |
| **3. Contracts** | Security hardened | All 5 vulnerabilities fixed, 15+ new tests | Medium (contract changes + tests) |
| **4. Frontend** | Type-safe, componentized | Zero `any` types, god-components split | Medium (refactoring) |
| **5. Optimize** | Core loop fast and tested | E2E tests pass, N+1 fixed | Medium (optimization + tests) |

**After all 5 phases:** StreamTree has 1 complete product (stream bingo with paid NFT cards), security-hardened contracts, a type-safe frontend, and integration tests covering the core lifecycle. The codebase is smaller, more focused, and ready for real users.
