import { Router } from 'express';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { AuthenticatedRequest, requireStreamer } from '../middleware/auth.js';
import { generateShareCode, validateEpisodeName, validateGridSize, validateMaxCards, validateCardPrice } from '@streamtree/shared';
import { broadcastToEpisode, broadcastStats } from '../websocket/server.js';
import {
  isBlockchainConfigured,
  createRootToken,
  endRootToken,
  batchMintFruitTokens,
  generateMetadataUri,
  getContractAddress,
} from '../services/blockchain.service.js';

const router = Router();

// List streamer's episodes
router.get('/', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const episodes = await prisma.episode.findMany({
      where: { streamerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { cards: true, eventDefinitions: true },
        },
      },
    });

    res.json({
      success: true,
      data: episodes.map((ep) => ({
        ...ep,
        cardsCount: ep._count.cards,
        eventsCount: ep._count.eventDefinitions,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Get single episode
router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
      include: {
        eventDefinitions: {
          orderBy: { sortOrder: 'asc' },
        },
        streamer: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    // Only streamer can see draft episodes
    if (episode.status === 'draft' && episode.streamerId !== req.user!.id) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    res.json({ success: true, data: episode });
  } catch (error) {
    next(error);
  }
});

// Create new episode
router.post('/', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { name, cardPrice = 0, maxCards = null, gridSize = 5 } = req.body;

    // Validate inputs
    const nameValidation = validateEpisodeName(name);
    if (!nameValidation.valid) {
      throw new AppError(nameValidation.error!, 400, 'VALIDATION_ERROR');
    }

    const gridValidation = validateGridSize(gridSize);
    if (!gridValidation.valid) {
      throw new AppError(gridValidation.error!, 400, 'VALIDATION_ERROR');
    }

    const priceValidation = validateCardPrice(cardPrice);
    if (!priceValidation.valid) {
      throw new AppError(priceValidation.error!, 400, 'VALIDATION_ERROR');
    }

    const maxCardsValidation = validateMaxCards(maxCards);
    if (!maxCardsValidation.valid) {
      throw new AppError(maxCardsValidation.error!, 400, 'VALIDATION_ERROR');
    }

    // Generate unique share code
    let shareCode = generateShareCode();
    while (await prisma.episode.findUnique({ where: { shareCode } })) {
      shareCode = generateShareCode();
    }

    const episode = await prisma.episode.create({
      data: {
        streamerId: req.user!.id,
        name: name.trim(),
        cardPrice,
        maxCards,
        gridSize,
        shareCode,
        status: 'draft',
      },
      include: {
        eventDefinitions: true,
      },
    });

    res.status(201).json({ success: true, data: episode });
  } catch (error) {
    next(error);
  }
});

// Update episode (draft only)
router.patch('/:id', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (episode.status !== 'draft') {
      throw new AppError('Cannot modify episode after launch', 400, 'INVALID_STATUS');
    }

    const { name, cardPrice, maxCards, gridSize, artworkUrl } = req.body;
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      const nameValidation = validateEpisodeName(name);
      if (!nameValidation.valid) {
        throw new AppError(nameValidation.error!, 400, 'VALIDATION_ERROR');
      }
      updateData.name = name.trim();
    }

    if (cardPrice !== undefined) {
      const priceValidation = validateCardPrice(cardPrice);
      if (!priceValidation.valid) {
        throw new AppError(priceValidation.error!, 400, 'VALIDATION_ERROR');
      }
      updateData.cardPrice = cardPrice;
    }

    if (maxCards !== undefined) {
      const maxCardsValidation = validateMaxCards(maxCards);
      if (!maxCardsValidation.valid) {
        throw new AppError(maxCardsValidation.error!, 400, 'VALIDATION_ERROR');
      }
      updateData.maxCards = maxCards;
    }

    if (gridSize !== undefined) {
      const gridValidation = validateGridSize(gridSize);
      if (!gridValidation.valid) {
        throw new AppError(gridValidation.error!, 400, 'VALIDATION_ERROR');
      }
      updateData.gridSize = gridSize;
    }

    if (artworkUrl !== undefined) {
      updateData.artworkUrl = artworkUrl;
    }

    const updated = await prisma.episode.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        eventDefinitions: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// Delete episode (draft only)
router.delete('/:id', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (episode.status !== 'draft') {
      throw new AppError('Cannot delete episode after launch', 400, 'INVALID_STATUS');
    }

    await prisma.episode.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, data: { message: 'Episode deleted' } });
  } catch (error) {
    next(error);
  }
});

