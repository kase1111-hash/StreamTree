# StreamTree Technical Specification

## Overview

StreamTree is a web application that enables streamers to create interactive bingo-style games for their audiences. Built on the NFTree primitive (Root → Branch → Fruit), it transforms passive viewership into engaged participation with permanent collectible proof.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend (React/Next.js)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Streamer App │  │ Audience App │  │ Shared Components        │   │
│  │ - Setup      │  │ - Mint Flow  │  │ - Card Renderer          │   │
│  │ - Dashboard  │  │ - Card View  │  │ - Event Grid             │   │
│  │ - Analytics  │  │ - Gallery    │  │ - Wallet Connect         │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API Layer (Node.js/Express)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ REST API     │  │ WebSocket    │  │ Webhook Handler          │   │
│  │ - Episodes   │  │ - Real-time  │  │ - Twitch Events          │   │
│  │ - Cards      │  │ - Events     │  │ - Payment Callbacks      │   │
│  │ - Users      │  │ - State Sync │  │ - Custom Integrations    │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           Data Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ PostgreSQL   │  │ Redis        │  │ L2 Blockchain            │   │
│  │ - Episodes   │  │ - Sessions   │  │ - NFT Contracts          │   │
│  │ - Cards      │  │ - Real-time  │  │ - Token Metadata         │   │
│  │ - Users      │  │ - Pub/Sub    │  │ - Ownership              │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### 1. Episode (Root)

The root token representing a streaming episode.

```typescript
interface Episode {
  id: string;                    // UUID
  streamerId: string;            // FK to User

  // Content
  name: string;                  // "Friday Night Chaos - Ep. 23"
  artworkUrl: string;            // Uploaded cover art URL
  artworkHash: string;           // IPFS hash for permanence

  // Configuration
  cardPrice: number;             // Price in cents (0 = free)
  maxCards: number | null;       // null = unlimited
  gridSize: number;              // Default: 5 (5x5 grid)

  // Events
  events: EventDefinition[];     // Array of possible events

  // State
  status: 'draft' | 'live' | 'ended' | 'archived';

  // Timestamps
  createdAt: Date;
  launchedAt: Date | null;
  endedAt: Date | null;

  // Stats (denormalized for performance)
  cardsMinted: number;
  totalRevenue: number;

  // Blockchain
  contractAddress: string | null; // L2 contract address
  rootTokenId: string | null;     // On-chain root token

  // Share
  shareCode: string;             // Short code for URL (e.g., "abc123")
  shareUrl: string;              // Full shareable URL
}
```

### 2. EventDefinition

Defines what events can mark squares on cards.

```typescript
interface EventDefinition {
  id: string;                    // UUID
  episodeId: string;             // FK to Episode

  name: string;                  // "Streamer says catchphrase"
  icon: string;                  // Emoji or icon identifier
  description: string | null;    // Optional longer description

  // Automation
  triggerType: 'manual' | 'twitch' | 'webhook' | 'chat';
  triggerConfig: TriggerConfig | null;

  // State
  firedAt: Date | null;          // When this event was triggered
  firedCount: number;            // How many times fired (usually 1)

  createdAt: Date;
  order: number;                 // Display order
}

type TriggerConfig =
  | { type: 'manual' }
  | { type: 'twitch'; event: 'subscription' | 'donation' | 'raid' | 'bits'; threshold?: number }
  | { type: 'chat'; keyword: string; minOccurrences: number; timeWindowSec: number }
  | { type: 'webhook'; secret: string };
```

### 3. Card (Branch)

An individual viewer's card/branch token.

```typescript
interface Card {
  id: string;                    // UUID
  episodeId: string;             // FK to Episode
  holderId: string;              // FK to User (viewer)

  // Grid
  grid: GridSquare[][];          // 5x5 array of squares

  // State
  status: 'active' | 'fruited';
  markedSquares: number;         // Count of marked squares
  patterns: Pattern[];           // Completed patterns (rows, diagonals, etc.)

  // Timestamps
  mintedAt: Date;
  fruitedAt: Date | null;

  // Payment
  paymentId: string | null;      // Stripe payment ID
  pricePaid: number;             // Amount paid in cents

  // Blockchain
  branchTokenId: string | null;  // On-chain branch token
  fruitTokenId: string | null;   // On-chain fruit token (after fruiting)

  // Metadata
  cardNumber: number;            // Sequential card number for this episode
}

interface GridSquare {
  eventId: string;               // Which event this square represents
  position: { row: number; col: number };
  marked: boolean;
  markedAt: Date | null;
}

type Pattern =
  | { type: 'row'; index: number }
  | { type: 'column'; index: number }
  | { type: 'diagonal'; direction: 'main' | 'anti' }
  | { type: 'blackout' };
```

