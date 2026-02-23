import { Router } from 'express';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { broadcastToEpisode, broadcastStats, sendToUser } from '../websocket/server.js';
import {
  isBlockchainConfigured,
  mintBranchToken,
  generateMetadataUri,
} from '../services/blockchain.service.js';
import { createPaymentIntent } from '../services/stripe.service.js';
import { sanitizeError } from '../utils/sanitize.js';
import { mintCardAtomically, MintError } from '../services/card-mint.service.js';

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
    const episodeId = req.params.episodeId;

    // Quick pre-check: reject paid episodes before entering the transaction
    const episodePreCheck = await prisma.episode.findUnique({
      where: { id: episodeId },
      select: { cardPrice: true, rootTokenId: true, gridSize: true },
    });

    if (!episodePreCheck) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episodePreCheck.cardPrice > 0) {
      throw new AppError(
        'This episode requires payment. Use POST /api/cards/mint/:episodeId/payment to initiate payment.',
        402,
        'PAYMENT_REQUIRED'
      );
    }

    // Atomically mint the card (serializable transaction prevents race conditions)
    let mintResult;
    try {
      mintResult = await mintCardAtomically({
        episodeId,
        holderId: req.user!.id,
      });
    } catch (error) {
      if (error instanceof MintError) {
        throw new AppError(error.message, error.statusCode, error.code);
      }
      throw error;
    }

    const { card, cardNumber } = mintResult;

    // Fetch full card with episode include for response (outside transaction)
    const fullCard = await prisma.card.findUnique({
      where: { id: card.id },
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

    // Mint branch token on blockchain if configured (outside transaction)
    let branchTokenId: string | null = null;

    if (
      isBlockchainConfigured() &&
      episodePreCheck.rootTokenId &&
      req.user!.walletAddress
    ) {
      try {
        const metadataUri = generateMetadataUri('branch', card.id, {
          cardId: card.id,
          episodeId,
          cardNumber,
          gridSize: episodePreCheck.gridSize,
        });

        const result = await mintBranchToken(
          episodePreCheck.rootTokenId,
          req.user!.walletAddress,
          card.id,
          metadataUri
        );

        if (result) {
          branchTokenId = result.tokenId;
          console.log('Branch token minted:', branchTokenId, 'tx:', result.transactionHash);

          await prisma.card.update({
            where: { id: card.id },
            data: { branchTokenId },
          });
        }
      } catch (error) {
        console.error('Failed to mint branch token, continuing without blockchain:', sanitizeError(error));
      }
    }

    // Broadcast stats update
    broadcastStats(episodeId);

    res.status(201).json({
      success: true,
      data: {
        ...fullCard,
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

    // Atomically check for existing pending payment and create new one
    // This prevents duplicate payment intents from concurrent requests
    const userId = req.user!.id;
    const pendingPayment = await prisma.$transaction(async (tx) => {
      const existingPending = await tx.pendingPayment.findFirst({
        where: {
          episodeId: episode.id,
          userId,
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
        userId,
      });

      // Track the pending payment (expires in 30 minutes)
      await tx.pendingPayment.create({
        data: {
          episodeId: episode.id,
          userId,
          paymentIntentId,
          amount: episode.cardPrice,
          status: 'pending',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });

      return { clientSecret, paymentIntentId };
    });

    res.status(201).json({
      success: true,
      data: {
        clientSecret: pendingPayment.clientSecret,
        paymentIntentId: pendingPayment.paymentIntentId,
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
