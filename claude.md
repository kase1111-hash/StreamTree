# StreamTree

StreamTree transforms passive streaming viewership into interactive, gamified participation with permanent collectible proof. Streamers create bingo-style games, and audience members mint cards that update live as events fire, culminating in permanent NFTs.

## Architecture

Turbo monorepo with npm workspaces:

- **apps/api**: Express.js backend with Prisma ORM, WebSocket for real-time updates
- **apps/web**: Next.js 14 frontend with React 18, Tailwind CSS, RainbowKit for Web3
- **packages/shared**: TypeScript types and utilities shared across apps
- **packages/contracts**: Solidity smart contracts (Hardhat)
- **packages/e2e-tests**: Integration tests (Vitest)

## Tech Stack

- **Backend**: Node.js, Express, Prisma, PostgreSQL 16, Redis 7, WebSocket
- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS, Wagmi/Viem
- **Blockchain**: Solidity, Hardhat, ethers.js v6
- **Auth**: JWT (HTTP-only cookies), bcryptjs
- **Payments**: Stripe (with Connect for payouts)
- **Storage**: AWS S3

## Development

```bash
# Setup
docker-compose up -d              # Start PostgreSQL + Redis
npm install
npm run db:generate && npm run db:push
npm run dev                       # API on :3001, Web on :3000

# Common commands
npm run build                     # Build all packages
npm run test                      # Run all tests
npm run lint                      # Lint all code
npm run db:studio                 # Prisma Studio UI
npm run db:migrate                # Create migration
```

## Key Files

- `apps/api/prisma/schema.prisma` - Database schema
- `apps/api/src/routes/` - API endpoints (episodes, cards, auth, payments)
- `apps/api/src/services/` - Business logic (blockchain, stripe, twitch)
- `apps/api/src/websocket/server.ts` - Real-time connection management
- `apps/web/src/app/` - Next.js App Router pages
- `packages/shared/src/types/` - Shared TypeScript interfaces

## Domain Model

The app follows the **NFTree pattern** (Root → Branch → Fruit):

- **Episode** (Root): Created by streamer with events, artwork, grid size
- **Card** (Branch): Minted by audience members, updates live as events fire
- **Fruit**: Final NFT when episode ends, permanent proof of participation

Episode status flow: `draft` → `live` → `ended` → `archived`

## API Conventions

- RESTful endpoints with standard HTTP methods
- Response format: `{ success: boolean, error?: string, data?: T }`
- Zod schemas for request validation
- JWT auth via cookies; `authMiddleware` and `requireStreamer` middleware

## WebSocket Messages

- Clients subscribe to episodes/cards for real-time updates
- Message types defined in `packages/shared/src/types/websocket.ts`
- Broadcast functions: `broadcastToEpisode()`, `broadcastStats()`

## Security

- CORS with strict origin checking (no wildcard with credentials)
- CSRF token protection on state-changing requests
- Rate limiting tiers (API, auth, public, payment)
- Input sanitization and error message sanitization
- JWT_SECRET required at startup (fail-fast)

## Testing

Tests use Vitest. Run with `npm run test`. Test files follow `*.test.ts` pattern.

## Environment Variables

Required in `apps/api/.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for signing tokens
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Payment processing
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` - Storage
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` - Twitch integration

Required in `apps/web/.env`:
- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` - Web3 wallet connections