### 4. User

User accounts for both streamers and viewers.

```typescript
interface User {
  id: string;                    // UUID

  // Identity
  walletAddress: string | null;  // Connected wallet
  custodialWalletId: string | null; // Fallback custodial wallet

  // Profile
  username: string;
  displayName: string | null;
  avatarUrl: string | null;

  // Auth
  authProvider: 'wallet' | 'twitch' | 'google' | 'email';
  authProviderId: string;

  // Streamer info (if applicable)
  isStreamer: boolean;
  twitchId: string | null;
  twitchAccessToken: string | null;

  // Timestamps
  createdAt: Date;
  lastActiveAt: Date;
}
```

### 5. FiredEvent

Record of when events were triggered during a live show.

```typescript
interface FiredEvent {
  id: string;                    // UUID
  episodeId: string;             // FK to Episode
  eventDefinitionId: string;     // FK to EventDefinition

  firedAt: Date;
  firedBy: 'manual' | 'automation';

  // Stats at time of firing
  cardsAffected: number;         // How many cards had this square

  // Automation metadata
  triggerData: object | null;    // Data from the trigger source
}
```

### 6. Leaderboard Entry

```typescript
interface LeaderboardEntry {
  episodeId: string;
  cardId: string;
  holderId: string;
  username: string;
  markedSquares: number;
  patterns: Pattern[];
  rank: number;
}
```

---

## API Endpoints

### Episodes API

```
POST   /api/episodes              Create new episode (draft)
GET    /api/episodes              List streamer's episodes
GET    /api/episodes/:id          Get episode details
PATCH  /api/episodes/:id          Update episode (draft only)
DELETE /api/episodes/:id          Delete episode (draft only)

POST   /api/episodes/:id/launch   Launch episode (draft → live)
POST   /api/episodes/:id/end      End episode (live → ended)

POST   /api/episodes/:id/artwork  Upload artwork
GET    /api/episodes/:id/stats    Get live statistics
GET    /api/episodes/:id/leaderboard  Get current leaderboard
```

### Events API

```
POST   /api/episodes/:id/events           Add event definition
PATCH  /api/episodes/:id/events/:eventId  Update event definition
DELETE /api/episodes/:id/events/:eventId  Remove event definition

POST   /api/episodes/:id/events/:eventId/fire   Manually fire event
GET    /api/episodes/:id/events/history         Get fired events history
```

### Cards API

```
POST   /api/episodes/:id/cards    Mint new card (viewer)
GET    /api/cards/:id             Get card details
GET    /api/cards/my              Get current user's cards
GET    /api/cards/my/:episodeId   Get user's card for specific episode

POST   /api/cards/:id/mark        Manual mark (honor system mode)
```

### Users API

```
POST   /api/auth/wallet           Authenticate with wallet signature
POST   /api/auth/twitch           Authenticate with Twitch OAuth
POST   /api/auth/custodial        Create/get custodial wallet

GET    /api/users/me              Get current user profile
PATCH  /api/users/me              Update profile
GET    /api/users/me/gallery      Get all fruited cards (collectibles)
```

### Webhooks API

```
POST   /api/webhooks/twitch       Twitch EventSub webhook
POST   /api/webhooks/stripe       Stripe payment webhook
POST   /api/webhooks/custom/:id   Custom webhook for event automation
```

### Public API (no auth)

```
GET    /api/public/episode/:shareCode   Get episode by share code
GET    /api/public/card/:id/preview     Get card preview image
```

---

## WebSocket Events

### Server → Client