// Launch episode
router.post('/:id/launch', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
      include: { eventDefinitions: true },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (episode.status !== 'draft') {
      throw new AppError('Episode already launched', 400, 'INVALID_STATUS');
    }

    if (episode.eventDefinitions.length === 0) {
      throw new AppError('Episode must have at least one event', 400, 'VALIDATION_ERROR');
    }

    // Mint root token on blockchain if configured
    let rootTokenId: string | null = null;
    let contractAddress: string | null = null;

    if (isBlockchainConfigured() && req.user!.walletAddress) {
      try {
        const metadataUri = generateMetadataUri('root', episode.id, {
          name: episode.name,
          artworkUrl: episode.artworkUrl,
          gridSize: episode.gridSize,
          maxCards: episode.maxCards,
        });

        const result = await createRootToken(
          req.user!.walletAddress,
          episode.id,
          episode.maxCards || 0,
          metadataUri
        );

        if (result) {
          rootTokenId = result.tokenId;
          contractAddress = getContractAddress();
          console.log('Root token created:', rootTokenId, 'tx:', result.transactionHash);
        }
      } catch (error) {
        console.error('Failed to mint root token, continuing without blockchain:', error);
        // Continue without blockchain - don't block the launch
      }
    }

    const updated = await prisma.episode.update({
      where: { id: req.params.id },
      data: {
        status: 'live',
        launchedAt: new Date(),
        rootTokenId,
        contractAddress,
      },
      include: {
        eventDefinitions: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // Broadcast to any connected clients
    broadcastToEpisode(episode.id, {
      type: 'episode:state',
      episodeId: episode.id,
      status: 'live',
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// End episode
router.post('/:id/end', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (episode.status !== 'live') {
      throw new AppError('Episode is not live', 400, 'INVALID_STATUS');
    }

    // End root token on blockchain if configured
    if (isBlockchainConfigured() && episode.rootTokenId) {
      try {
        await endRootToken(episode.rootTokenId);
        console.log('Root token ended:', episode.rootTokenId);
      } catch (error) {
        console.error('Failed to end root token:', error);
        // Continue anyway
      }
    }

    const updated = await prisma.episode.update({
      where: { id: req.params.id },
      data: {
        status: 'ended',
        endedAt: new Date(),
      },
    });

    // Get all cards with branch tokens for fruit minting
    const cards = await prisma.card.findMany({
      where: { episodeId: episode.id, status: 'active' },
      include: {
        holder: {
          select: { walletAddress: true },
        },
      },
    });

    // Batch mint fruit tokens if blockchain is configured
    if (isBlockchainConfigured() && cards.length > 0) {
      // Filter cards that have branch tokens
      const cardsWithBranches = cards.filter((c) => c.branchTokenId);

      if (cardsWithBranches.length > 0) {
        try {
          // Process in batches of 50 (contract limit)
          const BATCH_SIZE = 50;

          for (let i = 0; i < cardsWithBranches.length; i += BATCH_SIZE) {
            const batch = cardsWithBranches.slice(i, i + BATCH_SIZE);

            const branchTokenIds = batch.map((c) => c.branchTokenId!);
            const finalScores = batch.map((c) => c.markedSquares);
            const patterns = batch.map((c) => (c.patterns as any[]).length);
            const metadataUris = batch.map((c) =>
              generateMetadataUri('fruit', c.id, {
                cardId: c.id,
                episodeId: episode.id,
                finalScore: c.markedSquares,
                patterns: c.patterns,
              })
            );

            const fruitResults = await batchMintFruitTokens(
              branchTokenIds,
              finalScores,
              patterns,
              metadataUris
            );

            if (fruitResults) {
              // Update each card with its fruit token ID
              for (let j = 0; j < batch.length; j++) {
                if (fruitResults[j]) {
                  await prisma.card.update({
                    where: { id: batch[j].id },
                    data: {
                      fruitTokenId: fruitResults[j].tokenId,
                      status: 'fruited',
                      fruitedAt: new Date(),
                    },
                  });
                }
              }

              console.log(`Batch minted ${fruitResults.length} fruit tokens`);
            }
          }
        } catch (error) {
          console.error('Failed to batch mint fruit tokens:', error);
          // Continue - update card status without blockchain tokens
        }
      }
    }

    // Update any remaining cards to fruited status (those without blockchain tokens)
    await prisma.card.updateMany({
      where: { episodeId: episode.id, status: 'active' },
      data: { status: 'fruited', fruitedAt: new Date() },
    });

    // Broadcast end
    broadcastToEpisode(episode.id, {
      type: 'episode:state',
      episodeId: episode.id,
      status: 'ended',
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// Get episode stats
router.get('/:id/stats', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    const [eventsTriggered, leaderboard] = await Promise.all([
      prisma.firedEvent.count({
        where: { episodeId: episode.id },
      }),
      prisma.card.findMany({
        where: { episodeId: episode.id },
        orderBy: { markedSquares: 'desc' },
        take: 10,
        include: {
          holder: {
            select: { id: true, username: true, displayName: true },
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        cardsMinted: episode.cardsMinted,
        totalRevenue: episode.totalRevenue,
        eventsTriggered,
        leaderboard: leaderboard.map((card, index) => ({
          rank: index + 1,
          cardId: card.id,
          holderId: card.holderId,
          username: card.holder.displayName || card.holder.username,
          markedSquares: card.markedSquares,
          patterns: card.patterns,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get episode results (public for ended episodes)
router.get('/:id/results', async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
      include: {
        streamer: {
          select: { id: true, username: true, displayName: true },
        },
        eventDefinitions: true,
        firedEvents: true,
      },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    // Only show results for ended episodes (or live/ended for the streamer)
    if (episode.status === 'draft') {
      throw new AppError('Episode not available', 404, 'NOT_FOUND');
    }

    const leaderboard = await prisma.card.findMany({
      where: { episodeId: episode.id },
      orderBy: { markedSquares: 'desc' },
      take: 50,
      include: {
        holder: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    res.json({
      success: true,
      data: {
        id: episode.id,
        name: episode.name,
        artworkUrl: episode.artworkUrl,
        status: episode.status,
        cardsMinted: episode.cardsMinted,
        totalRevenue: episode.totalRevenue,
        launchedAt: episode.launchedAt,
        endedAt: episode.endedAt,
        streamer: episode.streamer,
        eventsFired: episode.firedEvents.length,
        totalEvents: episode.eventDefinitions.length,
        leaderboard: leaderboard.map((card, index) => ({
          rank: index + 1,
          cardId: card.id,
          holderId: card.holderId,
          username: card.holder.displayName || card.holder.username,
          markedSquares: card.markedSquares,
          patterns: card.patterns,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Add event definition
router.post('/:id/events', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (episode.status !== 'draft') {
      throw new AppError('Cannot add events after launch', 400, 'INVALID_STATUS');
    }

    const { name, icon = '🎯', description, triggerType = 'manual', triggerConfig } = req.body;

    if (!name || name.trim().length === 0) {
      throw new AppError('Event name is required', 400, 'VALIDATION_ERROR');
    }

    // Get current max order
    const maxOrder = await prisma.eventDefinition.aggregate({
      where: { episodeId: episode.id },
      _max: { sortOrder: true },
    });

    const event = await prisma.eventDefinition.create({
      data: {
        episodeId: episode.id,
        name: name.trim(),
        icon,
        description,
        triggerType,
        triggerConfig,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    res.status(201).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
});

// Update event definition
router.patch('/:id/events/:eventId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (episode.status !== 'draft') {
      throw new AppError('Cannot modify events after launch', 400, 'INVALID_STATUS');
    }

    const event = await prisma.eventDefinition.findFirst({
      where: { id: req.params.eventId, episodeId: episode.id },
    });

    if (!event) {
      throw new AppError('Event not found', 404, 'NOT_FOUND');
    }

    const { name, icon, description, triggerType, triggerConfig, order } = req.body;
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (icon !== undefined) {
      updateData.icon = icon;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (triggerType !== undefined) {
      updateData.triggerType = triggerType;
    }
    if (triggerConfig !== undefined) {
      updateData.triggerConfig = triggerConfig;
    }
    if (order !== undefined) {
      updateData.sortOrder = order;
    }

    const updated = await prisma.eventDefinition.update({
      where: { id: req.params.eventId },
      data: updateData,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// Delete event definition
router.delete('/:id/events/:eventId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (episode.status !== 'draft') {
      throw new AppError('Cannot delete events after launch', 400, 'INVALID_STATUS');
    }

    const event = await prisma.eventDefinition.findFirst({
      where: { id: req.params.eventId, episodeId: episode.id },
    });

    if (!event) {
      throw new AppError('Event not found', 404, 'NOT_FOUND');
    }

    await prisma.eventDefinition.delete({
      where: { id: req.params.eventId },
    });

    res.json({ success: true, data: { message: 'Event deleted' } });
  } catch (error) {
    next(error);
  }
});

// Fire event
router.post('/:id/events/:eventId/fire', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (episode.status !== 'live') {
      throw new AppError('Episode is not live', 400, 'INVALID_STATUS');
    }

    const event = await prisma.eventDefinition.findFirst({
      where: { id: req.params.eventId, episodeId: episode.id },
    });

    if (!event) {
      throw new AppError('Event not found', 404, 'NOT_FOUND');
    }

    // Get all cards for this episode
    const cards = await prisma.card.findMany({
      where: { episodeId: episode.id, status: 'active' },
    });

    let cardsAffected = 0;

    // Update each card's grid
    for (const card of cards) {
      const grid = card.grid as any[][];
      let updated = false;

      for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
          if (grid[row][col].eventId === event.id && !grid[row][col].marked) {
            grid[row][col].marked = true;
            grid[row][col].markedAt = new Date().toISOString();
            updated = true;
          }
        }
      }

      if (updated) {
        cardsAffected++;

        // Count marked squares
        const markedCount = grid.flat().filter((sq) => sq.marked).length;

        // Detect patterns
        const patterns = detectCardPatterns(grid);

        await prisma.card.update({
          where: { id: card.id },
          data: {
            grid,
            markedSquares: markedCount,
            patterns,
          },
        });

        // Broadcast card update
        broadcastToEpisode(episode.id, {
          type: 'card:updated',
          cardId: card.id,
          markedSquares: grid.flat().filter((sq) => sq.eventId === event.id && sq.marked),
          newPatterns: patterns,
          totalMarked: markedCount,
        });
      }
    }

    // Record fired event
    const firedEvent = await prisma.firedEvent.create({
      data: {
        episodeId: episode.id,
        eventDefinitionId: event.id,
        firedBy: 'manual',
        cardsAffected,
      },
    });

    // Update event definition
    await prisma.eventDefinition.update({
      where: { id: event.id },
      data: {
        firedAt: new Date(),
        firedCount: { increment: 1 },
      },
    });

    // Broadcast event fired
    broadcastToEpisode(episode.id, {
      type: 'event:fired',
      episodeId: episode.id,
      eventId: event.id,
      eventName: event.name,
      timestamp: new Date().toISOString(),
    });

    // Update stats
    broadcastStats(episode.id);

    res.json({
      success: true,
      data: {
        firedEvent,
        cardsAffected,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to detect patterns
function detectCardPatterns(grid: any[][]): any[] {
  const patterns: any[] = [];
  const size = grid.length;

  // Check rows
  for (let row = 0; row < size; row++) {
    if (grid[row].every((sq: any) => sq.marked)) {
      patterns.push({ type: 'row', index: row });
    }
  }

  // Check columns
  for (let col = 0; col < size; col++) {
    if (grid.every((row) => row[col].marked)) {
      patterns.push({ type: 'column', index: col });
    }
  }

  // Check diagonals
  let mainDiag = true;
  let antiDiag = true;
  for (let i = 0; i < size; i++) {
    if (!grid[i][i].marked) mainDiag = false;
    if (!grid[i][size - 1 - i].marked) antiDiag = false;
  }
  if (mainDiag) patterns.push({ type: 'diagonal', direction: 'main' });
  if (antiDiag) patterns.push({ type: 'diagonal', direction: 'anti' });

  // Check blackout
  if (grid.every((row) => row.every((sq: any) => sq.marked))) {
    patterns.push({ type: 'blackout' });
  }

  return patterns;
}

export { router as episodesRouter };
