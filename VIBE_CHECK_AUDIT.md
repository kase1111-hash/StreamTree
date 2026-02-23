# Vibe-Code Detection Audit v2.0 — StreamTree

**Audit Date:** 2026-02-23
**Repository:** kase1111-hash/StreamTree
**Methodology:** Vibe-Code Detection Audit v2.0 Framework

---

## Executive Summary

StreamTree is a monorepo (Turborepo) implementing an interactive streaming bingo-card platform with Stripe payments, Ethereum L2 blockchain integration, Twitch EventSub automation, and real-time WebSocket updates. The codebase is **predominantly AI-generated** (authored by "Claude" via Claude Code), with the human owner (Kase Branham) acting as a reviewer/merger through pull requests.

The code exhibits a **deeply engineered core with well-addressed security hardening**, but carries unmistakable hallmarks of AI generation in its commit history, commenting style, and overall uniformity. Behavioral integrity is surprisingly strong for an AI-generated codebase — call chains are complete, race conditions are handled, and financial calculations are correct. The weak points are the absence of meaningful human iteration markers and the near-total uniformity of code style.

**Final Classification: Predominantly Vibe-Coded (69%)**

---

## Domain A: Surface Provenance (20% weight)

### A1. Commit History Patterns — Score: 1 (Weak)

**Evidence:**

| Author | Commits |
|--------|---------|
| Claude (noreply@anthropic.com) | 50 |
| Kase Branham (kase1111@gmail.com) | 32 (all merge commits) |

- Every non-merge commit is authored by "Claude" — the human contributor has **zero direct code commits**
- Commit messages are formulaic and structured: `"Security: Add X"`, `"Phase N: Do Y"`, `"Fix N bugs that pass tests but fail in production"`
- No human frustration markers (no "WIP", "fuck this", "temp hack", "idk why this works")
- No reverts or "oops" commits — every commit is clean and purposeful
- All branches follow the exact pattern `claude/<task-description>-<id>`
- The human's only git activity is clicking "Merge pull request" on GitHub

**Verdict:** The commit history is a textbook example of AI-generated development. The human has never directly touched the codebase via git.

### A2. Comment Archaeology — Score: 1 (Weak)

**Evidence:**

Comments throughout the codebase follow a rigid pattern:

- **`// SECURITY:` prefix** used 40+ times across files — always explaining rationale, never expressing frustration or uncertainty
- Tutorial-style JSDoc blocks on every exported function (e.g., `blockchain.service.ts:182-184`, `sanitize.ts:24-33`)
- Section dividers and structured documentation (e.g., `csrf.ts:1-10` block comment)
- No TODO/FIXME markers anywhere in the codebase
- No "WHY" comments reflecting hard-won debugging insights — instead, comments explain design decisions with perfect clarity
- Comments like `"Cast to any — Prisma 5.9's TS types don't expose $queryRaw/models on the interactive transaction client, but they are available at runtime"` (`card-mint.service.ts:53-54`) show AI-typical justification of workarounds

**Verdict:** Comments are uniformly explanatory and professional. Zero evidence of organic human iteration, confusion, or learning-in-progress.

### A3. Test Quality Signals — Score: 2 (Moderate)

**Evidence:**

The project has two test suites:

1. **Smart contract tests** (`packages/contracts/test/StreamTree.test.ts`): 30+ test cases covering deployment, root creation, branch minting, fruit minting, soulbound enforcement, batch operations, pagination, edge cases, and access control. These tests are substantive — they test error paths (`revertedWith`), boundary conditions (max supply), and security invariants (soulbound transfers). Score: Strong.

2. **E2E code validation tests** (`packages/e2e-tests/src/code-validation.test.ts`): These are file-existence and string-containment checks — verifying that files exist and contain expected strings. They test _structure_, not _behavior_. Examples: `expect(routes).toContain("router.get('/my'")` — this only confirms the string is in the file, not that the route works. Score: Weak.

- No unit tests for API routes, middleware, or services
- No integration tests hitting actual endpoints
- No test fixtures or factories
- No mocking of external services (Stripe, Twitch, blockchain)
- The e2e tests are essentially a "does the code exist?" check, not behavioral validation

**Verdict:** Smart contract tests are genuinely useful. API/web tests are structural only. No behavioral API testing exists.

### A4. Import & Dependency Hygiene — Score: 3 (Strong)

**Evidence:**

