import { Router } from 'express';
import { ethers } from 'ethers';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { isValidAddress } from '../services/blockchain.service.js';

// SECURITY: Message prefix for wallet linking (different from auth to prevent replay)
const WALLET_LINK_MESSAGE_PREFIX = 'Sign this message to link your wallet to StreamTree:';

/**
 * SECURITY: Verify wallet signature for wallet linking
 * Prevents attackers from claiming wallets they don't own
 * Returns true if the signature is valid, false otherwise
 */
function verifyWalletLinkSignature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    // Verify message format to prevent using auth signatures for linking
    if (!message.startsWith(WALLET_LINK_MESSAGE_PREFIX)) {
      console.warn('Invalid wallet link message format');
      return false;
    }

    // Extract and validate timestamp to prevent replay attacks
    const timestampMatch = message.match(/Timestamp: (\d+)/);
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1], 10);
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (Math.abs(now - timestamp) > fiveMinutes) {
        console.warn('Wallet link message timestamp expired');
        return false;
      }
    }

    // Recover the address from the signature
    const recoveredAddress = ethers.verifyMessage(message, signature);

    // SECURITY: Case-insensitive comparison to prevent case-based bypasses
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    console.error('Wallet link signature verification failed:', error);
    return false;
  }
}

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

    const totalPatterns = patternsCompleted.reduce((sum, card) => {
      return sum + (card.patterns as any[]).length;
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

// Get message to sign for wallet linking
// Returns a timestamped message that must be signed to link a wallet
router.get('/me/wallet/message', async (req: AuthenticatedRequest, res, next) => {
  try {
    const timestamp = Date.now();
    const message = `${WALLET_LINK_MESSAGE_PREFIX}\nAccount: ${req.user!.username}\nTimestamp: ${timestamp}`;

    res.json({
      success: true,
      data: { message },
    });
  } catch (error) {
    next(error);
  }
});

// Link wallet to user account
// SECURITY: Requires signature verification to prove wallet ownership
// This prevents attackers from claiming wallets they don't own (wallet hijacking)
router.post('/me/wallet', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { walletAddress, signature, message } = req.body;

    if (!walletAddress || typeof walletAddress !== 'string') {
      throw new AppError('Wallet address is required', 400, 'VALIDATION_ERROR');
    }

    // SECURITY: Require signature and message to prove wallet ownership
    if (!signature || !message) {
      throw new AppError(
        'Signature and message are required to verify wallet ownership',
        400,
        'VALIDATION_ERROR'
      );
    }

    if (!isValidAddress(walletAddress)) {
      throw new AppError('Invalid wallet address', 400, 'VALIDATION_ERROR');
    }

    // SECURITY: Verify the signature to prove the user owns this wallet
    // This prevents wallet hijacking where an attacker claims a victim's wallet
    if (!verifyWalletLinkSignature(message, signature, walletAddress)) {
      throw new AppError(
        'Invalid signature - wallet ownership verification failed',
        401,
        'INVALID_SIGNATURE'
      );
    }

    // SECURITY: Normalize wallet address to lowercase to prevent case-based duplicates
    const normalizedAddress = walletAddress.toLowerCase();

    // Check if wallet is already linked to another account
    const existingUser = await prisma.user.findUnique({
      where: { walletAddress: normalizedAddress },
    });

    if (existingUser && existingUser.id !== req.user!.id) {
      throw new AppError('Wallet already linked to another account', 400, 'WALLET_TAKEN');
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        walletAddress: normalizedAddress,
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