```typescript
// Episode state changes
interface EpisodeStateEvent {
  type: 'episode:state';
  episodeId: string;
  status: 'live' | 'ended';
}

// Event fired (updates all cards)
interface EventFiredEvent {
  type: 'event:fired';
  episodeId: string;
  eventId: string;
  eventName: string;
  timestamp: Date;
}

// Card updated (specific to connected user)
interface CardUpdatedEvent {
  type: 'card:updated';
  cardId: string;
  markedSquares: GridSquare[];
  newPatterns: Pattern[];
  totalMarked: number;
}

// Stats update (for streamer dashboard)
interface StatsUpdateEvent {
  type: 'stats:update';
  episodeId: string;
  cardsMinted: number;
  revenue: number;
  leaderboard: LeaderboardEntry[];
}

// Card fruited (end of show)
interface CardFruitedEvent {
  type: 'card:fruited';
  cardId: string;
  finalState: Card;
  fruitTokenId: string;
}
```

### Client → Server

```typescript
// Join episode room
interface JoinEpisodeMessage {
  type: 'join:episode';
  episodeId: string;
}

// Subscribe to card updates
interface SubscribeCardMessage {
  type: 'subscribe:card';
  cardId: string;
}

// Manual mark (honor system)
interface MarkSquareMessage {
  type: 'mark:square';
  cardId: string;
  position: { row: number; col: number };
}
```

---

## Frontend Pages & Components

### Pages

```
/                           Landing page
/create                     Episode setup (streamer)
/dashboard/:episodeId       Live dashboard (streamer)
/episodes                   Episode history (streamer)

/play/:shareCode            Join episode (viewer)
/card/:cardId               View card (viewer)
/gallery                    My collectibles (viewer)

/auth/login                 Login options
/auth/callback/twitch       Twitch OAuth callback
```

### Core Components

```typescript
// Card display component
interface CardRendererProps {
  card: Card;
  episode: Episode;
  isLive: boolean;
  showAnimation: boolean;
  onSquareClick?: (position: Position) => void; // Honor system
}

// Event grid for setup
interface EventGridEditorProps {
  events: EventDefinition[];
  onAdd: (event: Partial<EventDefinition>) => void;
  onUpdate: (id: string, event: Partial<EventDefinition>) => void;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
}

// Streamer dashboard
interface DashboardProps {
  episode: Episode;
  onFireEvent: (eventId: string) => void;
  onEndShow: () => void;
}

// Artwork uploader
interface ArtworkUploaderProps {
  onUpload: (file: File) => Promise<string>;
  currentUrl?: string;
  aspectRatio: '1:1';
}

// Wallet connector
interface WalletConnectorProps {
  onConnect: (address: string, signature: string) => void;
  onSkip: () => void; // Use custodial
}
```

---

## Card Generation Algorithm

When a viewer mints a card, the grid must be randomized so each card is unique.

```typescript
function generateCardGrid(
  events: EventDefinition[],
  gridSize: number = 5
): GridSquare[][] {
  const totalSquares = gridSize * gridSize;

  // Events must fill the grid
  // If fewer events than squares, repeat events
  // If more events than squares, randomly select

  let eventPool: string[] = [];

  if (events.length >= totalSquares) {
    // Randomly select which events appear
    eventPool = shuffleArray(events.map(e => e.id)).slice(0, totalSquares);
  } else {
    // Repeat events to fill grid (distribute evenly)
    const repetitions = Math.ceil(totalSquares / events.length);
    for (let i = 0; i < repetitions; i++) {
      eventPool.push(...events.map(e => e.id));
    }
    eventPool = shuffleArray(eventPool).slice(0, totalSquares);
  }

  // Shuffle for random placement
  eventPool = shuffleArray(eventPool);

  // Build grid
  const grid: GridSquare[][] = [];
  let eventIndex = 0;

  for (let row = 0; row < gridSize; row++) {
    grid[row] = [];
    for (let col = 0; col < gridSize; col++) {
      grid[row][col] = {
        eventId: eventPool[eventIndex++],
        position: { row, col },
        marked: false,
        markedAt: null
      };
    }
  }

  return grid;
}

// Optional: Free center square
function addFreeCenter(grid: GridSquare[][]): GridSquare[][] {
  const center = Math.floor(grid.length / 2);
  grid[center][center] = {
    eventId: 'FREE',
    position: { row: center, col: center },
    marked: true,
    markedAt: new Date()
  };
  return grid;
}
```

---

## Pattern Detection

