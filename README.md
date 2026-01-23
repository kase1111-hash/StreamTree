# StreamTree

Mint an NFTree for your stream. Import art, set parameters, go live.

## What This Does

You're a streamer. You want your audience to play along with your broadcast. StreamTree lets you create an interactive game in under two minutes.

1. Upload your art (this becomes the card design)
2. Set the parameters (name, price, card count, events)
3. Launch
4. Your audience mints cards and plays along
5. Show ends, everyone gets their commemorative

That's it.

## The Flow

### You (Streamer)

```
Upload cover art
     ↓
Name your episode
     ↓
Set card price (or free)
     ↓
Define events (what marks squares)
     ↓
Launch → Get share link
     ↓
Run your show
     ↓
End broadcast → Cards fruit automatically
```

### Them (Audience)

```
Click your link
     ↓
Mint a card (unique to them)
     ↓
Watch stream, card updates live
     ↓
Show ends → Card becomes collectible
```

## Setup Screen

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ┌─────────────┐                                │
│  │             │   Episode Name                 │
│  │   [DROP     │   ________________________     │
│  │    ART      │                                │
│  │    HERE]    │   Card Price                   │
│  │             │   ○ Free  ○ $1  ○ $3  ○ $5    │
│  └─────────────┘                                │
│                    Max Cards                    │
│                    ________________________     │
│                    (blank = unlimited)          │
│                                                 │
│  Events (what marks squares)                    │
│  ┌─────────────────────────────────────────┐   │
│  │ + Add Event                              │   │
│  │                                          │   │
│  │ ☑ Streamer says catchphrase             │   │
│  │ ☑ Donation goal reached                 │   │
│  │ ☑ Chat spam detected                    │   │
│  │ ☑ Streamer rage quits                   │   │
│  │ ☑ Guest appears                         │   │
│  │ ☑ Technical difficulties                │   │
│  │ ☐ Custom: _______________               │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│              [ Launch Episode ]                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

## What Gets Created

### The Root (Your Episode)

```
Episode: "Friday Night Chaos - Ep. 23"
Art: [your uploaded image]
Cards: 500 max
Price: $3
Events: 12 defined
Status: Live
```

### The Branches (Audience Cards)

Each viewer gets a unique card:
- Same art style (your upload as base)
- Randomized event placement (5x5 grid)
- Their wallet/username attached
- Updates live as events fire

### The Fruit (Commemoratives)

When you end the show:
- Every card freezes
- Final state minted as permanent token
- Shows: which squares hit, final pattern, timestamp
- Your art + their outcome = unique collectible

## Event Triggering

Two modes:

### Manual (Simple)
You click buttons on your dashboard as things happen.

```
[ Catchphrase! ] [ Rage Quit ] [ Tech Fail ] [ Guest On ]
```

Audience cards update instantly.

### Integrated (Advanced)
Connect to stream events:
- Twitch alerts API (donations, subs, raids)
- Chat keyword detection
- OBS scene changes
- Custom webhooks

Events fire automatically.

## The Art

Your upload becomes the visual identity.

- Used as card background/frame
- Appears on every branch and fruit
- Think album cover - represents this episode
- Recommended: 1:1 ratio, high contrast, your branding

The generated cards layer your art with:
- Grid overlay
- Event icons in squares
- Player identifier
- Live marking animation
- Final state snapshot

## Audience Experience

### Join
- Click streamer's link
- Connect wallet (or create temp wallet)
- Pay card price (if any)
- Receive unique card

### Play
- Card appears in overlay or separate tab
- Squares light up as events happen
- Optional: click to mark manually (honor system mode)
- Chase patterns (row, diagonal, blackout)

### Keep
- Show ends, card fruits
- Final card saved to wallet
- Proof of participation forever
- Collectible in their gallery

## Streamer Dashboard (During Show)

```
┌─────────────────────────────────────────────────┐
│  Friday Night Chaos - Ep. 23          [LIVE]   │
│                                                 │
│  Cards Minted: 247 / 500                        │
│  Revenue: $741                                  │
│                                                 │
│  Fire Events:                                   │
│  [ Catchphrase ] [ Donation ] [ Rage ] [ Guest ]│
│  [ Tech Fail ] [ Chat Spam ] [ Victory ] [ F ]  │
│                                                 │
│  Recent:                                        │
│  • 2:34pm - Catchphrase fired (247 cards)       │
│  • 2:31pm - Donation goal fired (242 cards)     │
│  • 2:28pm - Chat spam fired (238 cards)         │
│                                                 │
│  Leaders:                                       │
│  1. xXGamer99Xx - 8 squares                     │
│  2. cozyviewer - 7 squares                      │
│  3. lurker_andy - 7 squares                     │
│                                                 │
│                    [ END SHOW ]                 │
└─────────────────────────────────────────────────┘
```

## End Show

Click "End Show" and:

1. All cards freeze instantly
2. Final states calculated
3. Fruits minted to all players
4. Leaderboard finalized
5. Revenue available for withdrawal
6. Episode archived

Players get push notification: "Your card from Friday Night Chaos is ready"

## Revenue

- You set card price
- Platform takes small cut (TBD, think 5-10%)
- Rest goes to your wallet
- Withdrawable immediately after show

No subscriptions. No monthly fees. You earn when you stream.

## Why This Works

For streamers:
- New revenue stream beyond tips/subs
- Engagement that doesn't require constant chat reading
- Collectibles your community actually wants
- Takes 2 minutes to set up

For audiences:
- Own a piece of streams you love
- Game layer on top of passive watching
- Proof you were there for legendary moments
- Collect across your favorite creators

For the ecosystem:
- Every show is an NFTree
- Every card is a branch
- Every commemorative is fruit
- One pattern, infinite shows

## Technical Notes

- Built on NatLangChain / NFTree primitive
- Cards mint on L2 (cheap, fast)
- Real-time updates via WebSocket
- Works in browser, no app install
- Wallet optional (custodial fallback)

## Future

- Templates (bingo, predictions, trivia)
- Cross-episode rewards (season passes)
- Collaboration shows (multi-streamer roots)
- Fruit evolution (repeat viewers get upgrades)
- API for game engines / custom UIs

## Development

### Quick Start

```bash
# Clone and install
git clone https://github.com/kase1111-hash/StreamTree.git
cd StreamTree
npm install

# Start infrastructure
docker-compose up -d

# Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Setup database
npm run db:generate && npm run db:push

# Start development servers
npm run dev
```

The API runs on `http://localhost:3001` and the web app on `http://localhost:3000`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed setup instructions.

### Project Structure

```
StreamTree/
├── apps/
│   ├── api/          # Express backend
│   └── web/          # Next.js frontend
├── packages/
│   ├── shared/       # Shared types and utilities
│   ├── contracts/    # Solidity smart contracts
│   └── e2e-tests/    # Integration tests
└── docker-compose.yml
```

## Documentation

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Development setup and contribution guidelines
- [SPEC.md](./SPEC.md) - Technical specification
- [NFTree.md](./NFTree.md) - NFTree conceptual model
- [CHANGELOG.md](./CHANGELOG.md) - Version history
- [SECURITY.md](./SECURITY.md) - Security policy

## Part Of

NFTree Pattern → StreamTree Implementation

---

Upload art. Set parameters. Go live. Your audience plays along. Everyone keeps proof.

That's StreamTree.
