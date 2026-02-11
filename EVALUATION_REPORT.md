# PROJECT EVALUATION REPORT

**Project:** StreamTree
**Version:** 0.1.0
**Date:** 2026-02-11
**Primary Classification:** Underdeveloped
**Secondary Tags:** Good Concept, Execution Gaps

---

## CONCEPT ASSESSMENT

**What real problem does this solve?**
Passive streaming audiences have no ownership stake in the content they watch. StreamTree turns stream viewership into active participation via interactive bingo cards that become permanent NFT collectibles when a show ends. Streamers get a new revenue channel (card sales); viewers get gamified engagement and proof-of-participation.

**Who is the user? Is the pain real or optional?**
Two-sided market: streamers (creators seeking monetization + engagement) and viewers (fans seeking interactive participation). The viewer pain is optional — nobody *needs* stream bingo — but the streamer pain (monetization beyond subscriptions/donations) is real and well-documented across the creator economy.

**Is this solved better elsewhere?**
Twitch Predictions and Channel Points offer lightweight participation but produce nothing permanent. NFT-based stream engagement tools are sparse. The NFTree model (Root → Branch → Fruit as Episode → Card → Collectible) is a novel framing. The concept has differentiation, though the market for stream NFTs remains unproven.

**Value prop in one sentence:**
StreamTree lets streamers sell interactive bingo cards that update live during a show and become permanent NFT collectibles when the stream ends.

**Verdict:** Sound — the concept maps cleanly to a real creator-economy gap, the NFTree abstraction is elegant, and the two-sided value proposition (streamer revenue + viewer engagement) is coherent. The risk is market appetite for stream NFTs, not concept validity.

---

## EXECUTION ASSESSMENT

### Architecture: Appropriate for Ambition

Turborepo monorepo with clear package boundaries (`apps/api`, `apps/web`, `packages/shared`, `packages/contracts`, `packages/e2e-tests`). The separation is correct: shared types prevent drift, contracts are isolated, and the API/web split follows standard full-stack patterns. No over-engineering in the structural choices.

**Tech stack is well-chosen:**
- Express + Prisma + PostgreSQL for the API — standard, productive, appropriate
- Next.js 14 App Router for the frontend — modern, correct choice
- Solidity + Hardhat + OpenZeppelin for contracts — industry standard
- WebSocket + Redis Pub/Sub for real-time — right tool for live event broadcasting
- Stripe Connect for payments — correct for marketplace payouts

### Code Quality: Uneven

**API layer (7.5/10):** Routes are well-structured with consistent error handling (`try-catch → next(error)`) and real Prisma queries throughout. Security is strong: JWT via HttpOnly cookies, CSRF protection, timing-safe webhook verification, input validation via Zod. The Stripe, Twitch, and blockchain integrations are real — not stubbed.

Key issues:
- Pattern detection logic duplicated in 3 places (`apps/api/src/routes/episodes.ts`, `apps/api/src/routes/webhooks.ts`, and the websocket server) — maintenance nightmare
- N+1 card updates when ending episodes (`apps/api/src/routes/episodes.ts:362-425`) — will timeout on large episodes
- `JWT_SECRET` not validated in WebSocket server (`apps/api/src/websocket/server.ts:62-65`) unlike the auth middleware
- Race condition window in webhook card creation (`apps/api/src/routes/webhooks.ts:68-189`) between existence check and insert

**Frontend (5.5/10):** Functional but structurally messy. Multiple god-components violate single responsibility:
- `apps/web/src/app/create/page.tsx` manages 11 `useState` calls for template selection, episode creation, and event management in one component
- `apps/web/src/app/play/[code]/page.tsx` handles episode display, card minting, leaderboard, and WebSocket events in a single file
- Type safety is poor: `any` types scattered across dashboard (`leaderboard: any[]`), play page (`grid: any[][]`, `patterns: any[]`), and create page (`events: any[]`)
- No error recovery anywhere — no retry buttons, no error boundaries
- ~30% of referenced features have no UI (payments, collaborators, template creation, results page)

**Smart contracts (6.5/10):** Core NFTree logic is correct. Soulbound enforcement works. OpenZeppelin usage is proper. But:
- `createRoot()` and `endRoot()` lack reentrancy guards despite calling `_safeMint()`
- Owner bypasses `onlyAuthorizedMinter` modifier — privilege escalation vector (`packages/contracts/contracts/StreamTree.sol:123-126`)
- No `approve()`/`setApprovalForAll()` override for soulbound fruits — confusing UX (approval succeeds, transfer fails)
- Gas optimization neglected: `getRootBranches()` returns entire array with no pagination, batch operations don't validate inputs before starting
- Constructor doesn't validate `platformAddress != address(0)` though `setPlatformAddress()` does

**Tests (5/10):**
- Contract tests cover ~80% of happy paths but miss critical edge cases (batch with invalid branches, max supply=1, concurrent minting)
- E2E "code-validation" tests check string existence in files, not actual behavior — false confidence
- E2E collaborator/template tests are execution-order dependent and have no teardown
- No frontend tests whatsoever
- No integration tests for the WebSocket real-time flow

