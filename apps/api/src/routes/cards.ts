import { Router } from 'express';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { generateCardGrid } from '@streamtree/shared';
import { broadcastToEpisode, broadcastStats, sendToUser } from '../websocket/server.js';
import {
  isBlockchainConfigured,
  mintBranchToken,
  generateMetadataUri,
} from '../services/blockchain.service.js';
import { createPaymentIntent } from '../services/stripe.service.js';
import { sanitizeError } from '../utils/sanitize.js';

const router = Router();

// Get user's cards
router.get('/my', async (req: AuthenticatedRequest, res, next) => {
  try {
    const cards = await prisma.card.findMany({
      where: { holderId: req.user!.id },
      orderBy: { mintedAt: 'desc' },
      include: {
        episode: {
          select: {
            id: true,
            name: true,
            artworkUrl: true,
            status: true,
            streamer: {
              select: { username: true, displayName: true },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      data: cards.map((card: typeof cards[number]) => ({
        ...card,
        episode: {
          ...card.episode,
          streamerName: card.episode.streamer.displayName || card.episode.streamer.username,
        },
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Get user's card for specific episode
router.get('/my/:episodeId', async (req: AuthenticatedRequest, res, next) => {
  try {
    const card = await prisma.card.findUnique({
      where: {
        episodeId_holderId: {
          episodeId: req.params.episodeId,
          holderId: req.user!.id,
        },
      },
      include: {
        episode: {
          include: {
            eventDefinitions: {
              orderBy: { sortOrder: 'asc' },
            },
            streamer: {
              select: { username: true, displayName: true },
            },
          },
        },
      },
    });

    if (!card) {
      throw new AppError('Card not found', 404, 'NOT_FOUND');
    }

    res.json({ success: true, data: card });
  } catch (error) {
    next(error);
  }
});

// Get single card
router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const card = await prisma.card.findUnique({
      where: { id: req.params.id },
      include: {
        episode: {
          include: {
            eventDefinitions: {
              orderBy: { sortOrder: 'asc' },
            },
            streamer: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        },
        holder: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    if (!card) {
      throw new AppError('Card not found', 404, 'NOT_FOUND');
    }

    // Only holder or streamer can see card details during live episode
    // SECURITY: Compare by user ID, not username (IDs are immutable and unique)
    if (
      card.episode.status === 'live' &&
      card.holderId !== req.user!.id &&
      card.episode.streamer.id !== req.user!.id
    ) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    res.json({ success: true, data: card });
  } catch (error) {
    next(error);
  }
});

// Mint a card for an episode
router.post('/mint/:episodeId', async (req: AuthenticatedRequest, res, next) => {
  try {
    const episodeBase = await prisma.episode.findUnique({
      where: { id: req.params.episodeId },
      include: {
        eventDefinitions: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    const episode = episodeBase as (typeof episodeBase & { rootTokenId?: string | null }) | null;

    // Fetch rootTokenId separately for blockchain integration
    const episodeWithRoot = episode ? await prisma.episode.findUnique({
      where: { id: episode.id },
      select: { rootTokenId: true },
    }) : null;

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.status !== 'live') {
      throw new AppError('Episode is not accepting cards', 400, 'INVALID_STATUS');
    }

    if (episode.maxCards && episode.cardsMinted >= episode.maxCards) {
      throw new AppError('Episode is sold out', 400, 'SOLD_OUT');
    }

    // Check if user already has a card
    const existingCard = await prisma.card.findUnique({
      where: {
        episodeId_holderId: {
          episodeId: episode.id,
          holderId: req.user!.id,
        },
      },
    });

    if (existingCard) {
      throw new AppError('Already have a card for this episode', 400, 'DUPLICATE');
    }

    // Paid cards require payment flow
    if (episode.cardPrice > 0) {
      throw new AppError(
        'This episode requires payment. Use POST /api/cards/mint/:episodeId/payment to initiate payment.',
        402,
        'PAYMENT_REQUIRED'
      );
    }

    // Generate the card grid
    type EventDef = typeof episode.eventDefinitions[number];
    const grid = generateCardGrid(
      episode.eventDefinitions.map((e: EventDef) => ({
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
      episode.gridSize
    );

    // Mark any already-fired events
    const firedEventIds = episode.eventDefinitions
      .filter((e: EventDef) => e.firedAt !== null)
      .map((e: EventDef) => e.id);

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

    // Create the card
    const card = await prisma.card.create({
      data: {
        episodeId: episode.id,
        holderId: req.user!.id,
        grid: grid as any,
        markedSquares: markedCount,
        cardNumber: episode.cardsMinted + 1,
      },
      include: {
        episode: {
          select: {
            id: true,
            name: true,
            artworkUrl: true,
            status: true,
            rootTokenId: true,
          },
        },
      },
    });

    // Mint branch token on blockchain if configured
    let branchTokenId: string | null = null;

    if (
      isBlockchainConfigured() &&
      episodeWithRoot?.rootTokenId &&
      req.user!.walletAddress
    ) {
      try {
        const metadataUri = generateMetadataUri('branch', card.id, {
          cardId: card.id,
          episodeId: episode.id,
          cardNumber: card.cardNumber,
          gridSize: episode.gridSize,
        });

        const result = await mintBranchToken(
          episodeWithRoot.rootTokenId,
          req.user!.walletAddress,
          card.id,
          metadataUri
        );

        if (result) {
          branchTokenId = result.tokenId;
          console.log('Branch token minted:', branchTokenId, 'tx:', result.transactionHash);

          // Update card with branch token ID
          await prisma.card.update({
            where: { id: card.id },
            data: { branchTokenId },
          });
        }
      } catch (error) {
        console.error('Failed to mint branch token, continuing without blockchain:', sanitizeError(error));
        // Continue without blockchain - don't block the card creation
      }
    }

    // Update episode stats
    await prisma.episode.update({
      where: { id: episode.id },
      data: {
        cardsMinted: { increment: 1 },
      },
    });

    // Broadcast stats update
    broadcastStats(episode.id);

    res.status(201).json({
      success: true,
      data: {
        ...card,
        branchTokenId,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create payment intent for a paid card
router.post('/mint/:episodeId/payment', async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.episodeId },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.status !== 'live') {
      throw new AppError('Episode is not accepting cards', 400, 'INVALID_STATUS');
    }

    if (episode.cardPrice <= 0) {
      throw new AppError('This episode is free. Use POST /api/cards/mint/:episodeId instead.', 400, 'FREE_EPISODE');
    }

    if (episode.maxCards && episode.cardsMinted >= episode.maxCards) {
      throw new AppError('Episode is sold out', 400, 'SOLD_OUT');
    }

    // Check if user already has a card
    const existingCard = await prisma.card.findUnique({
      where: {
        episodeId_holderId: {
          episodeId: episode.id,
          holderId: req.user!.id,
        },
      },
    });

    if (existingCard) {
      throw new AppError('Already have a card for this episode', 400, 'DUPLICATE');
    }

    // Check for an existing pending payment
    const existingPending = await prisma.pendingPayment.findFirst({
      where: {
        episodeId: episode.id,
        userId: req.user!.id,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    if (existingPending) {
      throw new AppError(
        'A payment is already in progress for this episode',
        409,
        'PAYMENT_IN_PROGRESS'
      );
    }

    // Create payment intent
    const { clientSecret, paymentIntentId } = await createPaymentIntent({
      amount: episode.cardPrice,
      episodeId: episode.id,
      userId: req.user!.id,
    });

    // Track the pending payment (expires in 30 minutes)
    await prisma.pendingPayment.create({
      data: {
        episodeId: episode.id,
        userId: req.user!.id,
        paymentIntentId,
        amount: episode.cardPrice,
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        clientSecret,
        paymentIntentId,
        amount: episode.cardPrice,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Gallery - get all fruited cards
router.get('/gallery/all', async (req: AuthenticatedRequest, res, next) => {
  try {
    const cards = await prisma.card.findMany({
      where: {
        holderId: req.user!.id,
        status: 'fruited',
      },
      orderBy: { fruitedAt: 'desc' },
      include: {
        episode: {
          select: {
            id: true,
            name: true,
            artworkUrl: true,
            endedAt: true,
            streamer: {
              select: { username: true, displayName: true },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      data: cards.map((card: typeof cards[number]) => ({
        id: card.id,
        episodeId: card.episodeId,
        episodeName: card.episode.name,
        artworkUrl: card.episode.artworkUrl,
        streamerName: card.episode.streamer.displayName || card.episode.streamer.username,
        cardNumber: card.cardNumber,
        markedSquares: card.markedSquares,
        patterns: card.patterns,
        mintedAt: card.mintedAt,
        fruitedAt: card.fruitedAt,
        fruitTokenId: card.fruitTokenId,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export { router as cardsRouter };