```typescript
function detectPatterns(grid: GridSquare[][]): Pattern[] {
  const patterns: Pattern[] = [];
  const size = grid.length;

  // Check rows
  for (let row = 0; row < size; row++) {
    if (grid[row].every(sq => sq.marked)) {
      patterns.push({ type: 'row', index: row });
    }
  }

  // Check columns
  for (let col = 0; col < size; col++) {
    if (grid.every(row => row[col].marked)) {
      patterns.push({ type: 'column', index: col });
    }
  }

  // Check main diagonal
  let mainDiagonal = true;
  for (let i = 0; i < size; i++) {
    if (!grid[i][i].marked) {
      mainDiagonal = false;
      break;
    }
  }
  if (mainDiagonal) {
    patterns.push({ type: 'diagonal', direction: 'main' });
  }

  // Check anti-diagonal
  let antiDiagonal = true;
  for (let i = 0; i < size; i++) {
    if (!grid[i][size - 1 - i].marked) {
      antiDiagonal = false;
      break;
    }
  }
  if (antiDiagonal) {
    patterns.push({ type: 'diagonal', direction: 'anti' });
  }

  // Check blackout
  if (grid.every(row => row.every(sq => sq.marked))) {
    patterns.push({ type: 'blackout' });
  }

  return patterns;
}
```

---

## Event Firing Flow

```typescript
async function fireEvent(
  episodeId: string,
  eventId: string,
  triggeredBy: 'manual' | 'automation',
  triggerData?: object
): Promise<void> {
  // 1. Validate episode is live
  const episode = await getEpisode(episodeId);
  if (episode.status !== 'live') {
    throw new Error('Episode is not live');
  }

  // 2. Record the fired event
  const firedEvent = await createFiredEvent({
    episodeId,
    eventDefinitionId: eventId,
    firedAt: new Date(),
    firedBy: triggeredBy,
    triggerData
  });

  // 3. Update event definition
  await updateEventDefinition(eventId, {
    firedAt: new Date(),
    firedCount: { increment: 1 }
  });

  // 4. Mark squares on all cards that have this event
  const cardsAffected = await markSquaresForEvent(episodeId, eventId);

  // 5. Update fired event with stats
  await updateFiredEvent(firedEvent.id, { cardsAffected });

  // 6. Broadcast to all connected clients
  broadcastToEpisode(episodeId, {
    type: 'event:fired',
    episodeId,
    eventId,
    eventName: (await getEventDefinition(eventId)).name,
    timestamp: new Date()
  });

  // 7. Send individual card updates
  const affectedCards = await getCardsWithEvent(episodeId, eventId);
  for (const card of affectedCards) {
    sendToUser(card.holderId, {
      type: 'card:updated',
      cardId: card.id,
      markedSquares: getNewlyMarkedSquares(card, eventId),
      newPatterns: detectPatterns(card.grid),
      totalMarked: card.markedSquares
    });
  }
}
```

---

## End Show (Fruiting) Flow

```typescript
async function endShow(episodeId: string): Promise<void> {
  const episode = await getEpisode(episodeId);

  if (episode.status !== 'live') {
    throw new Error('Episode is not live');
  }

  // 1. Update episode status
  await updateEpisode(episodeId, {
    status: 'ended',
    endedAt: new Date()
  });

  // 2. Broadcast episode ended
  broadcastToEpisode(episodeId, {
    type: 'episode:state',
    episodeId,
    status: 'ended'
  });

  // 3. Get all cards
  const cards = await getCardsForEpisode(episodeId);

  // 4. Fruit each card (in batches for performance)
  const batchSize = 50;
  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    await Promise.all(batch.map(card => fruitCard(card, episode)));
  }

  // 5. Finalize leaderboard
  await finalizeLeaderboard(episodeId);

  // 6. Enable revenue withdrawal
  await enableWithdrawal(episodeId);
}

async function fruitCard(card: Card, episode: Episode): Promise<void> {
  // 1. Freeze card state
  const finalState = {
    ...card,
    status: 'fruited' as const,
    fruitedAt: new Date()
  };

  // 2. Generate fruit metadata
  const fruitMetadata = {
    episodeName: episode.name,
    episodeArt: episode.artworkHash,
    streamer: episode.streamerId,
    cardNumber: card.cardNumber,
    totalCards: episode.cardsMinted,
    grid: card.grid,
    markedSquares: card.markedSquares,
    patterns: detectPatterns(card.grid),
    mintedAt: card.mintedAt,
    fruitedAt: finalState.fruitedAt
  };

  // 3. Mint fruit token on-chain
  const fruitTokenId = await mintFruitToken(
    card.holderId,
    episode.contractAddress,
    card.branchTokenId,
    fruitMetadata
  );

  // 4. Update card in database
  await updateCard(card.id, {
    status: 'fruited',
    fruitedAt: finalState.fruitedAt,
    fruitTokenId
  });

  // 5. Notify card holder
  sendToUser(card.holderId, {
    type: 'card:fruited',
    cardId: card.id,
    finalState,
    fruitTokenId
  });

  // 6. Send push notification
  await sendPushNotification(card.holderId, {
    title: `Your card from ${episode.name} is ready`,
    body: `You marked ${card.markedSquares} squares. View your collectible now!`,
    url: `/card/${card.id}`
  });
}
```

