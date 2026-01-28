# StreamTree Software Audit Report

**Date:** 2026-01-28
**Version:** 1.0
**Auditor:** Claude AI Code Audit

---

## Executive Summary

StreamTree is an interactive bingo-style gaming platform for streamers built on blockchain NFT mechanics using the "NFTree" primitive (Root → Branch → Fruit). This audit evaluates the software for **correctness** and **fitness for purpose**.

### Overall Assessment

| Area | Rating | Status |
|------|--------|--------|
| **Architecture & Design** | Good | Well-structured monorepo with clear separation |
| **Backend Security** | Good with Issues | Strong foundation, some gaps identified |
| **Smart Contract Security** | Good | Proper access control and reentrancy protection |
| **Frontend Security** | Moderate | Missing CSRF tokens, WebSocket auth issues |
| **Database Design** | Critical Issues | Missing cascading deletes and relations |
| **Validation & Types** | Good | Correct pattern detection, solid typing |
| **Code Quality** | Good | Clean code, proper patterns |

### Risk Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **Critical** | 8 | Database cascade issues, missing relations |
| **High** | 2 | Missing Stripe idempotency keys, WebSocket token exposure |
| **Medium** | 18 | Various security and validation gaps |
| **Low** | 10 | Minor improvements and best practices |

---

## 1. Architecture & Design

### Strengths

- **Monorepo Structure**: Well-organized Turbo monorepo with clear workspace separation
- **Technology Stack**: Appropriate modern stack (Next.js 14, Express, Prisma, Solidity)
- **Shared Code**: Proper abstraction of shared types and utilities
- **Real-time Architecture**: WebSocket implementation for live updates

### Fitness for Purpose

The architecture is **well-suited** for the streaming gaming platform use case:
- Real-time event broadcasting for live streams
- Blockchain integration for NFT mechanics
- Stripe integration for monetization
- Twitch OAuth for streamer authentication

---

## 2. Backend API Security Audit

### Critical & High Issues

#### ISSUE #1: Missing Stripe Idempotency Keys (HIGH)
**Location:** `apps/api/src/routes/payments.ts:284-288`, `apps/api/src/services/stripe.service.ts:114-132`

```typescript
// No idempotency keys on Stripe transfer operations
const transferId = await createTransfer(
  available,
  user.stripeAccountId,
  episodeId
);
```

**Impact:** Duplicate requests could create multiple transfers, causing financial discrepancies.

**Recommendation:** Implement idempotency keys:
```typescript
const idempotencyKey = `withdrawal-${withdrawal.id}`;
const transfer = await stripe.transfers.create({
  amount, currency: 'usd',
  destination: stripeAccountId,
  idempotency_key: idempotencyKey,
});
```

#### ISSUE #2: WebSocket Token in URL (HIGH)
**Location:** `apps/api/src/websocket/server.ts:54-68`

**Problem:** JWT tokens passed in URL query parameters are logged in access logs and may be cached by proxies.

**Recommendation:** Use WebSocket subprotocols or implement secure handshake mechanism.

### Medium Issues

| ID | Issue | Location | Recommendation |
|----|-------|----------|----------------|
| #3 | Development CSRF bypass | `middleware/csrf.ts:107-127` | Enforce strict CSRF in all environments |
| #4 | Missing triggerConfig validation | `episodes.ts:579-625` | Validate against schema based on triggerType |
| #5 | OAuth state in-memory only | `twitch.ts:17-28` | Use Redis for distributed systems |
| #6 | Open redirect in OAuth | `twitch.ts:125` | Whitelist allowed redirect URLs |
| #7 | Twitch secrets stored plaintext | `twitch.service.ts:326-334` | Hash secrets using bcrypt/argon2 |
| #8 | Missing payment amount validation | `stripe.service.ts:20-46` | Add min/max amount checks |
| #9 | Stack traces in logs | `error.ts:31` | Sanitize stack traces |

### Positive Findings

- Excellent use of HttpOnly cookies for token storage
- Strong CSRF protection with multiple validation methods
- Comprehensive rate limiting with tiered approach
- Proper use of Prisma ORM preventing SQL injection
- Timing-safe comparisons for security-sensitive operations
- Strong webhook signature verification (Stripe, Twitch)

---

## 3. Smart Contract Security Audit

**Contract:** `/packages/contracts/contracts/StreamTree.sol` (445 LOC)

### Security Status: GOOD

#### Strengths