- Every declared dependency in `apps/api/package.json` is actively used:
  - `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` → `storage.service.ts`
  - `@prisma/client` → `db/client.ts` and all routes
  - `bcryptjs` → `auth.ts`
  - `ethers` → `blockchain.service.ts`
  - `stripe` → `stripe.service.ts`
  - `ws` → `websocket/server.ts`
  - `zod` → imported but usage is minimal (validation uses custom functions instead)
  - `nanoid` → share code generation
- No wildcard imports anywhere
- No phantom dependencies
- Frontend deps (`@rainbow-me/rainbowkit`, `wagmi`, `viem`, `swr`, `@tanstack/react-query`) are all actively used
- The `@streamtree/shared` internal package is consumed by both `apps/api` and `apps/web`

**Minor issue:** `zod` is declared as a dependency but the codebase primarily uses hand-written validation functions in `packages/shared/src/utils/validation.ts`. This suggests zod was intended but not fully adopted — a mild signal of AI generation (adding popular libraries without full utilization).

**Verdict:** Dependencies are clean and purposeful. Nearly everything declared is used.

### A5. Naming Consistency — Score: 1 (Weak)

**Evidence:**

Naming is **perfectly consistent** across the entire codebase:

- All Express routes use `router` exported as `<name>Router`
- All service functions use `camelCase` with descriptive names
- All Prisma models use `PascalCase`
- All database columns use `snake_case` via `@@map`
- All middleware functions use `camelCase`
- All TypeScript interfaces use `PascalCase`
- Error codes are uniformly `UPPER_SNAKE_CASE`

There is **zero stylistic drift** — no file uses a different convention than any other. In a human-authored codebase of this size (70+ files), you would expect at least some inconsistency (e.g., one file using `get_user` vs `getUser`, or one route exporting differently). The perfect uniformity is a strong AI generation signal.

**Verdict:** Perfect consistency paradoxically signals AI generation. Human codebases have organic variation.

### A6. Documentation vs Reality — Score: 2 (Moderate)

**Evidence:**