---

## Payment Flow

```typescript
// Card minting with payment
async function mintCard(
  episodeId: string,
  userId: string
): Promise<{ card?: Card; paymentIntent?: string }> {
  const episode = await getEpisode(episodeId);

  // Validate
  if (episode.status !== 'live') {
    throw new Error('Episode is not live');
  }

  if (episode.maxCards && episode.cardsMinted >= episode.maxCards) {
    throw new Error('Episode is sold out');
  }

  // Check if user already has a card
  const existingCard = await getCardByUserAndEpisode(userId, episodeId);
  if (existingCard) {
    throw new Error('Already have a card for this episode');
  }

  // If free, mint immediately
  if (episode.cardPrice === 0) {
    const card = await createCard(episodeId, userId);
    return { card };
  }

  // Create Stripe payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: episode.cardPrice,
    currency: 'usd',
    metadata: {
      episodeId,
      userId,
      type: 'card_mint'
    }
  });

  return { paymentIntent: paymentIntent.client_secret };
}

// Stripe webhook handler
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const { episodeId, userId } = paymentIntent.metadata;

  // Create the card
  const card = await createCard(episodeId, userId, {
    paymentId: paymentIntent.id,
    pricePaid: paymentIntent.amount
  });

  // Update episode stats
  await updateEpisode(episodeId, {
    cardsMinted: { increment: 1 },
    totalRevenue: { increment: paymentIntent.amount }
  });

  // Notify streamer dashboard
  broadcastToEpisode(episodeId, {
    type: 'stats:update',
    episodeId,
    cardsMinted: (await getEpisode(episodeId)).cardsMinted,
    revenue: (await getEpisode(episodeId)).totalRevenue
  });
}
```

---

## Twitch Integration

```typescript
// Subscribe to Twitch EventSub
async function setupTwitchIntegration(
  episodeId: string,
  twitchUserId: string
): Promise<void> {
  const subscriptions = [
    {
      type: 'channel.subscription.gift',
      condition: { broadcaster_user_id: twitchUserId }
    },
    {
      type: 'channel.cheer',
      condition: { broadcaster_user_id: twitchUserId }
    },
    {
      type: 'channel.raid',
      condition: { to_broadcaster_user_id: twitchUserId }
    },
    {
      type: 'channel.follow',
      condition: { broadcaster_user_id: twitchUserId }
    }
  ];

  for (const sub of subscriptions) {
    await twitchApi.createEventSubSubscription({
      type: sub.type,
      version: '1',
      condition: sub.condition,
      transport: {
        method: 'webhook',
        callback: `${BASE_URL}/api/webhooks/twitch`,
        secret: generateWebhookSecret()
      }
    });
  }
}

// Handle Twitch webhook
async function handleTwitchWebhook(
  event: TwitchEvent,
  episodeId: string
): Promise<void> {
  // Map Twitch events to our events
  const eventMapping = {
    'channel.subscription.gift': 'subscription',
    'channel.cheer': 'donation',
    'channel.raid': 'raid'
  };

  const ourEventType = eventMapping[event.subscription.type];
  if (!ourEventType) return;

  // Find matching event definition
  const episode = await getEpisode(episodeId);
  const eventDef = episode.events.find(e =>
    e.triggerType === 'twitch' &&
    e.triggerConfig?.event === ourEventType
  );

  if (!eventDef) return;

  // Check threshold if applicable
  if (eventDef.triggerConfig.threshold) {
    const amount = extractAmount(event);
    if (amount < eventDef.triggerConfig.threshold) return;
  }

  // Fire the event
  await fireEvent(episodeId, eventDef.id, 'automation', event);
}
```

