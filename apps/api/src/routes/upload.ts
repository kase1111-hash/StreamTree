import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { authMiddleware, AuthenticatedRequest, requireStreamer } from '../middleware/auth.js';
import { sanitizeError } from '../utils/sanitize.js';
import {
  uploadFile,
  deleteFile,
  validateImage,
  isStorageConfigured,
} from '../services/storage.service.js';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
});

// Upload artwork for episode
router.post(
  '/artwork',
  requireStreamer,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      const { episodeId } = req.body;

      if (!file) {
        throw new AppError('No file uploaded', 400, 'NO_FILE');
      }

      if (!episodeId) {
        throw new AppError('Episode ID required', 400, 'MISSING_EPISODE_ID');
      }

      // Validate the image
      const validation = validateImage(file.buffer);
      if (!validation.valid) {
        throw new AppError(validation.error!, 400, 'INVALID_IMAGE');
      }

      // Verify episode ownership
      const episode = await prisma.episode.findUnique({
        where: { id: episodeId },
      });

      if (!episode) {
        throw new AppError('Episode not found', 404, 'NOT_FOUND');
      }

      if (episode.streamerId !== req.user!.id) {
        throw new AppError('Not authorized', 403, 'FORBIDDEN');
      }

      if (episode.status !== 'draft') {
        throw new AppError('Cannot change artwork after launch', 400, 'INVALID_STATUS');
      }

      // Delete old artwork if exists
      if (episode.artworkUrl && episode.artworkHash) {
        try {
          const oldKey = episode.artworkUrl.split('/').slice(-2).join('/');
          await deleteFile(oldKey);
        } catch (err) {
          console.error('Failed to delete old artwork:', sanitizeError(err));
        }
      }

      // Upload new artwork
      const result = await uploadFile(
        file.buffer,
        file.originalname,
        validation.mimeType!,
        `episodes/${episodeId}`
      );

      // Update episode
      await prisma.episode.update({
        where: { id: episodeId },
        data: {
          artworkUrl: result.url,
          artworkHash: result.hash,
        },
      });

      res.json({
        success: true,
        data: {
          url: result.url,
          hash: result.hash,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Upload avatar
// SECURITY: authMiddleware required to populate req.user and verify authentication
router.post(
  '/avatar',
  authMiddleware,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const file = req.file;

      if (!file) {
        throw new AppError('No file uploaded', 400, 'NO_FILE');
      }

      // Validate the image
      const validation = validateImage(file.buffer, 2 * 1024 * 1024); // 2MB for avatars
      if (!validation.valid) {
        throw new AppError(validation.error!, 400, 'INVALID_IMAGE');
      }

      // Get current user
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
      });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      // Delete old avatar if exists
      if (user.avatarUrl?.includes('avatars/')) {
        try {
          const oldKey = user.avatarUrl.split('/').slice(-2).join('/');
          await deleteFile(oldKey);
        } catch (err) {
          console.error('Failed to delete old avatar:', sanitizeError(err));
        }
      }

      // Upload new avatar
      const result = await uploadFile(
        file.buffer,
        file.originalname,
        validation.mimeType!,
        `avatars/${req.user!.id}`
      );

      // Update user
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { avatarUrl: result.url },
      });

      res.json({
        success: true,
        data: { url: result.url },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete artwork
router.delete(
  '/artwork/:episodeId',
  requireStreamer,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { episodeId } = req.params;

      const episode = await prisma.episode.findUnique({
        where: { id: episodeId },
      });

      if (!episode) {
        throw new AppError('Episode not found', 404, 'NOT_FOUND');
      }

      if (episode.streamerId !== req.user!.id) {
        throw new AppError('Not authorized', 403, 'FORBIDDEN');
      }

      if (episode.status !== 'draft') {
        throw new AppError('Cannot change artwork after launch', 400, 'INVALID_STATUS');
      }

      if (episode.artworkUrl) {
        try {
          const key = episode.artworkUrl.split('/').slice(-2).join('/');
          await deleteFile(key);
        } catch (err) {
          console.error('Failed to delete artwork:', sanitizeError(err));
        }
      }

      await prisma.episode.update({
        where: { id: episodeId },
        data: {
          artworkUrl: null,
          artworkHash: null,
        },
      });

      res.json({
        success: true,
        data: { message: 'Artwork deleted' },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Check storage status
router.get('/status', async (req, res) => {
  res.json({
    success: true,
    data: {
      storageConfigured: isStorageConfigured(),
      maxFileSize: '5MB',
      supportedFormats: ['JPEG', 'PNG', 'GIF', 'WebP'],
    },
  });
});

export { router as uploadRouter };
