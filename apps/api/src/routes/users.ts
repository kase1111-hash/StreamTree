import { Router } from 'express';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { isValidAddress } from '../services/blockchain.service.js';
import { validateSafeUrl } from '../utils/sanitize.js';

const router = Router();

// Get current user
router.get('/me', async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        walletAddress: true,
        isStreamer: true,
        createdAt: true,
        lastActiveAt: true,
        _count: {
          select: {
            cards: true,
            episodes: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: {
        ...user,
        cardsCount: user._count.cards,
        episodesCount: user._count.episodes,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update current user
router.patch('/me', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { displayName, avatarUrl } = req.body;
    const updateData: Record<string, unknown> = {};

    if (displayName !== undefined) {
      if (displayName.length > 100) {
        throw new AppError('Display name must be 100 characters or less', 400, 'VALIDATION_ERROR');
      }
      updateData.displayName = displayName.trim() || null;
    }

    if (avatarUrl !== undefined) {
      if (avatarUrl) {
        // SECURITY: Validate URL to prevent XSS via javascript: URLs, etc.
        const urlValidation = validateSafeUrl(avatarUrl, {
          allowHttp: process.env.NODE_ENV === 'development',
        });
        if (!urlValidation.valid) {
          throw new AppError(urlValidation.error!, 400, 'VALIDATION_ERROR');
        }
      }
      updateData.avatarUrl = avatarUrl || null;
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        walletAddress: true,
        isStreamer: true,
      },
    });

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// Get user stats
router.get('/me/stats', async (req: AuthenticatedRequest, res, next) => {
  try {
    const [cardsTotal, cardsFruited, patternsCompleted, episodesCreated, episodesLive] =
      await Promise.all([
        prisma.card.count({ where: { holderId: req.user!.id } }),
        prisma.card.count({ where: { holderId: req.user!.id, status: 'fruited' } }),
        prisma.card.findMany({
          where: { holderId: req.user!.id },
          select: { patterns: true },
        }),
        prisma.episode.count({ where: { streamerId: req.user!.id } }),
        prisma.episode.count({ where: { streamerId: req.user!.id, status: 'live' } }),
      ]);

    const totalPatterns = patternsCompleted.reduce((sum: number, card: { patterns: unknown }) => {
      return sum + (card.patterns as unknown[]).length;
    }, 0);

    res.json({
      success: true,
      data: {
        cardsTotal,
        cardsFruited,
        patternsCompleted: totalPatterns,
        episodesCreated,
        episodesLive,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Link wallet to user account
router.post('/me/wallet', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || typeof walletAddress !== 'string') {
      throw new AppError('Wallet address is required', 400, 'VALIDATION_ERROR');
    }

    if (!isValidAddress(walletAddress)) {
      throw new AppError('Invalid wallet address', 400, 'VALIDATION_ERROR');
    }

    // Check if wallet is already linked to another account
    const existingUser = await prisma.user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() },
    });

    if (existingUser && existingUser.id !== req.user!.id) {
      throw new AppError('Wallet already linked to another account', 400, 'WALLET_TAKEN');
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        walletAddress: walletAddress.toLowerCase(),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        walletAddress: true,
        isStreamer: true,
      },
    });

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// Get public user profile
router.get('/:username', async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isStreamer: true,
        createdAt: true,
        _count: {
          select: {
            cards: { where: { status: 'fruited' } },
            episodes: { where: { status: { in: ['ended', 'archived'] } } },
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isStreamer: user.isStreamer,
        memberSince: user.createdAt,
        collectiblesCount: user._count.cards,
        showsHosted: user._count.episodes,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as usersRouter };