---

## Database Schema (PostgreSQL)

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(42) UNIQUE,
  custodial_wallet_id VARCHAR(255),
  username VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100),
  avatar_url TEXT,
  auth_provider VARCHAR(20) NOT NULL,
  auth_provider_id VARCHAR(255) NOT NULL,
  is_streamer BOOLEAN DEFAULT false,
  twitch_id VARCHAR(50),
  twitch_access_token TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(auth_provider, auth_provider_id)
);

-- Episodes (Roots)
CREATE TABLE episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(200) NOT NULL,
  artwork_url TEXT,
  artwork_hash VARCHAR(66),
  card_price INTEGER DEFAULT 0,
  max_cards INTEGER,
  grid_size INTEGER DEFAULT 5,
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  launched_at TIMESTAMP,
  ended_at TIMESTAMP,
  cards_minted INTEGER DEFAULT 0,
  total_revenue INTEGER DEFAULT 0,
  contract_address VARCHAR(42),
  root_token_id VARCHAR(255),
  share_code VARCHAR(10) NOT NULL UNIQUE,
  INDEX idx_episodes_streamer (streamer_id),
  INDEX idx_episodes_status (status),
  INDEX idx_episodes_share_code (share_code)
);

-- Event Definitions
CREATE TABLE event_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(10),
  description TEXT,
  trigger_type VARCHAR(20) DEFAULT 'manual',
  trigger_config JSONB,
  fired_at TIMESTAMP,
  fired_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  sort_order INTEGER DEFAULT 0,
  INDEX idx_events_episode (episode_id)
);

-- Cards (Branches)
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id),
  holder_id UUID NOT NULL REFERENCES users(id),
  grid JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  marked_squares INTEGER DEFAULT 0,
  patterns JSONB DEFAULT '[]',
  minted_at TIMESTAMP DEFAULT NOW(),
  fruited_at TIMESTAMP,
  payment_id VARCHAR(255),
  price_paid INTEGER DEFAULT 0,
  branch_token_id VARCHAR(255),
  fruit_token_id VARCHAR(255),
  card_number INTEGER NOT NULL,
  UNIQUE(episode_id, holder_id),
  INDEX idx_cards_episode (episode_id),
  INDEX idx_cards_holder (holder_id),
  INDEX idx_cards_status (status)
);

-- Fired Events Log
CREATE TABLE fired_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id),
  event_definition_id UUID NOT NULL REFERENCES event_definitions(id),
  fired_at TIMESTAMP DEFAULT NOW(),
  fired_by VARCHAR(20) NOT NULL,
  cards_affected INTEGER DEFAULT 0,
  trigger_data JSONB,
  INDEX idx_fired_episode (episode_id),
  INDEX idx_fired_at (fired_at)
);

-- Withdrawals
CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  streamer_id UUID NOT NULL REFERENCES users(id),
  episode_id UUID NOT NULL REFERENCES episodes(id),
  amount INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  stripe_transfer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  INDEX idx_withdrawals_streamer (streamer_id)
);
```

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/streamtree

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret

# Twitch
TWITCH_CLIENT_ID=your-twitch-client-id
TWITCH_CLIENT_SECRET=your-twitch-client-secret
TWITCH_REDIRECT_URI=http://localhost:3000/auth/callback/twitch

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...

# Blockchain (L2)
L2_RPC_URL=https://...
L2_PRIVATE_KEY=0x...
NFTREE_CONTRACT_ADDRESS=0x...

# Storage
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=streamtree-artwork
AWS_REGION=us-east-1

# IPFS
IPFS_API_URL=https://ipfs.infura.io:5001
IPFS_PROJECT_ID=...
IPFS_PROJECT_SECRET=...

# App
BASE_URL=http://localhost:3000
WS_URL=ws://localhost:3001

# Platform
PLATFORM_FEE_PERCENT=8
```

---