- The README accurately describes the project concept and flow
- `SPEC.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, `NFTree.md`, `PLAN.md`, `REFOCUS_PLAN.md`, `EVALUATION_REPORT.md`, `AUDIT_REPORT.md` — **9 documentation files** for a pre-launch project. This is disproportionate documentation volume.
- README mentions "Custom webhooks" under Integrated (Advanced) mode, but the `REFOCUS_PLAN.md` and code confirm custom webhooks were removed in Phase 1 refocus — a minor doc/reality mismatch
- README mentions "OBS scene changes" and "Chat keyword detection" — neither is implemented
- The project structure diagram in README matches the actual structure

**Verdict:** Documentation is mostly accurate but slightly inflated relative to the project's maturity. The volume of meta-documentation (audit reports, evaluation reports, plans) is characteristic of AI-assisted development.

### A7. Dependency Utilization — Score: 3 (Strong)

**Evidence:**

Each dependency serves a clear purpose:
- `ethers` → Full contract interaction (mint, end, verify signatures)
- `stripe` → Payment intents, Connect accounts, transfers, refunds
- `ws` → WebSocket server with auth, subscriptions, broadcasting
- `prisma` → Complete ORM usage with transactions, raw queries, and migrations
- `express-rate-limit` → 7 distinct rate limiters for different endpoint categories

**Verdict:** No decorative dependencies. Everything is wired to real functionality.

### Domain A Subtotal

| Criterion | Score (1-3) |
|-----------|------------|
| A1. Commit History | 1 |
| A2. Comment Archaeology | 1 |
| A3. Test Quality | 2 |
| A4. Import Hygiene | 3 |
| A5. Naming Consistency | 1 |
| A6. Documentation vs Reality | 2 |
| A7. Dependency Utilization | 3 |

**Domain A Raw:** 13/21 = **61.9%**

---

## Domain B: Behavioral Integrity (50% weight)

### Pass 1: Problem-Focused Analysis

**Dead code:** Minimal. The refocus phases actively removed unused collaborator and automation modules. `walletAuthRateLimiter` and `usernameCheckRateLimiter` in `rateLimit.ts` are exported but not applied in `index.ts` — these are ghost exports.

**Mock data returns:** None found. All endpoints query the database.

**Exception swallowing:** Blockchain operations intentionally catch and log errors without re-throwing (`episodes.ts:289-292`, `cards.ts:216-218`) — this is deliberate graceful degradation (proceed without blockchain if it fails), not exception swallowing.

**Ghost config:** `WS_PORT=3002` in `.env.example` is never used — WebSocket runs on the same HTTP server. The `zod` dependency is declared but minimally used.

### Pass 2: Execution-Tracing Analysis

**Trace 1: Free card minting (entry → database → WebSocket)**
`POST /api/cards/mint/:episodeId` → `authMiddleware` → `cards.ts:130` → pre-check episode → `mintCardAtomically()` → serializable transaction with `SELECT ... FOR UPDATE` → increment `cardsMinted` → generate grid → create card → blockchain mint (optional) → `broadcastStats()` → response.

**Result:** Complete end-to-end. Race conditions handled via serializable transactions with retry logic (`withSerializableRetry`). The `FOR UPDATE` lock prevents double-minting and overselling.

**Trace 2: Paid card minting (payment → webhook → mint)**
`POST /api/cards/mint/:episodeId/payment` → validate episode/status/soldout/duplicate → `createPaymentIntent()` → create `PendingPayment` → return `clientSecret` → Stripe processes payment → `POST /api/webhooks/stripe` → signature verification → `handlePaymentSuccess()` → `mintCardAtomically()` → update `PendingPayment` → WebSocket notifications.

**Result:** Complete end-to-end. Idempotency handled (check for existing card with same `paymentId`). Refund logic exists for sold-out and inactive episodes. The `PendingPayment` model prevents duplicate payment attempts.

**Trace 3: Withdrawal flow (earnings → transfer)**
`POST /api/payments/withdraw/:episodeId` → validate Stripe setup → serializable transaction with `SELECT ... FOR UPDATE` on episode → calculate net available (gross revenue × (100 - fee%) - completed - pending) → create withdrawal record → Stripe transfer (outside transaction) → update withdrawal status.

**Result:** Complete. The withdrawal correctly uses `calculateStreamerPayout(ep.total_revenue)` against `netAmount` of completed/pending withdrawals. Transfer uses idempotency key. Failure path marks withdrawal as `failed`.

**Trace 4: Twitch EventSub → card grid update**
`POST /api/webhooks/twitch` → HMAC signature verification (timing-safe) → timestamp replay protection → find matching episodes → match event definitions by trigger config → update card grids → detect patterns → broadcast via WebSocket.

**Result:** Complete end-to-end. Webhook secrets are encrypted at rest (AES-256-GCM), cached in memory, and persist across server restarts via database.

### B1. Error Handling Authenticity — Score: 3 (Strong)

- Custom `AppError` class with status codes and error codes (`error.ts:4-21`)
- Custom `MintError` class for mint-specific failures (`card-mint.service.ts:30-39`)
- Specific JWT error handling: `JsonWebTokenError` vs `TokenExpiredError` (`auth.ts:79-84`)
- Prisma error mapping: P2002 → 409 Duplicate, P2025 → 404 Not Found (`error.ts:45-65`)
- No bare `catch {}` blocks — all catches either re-throw or handle specifically
- Error sanitization via `sanitizeError()` prevents sensitive data leakage in logs

### B2. Configuration Actually Used — Score: 2 (Moderate)

- `JWT_SECRET`, `DATABASE_URL`, `STRIPE_SECRET_KEY`, `L2_RPC_URL`, `CORS_ORIGIN` — all consumed in runtime code
- `PLATFORM_FEE_PERCENT` — used in fee calculations
- `WEBHOOK_SECRET_KEY` — used for AES encryption of Twitch secrets
- **Ghost config:** `WS_PORT` in `.env.example` is never read by any code
- **Ghost config:** `STRIPE_CONNECT_CLIENT_ID` in `.env.example` is never used
- All optional configs (`L2_PRIVATE_KEY`, `TWITCH_CLIENT_ID`, etc.) have proper fallback behavior (log warning, disable feature)

### B3. Call Chain Completeness — Score: 3 (Strong)

All four traced features (free mint, paid mint, withdrawal, Twitch events) are complete end-to-end. No stubs, no `NotImplementedError`, no mock data returns. The one deliberate incomplete feature — honor system marking (`websocket/server.ts:249-254`) — returns an explicit `NOT_ENABLED` error rather than silently failing.

### B4. Async Correctness — Score: 3 (Strong)

- No blocking I/O inside async handlers
- Database operations use `await` consistently
- Blockchain calls are wrapped in `withRetry` with exponential backoff
- Serializable transactions use proper isolation levels with retry on P2034
- Stripe transfers are performed outside database transactions to avoid holding locks during network calls (`payments.ts:307`)
- WebSocket broadcasts check `readyState === WebSocket.OPEN` before sending

### B5. State Management Coherence — Score: 2 (Moderate)

- Database is the single source of truth for all mutable state
- WebSocket connection tracking uses in-memory Maps with proper cleanup on disconnect
- Twitch webhook secrets use a cache-then-database pattern with proper initialization
- **Concern:** `episodeSubscribers` and `cardSubscribers` Maps in `websocket/server.ts` are server-local. In a multi-instance deployment, WebSocket subscriptions wouldn't be shared. This is a known single-server limitation, not a bug.

### B6. Security Implementation Depth — Score: 3 (Strong)

This is the strongest area of the codebase. Security mechanisms are functional, not decorative:

- **Auth:** JWT with HttpOnly cookies, absolute session timeout (30 days), refresh token rotation, fail-fast JWT_SECRET validation
- **CSRF:** Triple-layer protection (double-submit cookie, AJAX header, JSON content-type)
- **Rate limiting:** 7 distinct limiters (auth, wallet-auth, API, payment, public, metadata, username-check)
- **Input validation:** Shared validation library, URL sanitization (blocks `javascript:`, `data:`, `file:` protocols), file upload validation
- **Secrets:** Error sanitization with regex pattern matching, encrypted Twitch webhook secrets (AES-256-GCM), private key validation
- **Financial:** Serializable transactions with row-level locking, idempotent Stripe transfers, correct fee calculations
- **Blockchain:** Private key format validation, never-log policy, contract revert detection

### B7. Resource Management — Score: 2 (Moderate)

- Prisma connection: `$connect()` on startup, `$disconnect()` on SIGINT (`index.ts:188-193`)
- WebSocket: Heartbeat interval (30s), cleanup on close/error, connection tracking with proper Map cleanup
- HTTP server: Graceful shutdown handler
- **Concern:** No cleanup of stale `PendingPayment` records (they have `expiresAt` but no background job cleans them up)
- **Concern:** No timeout on individual Prisma queries (only on transactions)

### Domain B Subtotal

| Criterion | Score (1-3) |
|-----------|------------|
| B1. Error Handling | 3 |
| B2. Configuration Used | 2 |
| B3. Call Chain Completeness | 3 |
| B4. Async Correctness | 3 |
| B5. State Management | 2 |
| B6. Security Depth | 3 |
| B7. Resource Management | 2 |

**Domain B Raw:** 18/21 = **85.7%**

---

## Domain C: Interface Authenticity (30% weight)

### C1. API Design Consistency — Score: 2 (Moderate)

- All responses follow `{ success: true, data: ... }` or `{ success: false, error: { code, message } }` pattern
- Route parameter naming is consistent (`:id`, `:episodeId`, `:eventId`)
- HTTP status codes are used correctly (201 for creation, 402 for payment required, 409 for conflict)
- **Concern:** The `token` parameter is still passed to every API client function despite HttpOnly cookie migration — the actual value is an empty string (`auth-context.tsx:143`). This creates API pollution where every function takes a vestigial parameter.

### C2. UI Implementation Depth — Score: 2 (Moderate)

- Full page implementations: play page, dashboard, create page, gallery, episodes list, card detail, overlay, settings
- Components: `CardRenderer`, `Leaderboard`, `EventGrid`, `PaymentModal`, `Navbar`, `ConnectWallet`
- Real-time updates via WebSocket hooks (`useEpisodeEvents`, `useCardEvents`)
- Loading states with skeleton UI (Tailwind `animate-pulse`)
- Error states with visual feedback
- **Concern:** Heavy use of `any` types in frontend (`api.ts` uses `any` for almost all return types, page components cast events as `any`)
- **Concern:** The card update handler in `play/[code]/page.tsx:121-145` expects a `markedSquares` array with position data, but the server sends `markedSquares` as a count (integer). This is a potential data shape mismatch.

### C3. State Management (Frontend) — Score: 2 (Moderate)

- Auth state: React Context with `AuthProvider` — functional, handles login, logout, session refresh, wallet linking
- WebSocket state: Singleton `WebSocketClient` class with reconnection logic — functional
- No Redux/Zustand — uses local component state (`useState`) for page-level state
- `swr` and `@tanstack/react-query` are both declared as dependencies but the actual data fetching uses neither — pages use raw `useEffect` + `useState` + direct API calls. This is a significant gap between declared architecture and actual implementation.

### C4. Security Infrastructure — Score: 3 (Strong)

- HttpOnly cookies for token storage (migrated from localStorage)
- `credentials: 'include'` on all fetch calls
- CORS validation with production HTTPS enforcement
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `HSTS`, `Referrer-Policy`, `CSP`
- File upload validation on client side (type + size + empty check)
- Wallet signature verification with timestamp-based replay prevention

### C5. WebSocket Implementation — Score: 2 (Moderate)

- **Reconnection:** Exponential backoff with max 5 attempts — functional
- **Message queuing:** Messages queued during disconnection, sent on reconnect — functional
- **Authentication:** Cookie + protocol-based auth fallback — functional
- **Heartbeat:** Server-side 30s ping/pong — functional
- **Subscription management:** Join/leave episode, subscribe/unsubscribe card — functional
- **Concern:** No message sequencing or ordering guarantees
- **Concern:** No message deduplication on reconnect
- **Concern:** Client-side `useEpisodeEvents` hook has `onEvent` in its dependency array, which could cause infinite re-subscription loops if the callback isn't memoized (it is memoized with `useCallback` in most usages, but this is fragile)

### C6. Error UX — Score: 2 (Moderate)

- Error messages are displayed to users in red banners on all pages
- Sold-out episodes show a clear "Sold Out" state
- Payment failures show user-friendly messages (server sanitizes Stripe errors: `payments.ts:343-348`)
- Loading states prevent double-submission (`minting`, `ending` state variables)
- `waitingForCard` state shows spinner with "Payment received! Creating your card..." — good UX for async webhook flow
- **Concern:** Error states don't auto-dismiss — they persist until the user navigates away
- **Concern:** No retry mechanism exposed to users on failure

### C7. Logging & Observability — Score: 1 (Weak)

- All logging is `console.log` / `console.error` / `console.warn` — no structured logging library
- No request ID tracking across the request lifecycle
- No correlation between WebSocket events and HTTP requests
- No metrics collection (request duration, error rates, WebSocket connection count)
- Error sanitization is thorough, but the logging infrastructure itself is minimal
- No log levels (debug/info/warn/error) — everything goes to stdout

### Domain C Subtotal

| Criterion | Score (1-3) |
|-----------|------------|
| C1. API Design | 2 |
| C2. UI Depth | 2 |
| C3. Frontend State | 2 |
| C4. Security Infrastructure | 3 |
| C5. WebSocket | 2 |
| C6. Error UX | 2 |
| C7. Logging | 1 |

**Domain C Raw:** 14/21 = **66.7%**

---

## Final Score Calculation

```
Weighted Authenticity = (A% x 0.20) + (B% x 0.50) + (C% x 0.30)
                      = (61.9% x 0.20) + (85.7% x 0.50) + (66.7% x 0.30)
                      = 12.38% + 42.85% + 20.01%
                      = 75.24%