**Verdict:** Execution does not yet match ambition. The API is the strongest layer — production-adjacent with real integrations and security awareness. The frontend is a functional prototype with structural debt. The smart contract needs a security review before mainnet. The test suite provides insufficient coverage for the complexity of the system.

---

## SCOPE ANALYSIS

**Core Feature:** Real-time interactive bingo cards that become NFT collectibles when a stream ends (the Episode → Card → Collectible lifecycle).

**Supporting Features (directly enable core):**
- WebSocket real-time event broadcasting
- Grid generation with randomized event placement
- Pattern detection (rows, columns, diagonals, blackout)
- Wallet authentication + custodial fallback
- Card minting (free tier)
- Episode lifecycle management (draft → live → ended)
- NFTree smart contract (Root/Branch/Fruit tokens)

**Nice-to-Have (valuable but deferrable):**
- Leaderboard with live rankings
- Gallery for collectible display
- Stream overlay component
- Event templates / presets
- Dark mode support

**Distractions (don't support core value at this stage):**
- Chat keyword automation (`apps/api/src/routes/automation.ts`) — complex Twitch integration before core card flow works with payments
- Custom webhooks for external triggers — premature integration surface
- IPFS metadata storage — premature optimization when centralized storage works

**Wrong Product (belongs elsewhere):**
- Collaborator system with revenue sharing (`apps/api/src/routes/collaborators.ts`, `apps/web/src/app/dashboard/[id]/collaborators/`) — this is a team management product, not a bingo game. Revenue splitting adds significant accounting complexity (Stripe Connect multi-party transfers, tax implications) for a v0.1
- Template marketplace with browse/filter/popularity tracking (`apps/api/src/routes/templates.ts`) — this is a content marketplace, not a stream engagement tool

**Scope Verdict:** Feature Creep — the project has 13 API route files, 13 frontend pages, and 17 database tables for what should be a focused v1 of "stream bingo with NFTs." The collaborator system and template marketplace are legitimate product ideas but they dilute the core and add surface area that must be maintained, tested, and secured. The core card lifecycle (create → play → collect) is not yet complete (paid cards return `NOT_IMPLEMENTED`, honor-system marking is stubbed) while peripheral features are partially built.

---

## RECOMMENDATIONS

### CUT IMMEDIATELY

- **Collaborator system** — `apps/api/src/routes/collaborators.ts`, `apps/web/src/app/dashboard/[id]/collaborators/`, `apps/web/src/app/invitations/`, related Prisma models (`EpisodeCollaborator`). Revenue sharing is a v2+ feature. Remove entirely and reclaim the complexity budget.
- **Chat keyword automation** — `apps/api/src/routes/automation.ts`, `ChatKeyword` model. Manual event triggering works. Automate later.
- **Custom webhook triggers** — `CustomWebhook` model and handler in `apps/api/src/routes/webhooks.ts:470-560`. External integrations are premature.
- **Template marketplace features** — Keep basic template save/load. Cut browse, popularity tracking, public/private visibility, and usage counting. The `Template` model can stay simplified.
- **IPFS integration** — `apps/api/src/services/storage.service.ts` IPFS paths. Use S3/CDN for metadata now. Decentralize later.
- **Triple-duplicated pattern detection** — Consolidate into `packages/shared/src/utils/patterns.ts` (it already exists there). Delete copies from `episodes.ts` and `webhooks.ts`.

### DEFER

- **Twitch EventSub automation** — Keep the service code but don't expose to users yet. Manual event triggering is sufficient for launch.
- **Stream overlay** — Nice-to-have. Complete core flow first.
- **Gallery achievements/badges** — Frontend scaffolding exists but is incomplete. Defer until cards are actually being collected.
- **Smart contract mainnet deployment** — Fix reentrancy guards, access control model, and test coverage first. Stay on testnet.

### DOUBLE DOWN

- **Paid card flow end-to-end** — `cards.ts:174-176` returns `NOT_IMPLEMENTED` for paid cards. This is the revenue engine. Stripe integration already works in payments.ts — connect it to card minting. This is the #1 priority.
- **Card play experience** — The real-time grid update flow (WebSocket → card update → pattern detection → leaderboard) is the core product. It works structurally but needs polish: error recovery, reconnection handling, and visual feedback.
- **Frontend type safety and component extraction** — Replace all `any` types with shared package types. Extract god-components into focused units. This is blocking frontend reliability.
- **Contract test coverage** — Add edge case tests (batch failures, concurrent minting, max supply boundaries). Current 80% happy-path coverage is insufficient for a system holding user funds.
- **Episode end flow** — The moment cards become collectibles is the emotional payoff. The N+1 fruit minting loop needs batch optimization, and the frontend results page doesn't exist yet.

### FINAL VERDICT: **Refocus**

StreamTree has a sound concept, a solid API foundation, and real integrations. It is not a project to kill or reboot. But it has spread itself too thin — building collaborator management and template marketplaces while the core card purchase flow returns `NOT_IMPLEMENTED`. The smart contract needs security hardening before touching real money.

**Next Step:** Delete the collaborator system entirely, then implement paid card minting end-to-end (Stripe payment → card creation → WebSocket notification). That single change turns this from a demo into a product.