## Smart Contract Interface (Solidity)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract StreamTree is ERC721, Ownable {

    struct Root {
        address streamer;
        string metadataUri;
        uint256 maxSupply;
        uint256 minted;
        bool ended;
    }

    struct Branch {
        uint256 rootId;
        address holder;
        string metadataUri;
        bool fruited;
    }

    struct Fruit {
        uint256 branchId;
        address holder;
        string metadataUri;
    }

    mapping(uint256 => Root) public roots;
    mapping(uint256 => Branch) public branches;
    mapping(uint256 => Fruit) public fruits;

    uint256 public nextRootId = 1;
    uint256 public nextBranchId = 1;
    uint256 public nextFruitId = 1;

    event RootCreated(uint256 indexed rootId, address indexed streamer);
    event BranchMinted(uint256 indexed branchId, uint256 indexed rootId, address indexed holder);
    event BranchFruited(uint256 indexed branchId, uint256 indexed fruitId);
    event RootEnded(uint256 indexed rootId);

    // Create a new episode (root)
    function createRoot(
        string memory metadataUri,
        uint256 maxSupply
    ) external returns (uint256) {
        uint256 rootId = nextRootId++;
        roots[rootId] = Root({
            streamer: msg.sender,
            metadataUri: metadataUri,
            maxSupply: maxSupply,
            minted: 0,
            ended: false
        });
        emit RootCreated(rootId, msg.sender);
        return rootId;
    }

    // Mint a card (branch)
    function mintBranch(
        uint256 rootId,
        address holder,
        string memory metadataUri
    ) external returns (uint256) {
        Root storage root = roots[rootId];
        require(!root.ended, "Episode ended");
        require(root.maxSupply == 0 || root.minted < root.maxSupply, "Sold out");

        uint256 branchId = nextBranchId++;
        branches[branchId] = Branch({
            rootId: rootId,
            holder: holder,
            metadataUri: metadataUri,
            fruited: false
        });

        root.minted++;
        _mint(holder, branchId);

        emit BranchMinted(branchId, rootId, holder);
        return branchId;
    }

    // Fruit a branch (soulbound)
    function fruitBranch(
        uint256 branchId,
        string memory fruitMetadataUri
    ) external returns (uint256) {
        Branch storage branch = branches[branchId];
        require(!branch.fruited, "Already fruited");

        Root storage root = roots[branch.rootId];
        require(root.ended, "Episode not ended");

        uint256 fruitId = nextFruitId++;
        fruits[fruitId] = Fruit({
            branchId: branchId,
            holder: branch.holder,
            metadataUri: fruitMetadataUri
        });

        branch.fruited = true;

        emit BranchFruited(branchId, fruitId);
        return fruitId;
    }

    // End episode
    function endRoot(uint256 rootId) external {
        Root storage root = roots[rootId];
        require(msg.sender == root.streamer, "Not streamer");
        require(!root.ended, "Already ended");
        root.ended = true;
        emit RootEnded(rootId);
    }

    // Fruit tokens are soulbound (non-transferable)
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);

        // Allow minting (from == 0) but not transfers after fruiting
        if (from != address(0) && branches[tokenId].fruited) {
            revert("Soulbound: cannot transfer fruited tokens");
        }
    }
}
```

---

## File Structure

```
streamtree/
├── apps/
│   ├── web/                      # Next.js frontend
│   │   ├── app/
│   │   │   ├── page.tsx          # Landing
│   │   │   ├── create/
│   │   │   │   └── page.tsx      # Episode setup
│   │   │   ├── dashboard/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx  # Live dashboard
│   │   │   ├── play/
│   │   │   │   └── [code]/
│   │   │   │       └── page.tsx  # Viewer join
│   │   │   ├── card/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx  # Card view
│   │   │   ├── gallery/
│   │   │   │   └── page.tsx      # My collectibles
│   │   │   └── auth/
│   │   │       └── callback/
│   │   │           └── twitch/
│   │   │               └── page.tsx
│   │   ├── components/
│   │   │   ├── CardRenderer.tsx
│   │   │   ├── EventGrid.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ArtworkUploader.tsx
│   │   │   ├── WalletConnector.tsx
│   │   │   └── Leaderboard.tsx
│   │   ├── hooks/
│   │   │   ├── useEpisode.ts
│   │   │   ├── useCard.ts
│   │   │   ├── useWebSocket.ts
│   │   │   └── useWallet.ts
│   │   └── lib/
│   │       ├── api.ts
│   │       └── websocket.ts
│   │
│   └── api/                      # Express backend
│       ├── src/
│       │   ├── index.ts          # Entry point
│       │   ├── routes/
│       │   │   ├── episodes.ts
│       │   │   ├── cards.ts
│       │   │   ├── users.ts
│       │   │   └── webhooks.ts
│       │   ├── services/
│       │   │   ├── episode.service.ts
│       │   │   ├── card.service.ts
│       │   │   ├── event.service.ts
│       │   │   ├── payment.service.ts
│       │   │   └── blockchain.service.ts
│       │   ├── websocket/
│       │   │   ├── server.ts
│       │   │   └── handlers.ts
│       │   ├── integrations/
│       │   │   ├── twitch.ts
│       │   │   ├── stripe.ts
│       │   │   └── ipfs.ts
│       │   └── db/
│       │       ├── client.ts
│       │       └── migrations/
│       └── prisma/
│           └── schema.prisma
│
├── packages/
│   ├── contracts/                # Solidity contracts
│   │   ├── src/
│   │   │   └── StreamTree.sol
│   │   └── test/
│   │       └── StreamTree.test.ts
│   │
│   ├── shared/                   # Shared types & utils
│   │   ├── types/
│   │   │   ├── episode.ts
│   │   │   ├── card.ts
│   │   │   └── events.ts
│   │   └── utils/
│   │       ├── grid.ts
│   │       └── patterns.ts
│   │
│   └── ui/                       # Shared UI components
│       └── src/
│           ├── Button.tsx
│           ├── Input.tsx
│           └── Modal.tsx
│
├── docker-compose.yml
├── package.json
├── turbo.json
└── README.md
```

---

## Implementation Phases

### Phase 1: Core MVP
- User authentication (wallet + custodial)
- Episode CRUD (create, configure, launch)
- Card minting (free only)
- Manual event triggering
- Real-time card updates via WebSocket
- Basic streamer dashboard
- Card display component

### Phase 2: Payments & Polish
- Stripe integration for paid cards
- Artwork upload to S3/IPFS
- Improved card renderer with animations
- Leaderboard display
- Episode end flow
- Revenue withdrawal

### Phase 3: Blockchain Integration
- L2 smart contract deployment
- Root token minting on launch
- Branch token minting on card creation
- Fruit token minting on episode end
- Wallet connection improvements

### Phase 4: Automation & Integrations
- Twitch EventSub integration
- Chat keyword detection
- Custom webhook support
- OBS integration (stretch)

### Phase 5: Growth Features
- Gallery/collectibles page
- Cross-episode stats
- Templates (bingo presets)
- Multi-streamer support

---

## Testing Strategy

### Unit Tests
- Card grid generation (randomization)
- Pattern detection algorithm
- Event firing logic
- Payment calculations

### Integration Tests
- Episode lifecycle (draft → live → ended)
- Card minting flow
- WebSocket event broadcasting
- Twitch webhook handling
- Stripe webhook handling

### E2E Tests
- Streamer: Create episode → Launch → Fire events → End show
- Viewer: Join → Mint card → Watch updates → Receive fruit
- Payment flow: Free cards, paid cards, withdrawal

---

## Security Considerations

1. **Authentication**: JWT tokens with short expiry, refresh tokens stored securely
2. **Authorization**: Verify episode ownership before modifications
3. **Rate Limiting**: Prevent spam card minting, event firing abuse
4. **Webhook Verification**: Validate Twitch/Stripe signatures
5. **Input Validation**: Sanitize all user inputs (episode names, events)
6. **Payment Security**: Never store card details, use Stripe Elements
7. **Smart Contract**: Reentrancy guards, access controls, pausability

---

## Performance Considerations

1. **WebSocket Scaling**: Use Redis pub/sub for multi-instance support
2. **Database Indexes**: On frequently queried columns (episode_id, holder_id, status)
3. **Caching**: Redis cache for episode data, leaderboards
4. **Batch Processing**: Fruit cards in batches of 50 to avoid timeouts
5. **CDN**: Serve artwork via CloudFront/CDN
6. **Connection Pooling**: PgBouncer for database connections

---

## Monitoring & Observability

1. **Metrics**: Episode creation rate, cards minted, events fired, revenue
2. **Logs**: Structured logging with request IDs
3. **Alerts**: Failed payments, WebSocket disconnects, contract failures
4. **Dashboards**: Real-time platform health, active episodes, concurrent viewers