- **Reentrancy Protection**: Proper `nonReentrant` modifiers on all minting functions
- **Access Control**: Well-implemented `onlyAuthorizedMinter` and `onlyOwner` modifiers
- **ERC721 Compliance**: Correct implementation with proper overrides
- **Soulbound Tokens**: Fruit tokens correctly implemented as non-transferable
- **State Management**: Proper existence checks and state machine enforcement

#### Issues Found

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| Medium | Unbounded array | Lines 77, 238, 357 | `rootBranches` array grows unbounded, `getRootBranches()` could exceed gas limits |
| Low | Missing event | Lines 395-398 | `setPlatformAddress()` doesn't emit event |
| Info | Unused variable | Line 84 | `platformAddress` stored but never used |

#### Recommendations

1. **Add pagination to `getRootBranches()`**:
```solidity
function getRootBranches(uint256 rootId, uint256 offset, uint256 limit)
    external view returns (uint256[] memory)
```

2. **Add event for platform address changes**:
```solidity
event PlatformAddressUpdated(address indexed newAddress);
```

---

## 4. Frontend Security Audit

### Critical & High Issues

#### ISSUE #1: WebSocket Token Exposure (HIGH)
**Location:** `apps/web/src/lib/websocket.ts:30`

```typescript
const wsUrl = this.token ? `${this.url}?token=${this.token}` : this.url;
```

**Impact:** Token visible in logs, browser history, and network analysis.

#### ISSUE #2: Missing CSRF Token Implementation (MEDIUM)
**Status:** No CSRF tokens are generated, sent, or validated in frontend.

**Recommendation:** Implement CSRF token exchange:
1. Fetch token from backend on session start
2. Include in `X-CSRF-Token` header for all state-changing requests

### Medium Issues

| Issue | Location | Recommendation |
|-------|----------|----------------|
| Permissive image domains | `next.config.js:5-9` | Restrict to specific CDN domains |
| No file upload validation | `lib/api.ts:204-257` | Add client-side type/size validation |
| Auto wallet linking | `ConnectWallet.tsx:28-31` | Require explicit user confirmation |

### Positive Findings

- No `dangerouslySetInnerHTML` usage (XSS protected)
- No hardcoded secrets in client code
- HttpOnly cookies for session tokens
- Proper use of industry-standard Web3 libraries (RainbowKit, Wagmi)

---

## 5. Database Schema Audit

### CRITICAL ISSUES

The schema has **8 critical issues** related to missing relations and cascading deletes:

#### Missing @relation Definitions

| Model | Field | Impact |
|-------|-------|--------|
| RefreshToken | userId | No FK constraint, orphaned records possible |
| PendingPayment | episodeId | No referential integrity |
| PendingPayment | userId | No referential integrity |

#### Missing Cascading Deletes

| Model | Relation | Impact if Parent Deleted |
|-------|----------|--------------------------|
| Card | episode | FK violation/orphaned records |
| Card | holder | FK violation/orphaned records |
| FiredEvent | episode | Orphaned event log records |
| FiredEvent | eventDefinition | Orphaned event log records |
| Withdrawal | streamer | Financial records orphaned |
| Withdrawal | episode | Financial records orphaned |
| EpisodeCollaborator | user | Collaborator records orphaned |
| Template | creator | Template records orphaned |

#### Required Fixes

```prisma
// RefreshToken - ADD relation
model RefreshToken {
  userId String @map("user_id")
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  // ... rest of model
}

// Card - ADD cascading deletes
model Card {
  episode Episode @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  holder  User    @relation(fields: [holderId], references: [id], onDelete: Cascade)
  // ... rest of model
}

// Apply similar fixes to all affected models
```

### Other Issues

| Severity | Issue | Recommendation |
|----------|-------|----------------|
| Medium | `totalRevenue` uses Int | Change to BigInt for financial data |
| Medium | Status fields are strings | Convert to Prisma enums |
| Medium | Missing indexes | Add indexes on `Withdrawal.completedAt`, `User.isStreamer` |

---

## 6. Shared Package Audit

### Validation Logic: GOOD

All 8 validation functions properly implemented with:
- Empty/null input handling
- Type checking
- Range validation
- Regex pattern validation

### Pattern Detection: EXCELLENT

Bingo pattern detection is **mathematically correct**:
- Row detection: ✅ Correct
- Column detection: ✅ Correct
- Main diagonal: ✅ Correct
- Anti-diagonal: ✅ Correct (`size-1-i` formula)
- Blackout: ✅ Correct

### Grid Logic Issues

