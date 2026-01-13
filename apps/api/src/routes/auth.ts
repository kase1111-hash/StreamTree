import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { generateShareCode } from '@streamtree/shared';

const router = Router();

// Generate JWT tokens
function generateTokens(user: { id: string; username: string; isStreamer: boolean }) {
  const secret = process.env.JWT_SECRET!;
  const expiresIn = process.env.JWT_EXPIRES_IN || '1h';

  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      isStreamer: user.isStreamer,
    },
    secret,
    { expiresIn }
  );

  const refreshToken = uuid();

  return { token, refreshToken };
}

// Custodial auth (simple username-based for MVP)
router.post('/custodial', async (req, res, next) => {
  try {
    const { username } = req.body;

    if (!username || username.length < 3) {
      throw new AppError('Username must be at least 3 characters', 400, 'VALIDATION_ERROR');
    }

    // Check if username is valid
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new AppError(
        'Username can only contain letters, numbers, underscores, and hyphens',
        400,
        'VALIDATION_ERROR'
      );
    }

    // Find or create user
    let user = await prisma.user.findFirst({
      where: {
        authProvider: 'custodial',
        username: username.toLowerCase(),
      },
    });

    if (!user) {
      // Create new user with custodial wallet
      user = await prisma.user.create({
        data: {
          username: username.toLowerCase(),
          displayName: username,
          authProvider: 'custodial',
          authProviderId: uuid(),
          custodialWalletId: uuid(),
          isStreamer: false,
        },
      });
    }

    const { token, refreshToken } = generateTokens(user);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          isStreamer: user.isStreamer,
        },
        token,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Wallet auth (for production)
router.post('/wallet', async (req, res, next) => {
  try {
    const { address, signature, message } = req.body;

    if (!address || !signature || !message) {
      throw new AppError('Address, signature, and message are required', 400, 'VALIDATION_ERROR');
    }

    // TODO: Verify signature in production
    // For MVP, we'll trust the address

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress: address.toLowerCase() },
    });

    if (!user) {
      // Generate unique username
      const shortAddress = address.slice(0, 8).toLowerCase();
      let username = shortAddress;
      let counter = 1;

      while (await prisma.user.findUnique({ where: { username } })) {
        username = `${shortAddress}${counter}`;
        counter++;
      }

      user = await prisma.user.create({
        data: {
          walletAddress: address.toLowerCase(),
          username,
          displayName: `${address.slice(0, 6)}...${address.slice(-4)}`,
          authProvider: 'wallet',
          authProviderId: address.toLowerCase(),
          isStreamer: false,
        },
      });
    }

    const { token, refreshToken } = generateTokens(user);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          walletAddress: user.walletAddress,
          isStreamer: user.isStreamer,
        },
        token,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token required', 400, 'VALIDATION_ERROR');
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new AppError('Invalid or expired refresh token', 401, 'INVALID_TOKEN');
    }

    const user = await prisma.user.findUnique({
      where: { id: storedToken.userId },
    });

    if (!user) {
      throw new AppError('User not found', 401, 'UNAUTHORIZED');
    }

    // Delete old refresh token
    await prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    // Generate new tokens
    const tokens = generateTokens(user);

    // Store new refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    res.json({ success: true, data: { message: 'Logged out' } });
  } catch (error) {
    next(error);
  }
});

// Become a streamer
router.post('/become-streamer', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new AppError('Authorization required', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };

    const user = await prisma.user.update({
      where: { id: decoded.userId },
      data: { isStreamer: true },
    });

    const tokens = generateTokens(user);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          isStreamer: user.isStreamer,
        },
        token: tokens.token,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as authRouter };
