import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { ethers } from 'ethers';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { generateShareCode } from '@streamtree/shared';
import { sanitizeError } from '../utils/sanitize.js';

// SECURITY: Cookie configuration for HttpOnly tokens
const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_OPTIONS = {
  httpOnly: true,           // Prevents JavaScript access (XSS protection)
  secure: isProduction,     // HTTPS only in production
  sameSite: 'lax' as const, // CSRF protection
  path: '/',
};

const ACCESS_TOKEN_COOKIE = 'streamtree_access_token';
const REFRESH_TOKEN_COOKIE = 'streamtree_refresh_token';

// SECURITY: Session timeout configuration
// Absolute session timeout - user must re-authenticate after this period
// regardless of refresh token validity. Prevents indefinite session extension.
const ABSOLUTE_SESSION_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Parse JWT expiry string (e.g., '1h', '30m', '7d') to milliseconds
 */
function parseExpiryToMs(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 60 * 60 * 1000; // Default 1 hour
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 60 * 60 * 1000;
  }
}

// Parse JWT expiry once at startup
const JWT_EXPIRES_IN_RAW = process.env.JWT_EXPIRES_IN || '1h';
const JWT_EXPIRES_IN = JWT_EXPIRES_IN_RAW as jwt.SignOptions['expiresIn'];
const JWT_EXPIRY_MS = parseExpiryToMs(JWT_EXPIRES_IN_RAW);

/**
 * SECURITY: Set authentication cookies with HttpOnly flag
 * This prevents XSS attacks from stealing tokens via JavaScript
 */
function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  // Access token: expiry synced with JWT_EXPIRES_IN configuration
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: JWT_EXPIRY_MS,
  });

  // Refresh token: longer expiry (7 days)
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

/**
 * SECURITY: Clear authentication cookies on logout
 */
function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
  res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
}

// SECURITY: Validate JWT_SECRET at module load time (fail fast)
// This prevents the server from starting without proper configuration
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const errorMsg = 'FATAL: JWT_SECRET environment variable is not set. Authentication cannot work.';
    console.error(errorMsg);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(errorMsg);
    }
    // In development, use a warning but allow startup for testing
    console.warn('WARNING: Using insecure default for development only');
    return 'INSECURE_DEV_SECRET_DO_NOT_USE_IN_PRODUCTION';
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();

// Expected message format for wallet authentication
const AUTH_MESSAGE_PREFIX = 'Sign this message to authenticate with StreamTree:';

/**
 * Verify wallet signature using ethers.js
 * Returns the recovered address if valid, null otherwise
 */
function verifyWalletSignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    // Verify message format to prevent replay attacks
    if (!message.startsWith(AUTH_MESSAGE_PREFIX)) {
      console.warn('Invalid auth message format');
      return false;
    }

    // Extract and validate timestamp from message to prevent replay attacks
    const timestampMatch = message.match(/Timestamp: (\d+)/);
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1], 10);
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (Math.abs(now - timestamp) > fiveMinutes) {
        console.warn('Auth message timestamp expired');
        return false;
      }
    }

    // Recover the address from the signature
    const recoveredAddress = ethers.verifyMessage(message, signature);

    // Compare addresses (case-insensitive)
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    console.error('Wallet signature verification failed:', sanitizeError(error));
    return false;
  }
}

const router = Router();

// Generate JWT tokens
function generateTokens(user: { id: string; username: string; isStreamer: boolean }) {
  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      isStreamer: user.isStreamer,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
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

    // SECURITY: Set HttpOnly cookies for tokens
    setAuthCookies(res, token, refreshToken);

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
        // Still include tokens in response for backwards compatibility during migration
        // Frontend should prefer cookies but can fall back to these
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

    // Validate wallet address format
    if (!ethers.isAddress(address)) {
      throw new AppError('Invalid wallet address format', 400, 'VALIDATION_ERROR');
    }

    // Verify the signature - this proves the user owns the wallet
    if (!verifyWalletSignature(message, signature, address)) {
      throw new AppError('Invalid signature - wallet ownership verification failed', 401, 'INVALID_SIGNATURE');
    }

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

    // SECURITY: Set HttpOnly cookies for tokens
    setAuthCookies(res, token, refreshToken);

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
    // SECURITY: Read refresh token from cookie (preferred) or body (backwards compatibility)
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] || req.body.refreshToken;

    if (!refreshToken) {
      throw new AppError('Refresh token required', 400, 'VALIDATION_ERROR');
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      // Clear invalid cookies
      clearAuthCookies(res);
      throw new AppError('Invalid or expired refresh token', 401, 'INVALID_TOKEN');
    }

    // SECURITY: Check absolute session timeout
    // Prevents indefinite session extension via token refresh
    const sessionAge = Date.now() - storedToken.createdAt.getTime();
    if (sessionAge > ABSOLUTE_SESSION_TIMEOUT_MS) {
      // Session has exceeded absolute timeout, force re-authentication
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      clearAuthCookies(res);
      throw new AppError('Session expired. Please log in again.', 401, 'SESSION_EXPIRED');
    }

    const user = await prisma.user.findUnique({
      where: { id: storedToken.userId },
    });

    if (!user) {
      clearAuthCookies(res);
      throw new AppError('User not found', 401, 'UNAUTHORIZED');
    }

    // Delete old refresh token
    await prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    // Generate new tokens
    const tokens = generateTokens(user);

    // Store new refresh token - preserve original session creation time for absolute timeout
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        // SECURITY: Preserve original session start time to enforce absolute timeout
        createdAt: storedToken.createdAt,
      },
    });

    // SECURITY: Set new HttpOnly cookies
    setAuthCookies(res, tokens.token, tokens.refreshToken);

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
    // SECURITY: Read refresh token from cookie (preferred) or body
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] || req.body.refreshToken;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    // SECURITY: Clear HttpOnly cookies
    clearAuthCookies(res);

    res.json({ success: true, data: { message: 'Logged out' } });
  } catch (error) {
    next(error);
  }
});

// Get current user from cookie (for session validation)
router.get('/me', async (req, res, next) => {
  try {
    // Read token from cookie
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE];

    if (!token) {
      return res.json({ success: true, data: { user: null } });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isStreamer: true,
          walletAddress: true,
        },
      });

      if (!user) {
        clearAuthCookies(res);
        return res.json({ success: true, data: { user: null } });
      }

      res.json({ success: true, data: { user } });
    } catch (jwtError) {
      // Token expired or invalid - try refresh
      const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
      if (!refreshToken) {
        clearAuthCookies(res);
        return res.json({ success: true, data: { user: null } });
      }

      // Let the client know to refresh
      return res.json({ success: true, data: { user: null, needsRefresh: true } });
    }
  } catch (error) {
    next(error);
  }
});

// Become a streamer
router.post('/become-streamer', async (req, res, next) => {
  try {
    // Read token from cookie (preferred) or Authorization header
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
    const token = cookieToken || (authHeader ? authHeader.substring(7) : null);

    if (!token) {
      throw new AppError('Authorization required', 401, 'UNAUTHORIZED');
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    const user = await prisma.user.update({
      where: { id: decoded.userId },
      data: { isStreamer: true },
    });

    const tokens = generateTokens(user);

    // SECURITY: Update access token cookie with new isStreamer claim
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.token, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 1000, // 1 hour
    });

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