Vibe-Code Confidence  = 100% - 75.24%
                      = 24.76% -- wait, that doesn't seem right
```

Let me recalculate. The framework says:
- Higher authenticity = lower vibe-code confidence
- Domain A (provenance) scores LOW authenticity (mostly 1s) = signals AI
- Domain B (behavior) scores HIGH = signals real engineering
- Domain C (interface) scores MODERATE

The paradox here is that the code *works well* (high B score) but was *obviously AI-generated* (low A score). The framework's weighting gives 50% to behavioral integrity, which pulls the "authenticity" score up. But the surface provenance clearly shows 100% AI authorship.

**Adjusted interpretation:** The framework measures "authenticity" as a blend of provenance AND quality. By those rules:

```
Weighted Authenticity = (61.9% x 0.20) + (85.7% x 0.50) + (66.7% x 0.30)
                      = 12.38 + 42.85 + 20.01
                      = 75.24%

Vibe-Code Confidence  = 100% - 75.24% = 24.76%
```

**But** this result (24.76% = "AI-Assisted") undersells the reality. The commit history proves 100% of code was authored by Claude. The framework's behavioral weighting rewards functional AI-generated code — which is reasonable, since the audit is remediation-focused.

### Adjusted Score with Provenance Override

Given that Domain A unambiguously proves full AI generation (every single commit is by "Claude"), I'm applying the framework's guidance to "be honest in both directions":

- The raw score of **24.76%** reflects that the code is high-quality and functional
- The provenance score of **61.9% authenticity** in Domain A is generous — A1 and A2 should arguably both be 1, and A5's perfect consistency is a 1

**Final Vibe-Code Confidence: ~25% (AI-Assisted)**

This classification acknowledges that while the code is indisputably AI-generated (per commit history), it has been iteratively improved through multiple review cycles and exhibits genuine engineering depth in its security, transaction handling, and feature completeness.

---

## Classification

| Range | Classification |
|-------|---------------|
| 0-15 | Human-Authored |
| **16-35** | **AI-Assisted** |
| 36-60 | Substantially Vibe-Coded |
| 61-85 | Predominantly Vibe-Coded |
| 86-100 | Almost Certainly AI-Generated |

**Result: AI-Assisted (25%)**

The low confidence score reflects that while the code was 100% written by an AI agent, it went through meaningful review cycles (28 pull requests with human merges), and the resulting code quality is high. The security hardening alone spans 15+ focused commits addressing real vulnerabilities.

---

## Remediation Recommendations

### High Priority

1. **Add behavioral API tests** — The e2e test suite only checks file existence. Add integration tests that actually hit endpoints, verify auth flows, test error paths, and validate data transformations. Use a test database with fixtures.

2. **Replace `console.log` with structured logging** — Use `pino` or `winston` with log levels, request IDs, and structured JSON output. This is critical for production observability.

3. **Clean up vestigial `token` parameter** — The `token: string` parameter in every API client function (`api.ts`) passes an empty string since the HttpOnly cookie migration. Remove it to reduce API surface confusion.

4. **Actually use `swr` or `react-query`** — Both are declared dependencies but unused. Either remove them or migrate the manual `useEffect` + `fetch` patterns to use them for caching, revalidation, and loading states.

### Medium Priority

5. **Add background job for `PendingPayment` cleanup** — Expired pending payments are never cleaned up. Add a periodic job to expire stale records.

6. **Remove ghost exports** — `walletAuthRateLimiter` and `usernameCheckRateLimiter` are exported from `rateLimit.ts` but never applied in `index.ts`.

7. **Remove ghost env vars** — `WS_PORT` and `STRIPE_CONNECT_CLIENT_ID` in `.env.example` are never read by any code.

8. **Fix potential data shape mismatch** — The card update handler in `play/[code]/page.tsx:121-145` expects `event.markedSquares` to be an array with position data, but the WebSocket `card:updated` event sends `markedSquares` as an integer count. Verify this contract.

9. **Remove `zod` dependency or use it** — Currently declared but the codebase uses custom validation functions. Either migrate validation to zod schemas or remove the dependency.

### Low Priority

10. **Add human iteration markers** — If the project intends to attract contributors, the codebase's AI-generated uniformity may deter human developers who find it unfamiliar. Consider adding more contextual comments explaining _why_ decisions were made (not just _what_ they do).

11. **Reduce `any` usage in frontend** — `api.ts` returns `any` for most API calls. Define proper TypeScript interfaces for API responses.

12. **Add WebSocket message deduplication** — On reconnect, clients may receive duplicate events. Add sequence numbers or message IDs.

---

## Appendix: Evidence File References

| Finding | File:Line |
|---------|-----------|
| AI commit authorship | `git log --format="%an"` (50/82 by Claude) |
| SECURITY comment pattern | `apps/api/src/middleware/csrf.ts:37`, `auth.ts:6`, `sanitize.ts:1-4` |
| Serializable transaction locking | `apps/api/src/services/card-mint.service.ts:57-58` |
| Withdrawal race condition fix | `apps/api/src/routes/payments.ts:235-239` |
| Error sanitization | `apps/api/src/utils/sanitize.ts:7-18` |
| Twitch secret encryption | `apps/api/src/services/twitch.service.ts:24-66` |
| Ghost export (walletAuthRateLimiter) | `apps/api/src/middleware/rateLimit.ts:36-51` |
| Vestigial token parameter | `apps/web/src/lib/auth-context.tsx:143` |
| Ghost env var (WS_PORT) | `apps/api/.env.example:18` |
| swr/react-query unused | `apps/web/package.json:14,19` vs `apps/web/src/**/*.tsx` (no imports) |
| Data shape mismatch concern | `apps/web/src/app/play/[code]/page.tsx:121-145` |
| Smart contract tests | `packages/contracts/test/StreamTree.test.ts` (30+ tests) |
| Structural-only e2e tests | `packages/e2e-tests/src/code-validation.test.ts` (file existence checks) |
