import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/client.js';
import { AppError } from './error.js';

// SECURITY: Validate JWT_SECRET at module load time (fail fast)
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

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    isStreamer: boolean;
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      username: string;
      isStreamer: boolean;
    };

    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, username: true, isStreamer: true },
    });

    if (!user) {
      throw new AppError('User not found', 401, 'UNAUTHORIZED');
    }

    // Update last active
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid token', 401, 'INVALID_TOKEN'));
    }
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Token expired', 401, 'TOKEN_EXPIRED'));
    }
    next(error);
  }
}

export function requireStreamer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.isStreamer) {
    return next(new AppError('Streamer access required', 403, 'FORBIDDEN'));
  }
  next();
}
