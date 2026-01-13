import { Router } from 'express';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';

const router = Router();

// Get episode by share code (public)
router.get('/episode/:shareCode', async (req, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { shareCode: req.params.shareCode },
      include: {
        eventDefinitions: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            icon: true,
            description: true,
            firedAt: true,
          },
        },
        streamer: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: { cards: true },
        },
      },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    // Only return live or ended episodes publicly
    if (episode.status === 'draft') {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: {
        id: episode.id,
        name: episode.name,
        artworkUrl: episode.artworkUrl,
        cardPrice: episode.cardPrice,
        maxCards: episode.maxCards,
        gridSize: episode.gridSize,
        status: episode.status,
        launchedAt: episode.launchedAt,
        endedAt: episode.endedAt,
        cardsMinted: episode.cardsMinted,
        shareCode: episode.shareCode,
        events: episode.eventDefinitions,
        streamer: episode.streamer,
        isSoldOut: episode.maxCards ? episode.cardsMinted >= episode.maxCards : false,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get leaderboard for episode (public)
router.get('/episode/:shareCode/leaderboard', async (req, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { shareCode: req.params.shareCode },
    });

    if (!episode || episode.status === 'draft') {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    const leaderboard = await prisma.card.findMany({
      where: { episodeId: episode.id },
      orderBy: { markedSquares: 'desc' },
      take: 20,
      include: {
        holder: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    res.json({
      success: true,
      data: leaderboard.map((card, index) => ({
        rank: index + 1,
        cardId: card.id,
        username: card.holder.displayName || card.holder.username,
        markedSquares: card.markedSquares,
        patterns: (card.patterns as any[]).length,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Check if username is available
router.get('/username-available/:username', async (req, res, next) => {
  try {
    const { username } = req.params;

    if (!username || username.length < 3) {
      return res.json({ success: true, data: { available: false } });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.json({ success: true, data: { available: false } });
    }

    const existing = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    res.json({
      success: true,
      data: { available: !existing },
    });
  } catch (error) {
    next(error);
  }
});

export { router as publicRouter };