| Severity | Issue | Location | Fix |
|----------|-------|----------|-----|
| Medium | Unsafe bounds check | `grid.ts:99,122` | Add `grid.length > 0` guard before `grid[0]` access |
| Low | Redundant shuffle | `grid.ts:44` | Remove second shuffle call |
| Low | Math.random() for codes | `validation.ts:137` | Use `crypto.getRandomValues()` |

### Type Definitions: GOOD

- Well-structured discriminated unions
- Proper type exports
- Good separation of concerns

---

## 7. Fitness for Purpose Assessment

### Core Functionality Correctness

| Feature | Status | Notes |
|---------|--------|-------|
| Episode Creation | ✅ Correct | Proper validation and state management |
| Card Minting | ✅ Correct | NFT creation with randomized grids |
| Event Firing | ✅ Correct | Real-time broadcast via WebSocket |
| Pattern Detection | ✅ Correct | All bingo patterns properly detected |
| Payment Processing | ⚠️ Needs Fix | Missing idempotency keys |
| NFT Transfers | ✅ Correct | Proper ERC721 implementation |
| Soulbound Tokens | ✅ Correct | Fruits correctly non-transferable |

### Scalability Concerns

1. **WebSocket**: Current implementation suitable for moderate load; consider Redis pub/sub for horizontal scaling
2. **Database**: Missing indexes could impact query performance at scale
3. **Smart Contract**: Unbounded arrays could cause gas issues with popular episodes

### Security Posture

| Layer | Rating | Key Concerns |
|-------|--------|--------------|
| Authentication | Good | HttpOnly cookies, proper JWT handling |
| Authorization | Good | Role-based access control implemented |
| Data Validation | Good | Comprehensive input validation |
| Payment Security | Moderate | Missing idempotency keys |
| Blockchain Security | Good | Proper access control and reentrancy protection |

---

## 8. Prioritized Recommendations

### Critical (Fix Immediately)

1. **Add missing database relations and cascading deletes** - Data integrity at risk
2. **Implement Stripe idempotency keys** - Financial correctness at risk
3. **Fix WebSocket token exposure** - Security vulnerability

### High Priority (Fix Soon)

4. Move OAuth state to Redis for distributed deployments
5. Validate redirect URLs in OAuth callback
6. Implement CSRF token handling in frontend
7. Add payment amount validation

### Medium Priority (Planned Work)

8. Convert database status fields to enums
9. Add pagination to smart contract `getRootBranches()`
10. Add missing database indexes
11. Implement client-side file upload validation
12. Add grid bounds checking in shared utilities

### Low Priority (Improvements)

13. Hash Twitch webhook secrets in database
14. Use crypto.getRandomValues() for code generation
15. Add type guards for discriminated unions
16. Emit event for platform address changes in contract

---

## 9. Conclusion

StreamTree demonstrates **solid software engineering practices** with a well-designed architecture suitable for its purpose as a streaming gaming platform. The codebase shows attention to security with proper authentication, rate limiting, and input validation.

However, **critical database schema issues must be addressed** before production deployment to prevent data integrity problems. Additionally, the payment processing security should be enhanced with idempotency keys to prevent financial discrepancies.

### Overall Verdict

| Aspect | Verdict |
|--------|---------|
| **Correctness** | Good - Core logic is correct, minor fixes needed |
| **Fitness for Purpose** | Good - Well-suited for streaming gaming platform |
| **Production Readiness** | Moderate - Critical database fixes required first |
| **Security Posture** | Good - Strong foundation with some gaps to address |

---

## Appendix: Files Audited

### Backend
- `/apps/api/src/routes/*.ts` - All route handlers
- `/apps/api/src/middleware/*.ts` - Auth, CSRF, rate limiting, error handling
- `/apps/api/src/services/*.ts` - Blockchain, Stripe, Storage, Twitch services
- `/apps/api/src/websocket/server.ts` - WebSocket implementation
- `/apps/api/prisma/schema.prisma` - Database schema

### Frontend
- `/apps/web/src/app/**/*.tsx` - All pages and components
- `/apps/web/src/lib/*.ts` - API client, auth context, WebSocket client
- `/apps/web/src/components/*.tsx` - Shared components

### Smart Contracts
- `/packages/contracts/contracts/StreamTree.sol` - Main contract
- `/packages/contracts/test/StreamTree.test.ts` - Contract tests

### Shared Package
- `/packages/shared/src/types/*.ts` - Type definitions
- `/packages/shared/src/utils/*.ts` - Grid, patterns, validation utilities

---

*Report generated by Claude AI Code Audit - 2026-01-28*
