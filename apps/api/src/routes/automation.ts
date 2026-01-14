import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { AuthenticatedRequest, requireStreamer } from '../middleware/auth.js';
import { broadcastToEpisode, sendToUser } from '../websocket/server.js';
import { sanitizeError } from '../utils/sanitize.js';

const router = Router();

// ============================================================================
// Custom Webhooks
// ============================================================================

// List webhooks for an episode
router.get('/webhooks/:episodeId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.episodeId },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    const webhooks = await prisma.customWebhook.findMany({
      where: { episodeId: episode.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: webhooks.map((w: { id: string; name: string; isActive: boolean; createdAt: Date; lastUsedAt: Date | null; usageCount: number }) => ({
        id: w.id,
        name: w.name,
        isActive: w.isActive,
        createdAt: w.createdAt,
        lastUsedAt: w.lastUsedAt,
        usageCount: w.usageCount,
        // Include webhook URL for display
        webhookUrl: `${process.env.BASE_URL}/api/webhooks/custom/${w.id}`,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Create a new webhook
router.post('/webhooks/:episodeId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      throw new AppError('Webhook name is required', 400, 'VALIDATION_ERROR');
    }

    const episode = await prisma.episode.findUnique({
      where: { id: req.params.episodeId },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    // Generate a secret for signature verification
    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await prisma.customWebhook.create({
      data: {
        episodeId: episode.id,
        name,
        secret,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: webhook.id,
        name: webhook.name,
        secret: webhook.secret, // Only returned once on creation
        webhookUrl: `${process.env.BASE_URL}/api/webhooks/custom/${webhook.id}`,
        isActive: webhook.isActive,
        createdAt: webhook.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Delete a webhook
router.delete('/webhooks/:webhookId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const webhook = await prisma.customWebhook.findUnique({
      where: { id: req.params.webhookId },
      include: { episode: true },
    });

    if (!webhook) {
      throw new AppError('Webhook not found', 404, 'NOT_FOUND');
    }

    if (webhook.episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    await prisma.customWebhook.delete({
      where: { id: webhook.id },
    });

    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    next(error);
  }
});

// Toggle webhook active status
router.patch('/webhooks/:webhookId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { isActive } = req.body;

    const webhook = await prisma.customWebhook.findUnique({
      where: { id: req.params.webhookId },
      include: { episode: true },
    });

    if (!webhook) {
      throw new AppError('Webhook not found', 404, 'NOT_FOUND');
    }

    if (webhook.episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    const updated = await prisma.customWebhook.update({
      where: { id: webhook.id },
      data: { isActive: isActive ?? !webhook.isActive },
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        isActive: updated.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Chat Keywords
// ============================================================================

// List keywords for an episode
router.get('/keywords/:episodeId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.episodeId },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    const keywords = await prisma.chatKeyword.findMany({
      where: { episodeId: episode.id },
      include: {
        eventDefinition: {
          select: { id: true, name: true, icon: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: keywords,
    });
  } catch (error) {
    next(error);
  }
});

// Create a chat keyword trigger
router.post('/keywords/:episodeId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { eventId, keyword, matchType, caseSensitive, cooldownSeconds } = req.body;

    if (!eventId || !keyword) {
      throw new AppError('eventId and keyword are required', 400, 'VALIDATION_ERROR');
    }

    const episode = await prisma.episode.findUnique({
      where: { id: req.params.episodeId },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    // Verify event belongs to this episode
    const eventDef = await prisma.eventDefinition.findFirst({
      where: { id: eventId, episodeId: episode.id },
    });

    if (!eventDef) {
      throw new AppError('Event not found in this episode', 404, 'NOT_FOUND');
    }

    const chatKeyword = await prisma.chatKeyword.create({
      data: {
        episodeId: episode.id,
        eventId,
        keyword,
        matchType: matchType || 'contains',
        caseSensitive: caseSensitive ?? false,
        cooldownSeconds: cooldownSeconds || 0,
      },
      include: {
        eventDefinition: {
          select: { id: true, name: true, icon: true },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: chatKeyword,
    });
  } catch (error) {
    next(error);
  }
});

// Update a chat keyword
router.patch('/keywords/:keywordId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { keyword, matchType, caseSensitive, cooldownSeconds, isActive } = req.body;

    const chatKeyword = await prisma.chatKeyword.findUnique({
      where: { id: req.params.keywordId },
      include: { episode: true },
    });

    if (!chatKeyword) {
      throw new AppError('Keyword not found', 404, 'NOT_FOUND');
    }

    if (chatKeyword.episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    const updated = await prisma.chatKeyword.update({
      where: { id: chatKeyword.id },
      data: {
        keyword: keyword ?? chatKeyword.keyword,
        matchType: matchType ?? chatKeyword.matchType,
        caseSensitive: caseSensitive ?? chatKeyword.caseSensitive,
        cooldownSeconds: cooldownSeconds ?? chatKeyword.cooldownSeconds,
        isActive: isActive ?? chatKeyword.isActive,
      },
      include: {
        eventDefinition: {
          select: { id: true, name: true, icon: true },
        },
      },
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// Delete a chat keyword
router.delete('/keywords/:keywordId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const chatKeyword = await prisma.chatKeyword.findUnique({
      where: { id: req.params.keywordId },
      include: { episode: true },
    });

    if (!chatKeyword) {
      throw new AppError('Keyword not found', 404, 'NOT_FOUND');
    }

    if (chatKeyword.episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    await prisma.chatKeyword.delete({
      where: { id: chatKeyword.id },
    });

    res.json({ success: true, message: 'Keyword deleted' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Chat Message Processing (called from Twitch IRC or custom bot)
// ============================================================================

// Process a chat message - this endpoint would be called by a Twitch bot
router.post('/chat/process', async (req: Request, res: Response, next) => {
  try {
    const { episodeId, message, username, secret } = req.body;

    if (!episodeId || !message) {
      throw new AppError('episodeId and message are required', 400, 'VALIDATION_ERROR');
    }

    // Verify secret matches a webhook for this episode (basic auth)
    const webhook = await prisma.customWebhook.findFirst({
      where: {
        episodeId,
        secret,
        isActive: true,
      },
    });

    if (!webhook) {
      throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
    }

    // Get active keywords for this episode
    const keywords = await prisma.chatKeyword.findMany({
      where: {
        episodeId,
        isActive: true,
      },
      include: {
        eventDefinition: true,
      },
    });

    const triggeredEvents: string[] = [];
    const now = new Date();

    for (const kw of keywords) {
      // Check cooldown
      if (kw.lastTriggeredAt && kw.cooldownSeconds > 0) {
        const elapsed = (now.getTime() - kw.lastTriggeredAt.getTime()) / 1000;
        if (elapsed < kw.cooldownSeconds) {
          continue;
        }
      }

      // Check if message matches keyword
      const matches = checkKeywordMatch(message, kw.keyword, kw.matchType, kw.caseSensitive);

      if (matches) {
        // Trigger the event
        await fireEventFromChat(episodeId, kw.eventId, {
          keyword: kw.keyword,
          message,
          username,
        });

        // Update last triggered
        await prisma.chatKeyword.update({
          where: { id: kw.id },
          data: { lastTriggeredAt: now },
        });

        triggeredEvents.push(kw.eventDefinition.name);
      }
    }

    // Update webhook usage
    await prisma.customWebhook.update({
      where: { id: webhook.id },
      data: {
        lastUsedAt: now,
        usageCount: { increment: 1 },
      },
    });

    res.json({
      success: true,
      data: {
        processed: true,
        triggeredEvents,
      },
    });
  } catch (error) {
    next(error);
  }
});

function checkKeywordMatch(
  message: string,
  keyword: string,
  matchType: string,
  caseSensitive: boolean
): boolean {
  const msg = caseSensitive ? message : message.toLowerCase();
  const kw = caseSensitive ? keyword : keyword.toLowerCase();

  switch (matchType) {
    case 'exact':
      return msg === kw;
    case 'contains':
      return msg.includes(kw);
    case 'startswith':
      return msg.startsWith(kw);
    case 'regex':
      try {
        const regex = new RegExp(keyword, caseSensitive ? '' : 'i');
        return regex.test(message);
      } catch {
        return false;
      }
    default:
      return msg.includes(kw);
  }
}

async function fireEventFromChat(
  episodeId: string,
  eventId: string,
  triggerData: { keyword: string; message: string; username?: string }
) {
  try {
    // Update event definition
    await prisma.eventDefinition.update({
      where: { id: eventId },
      data: {
        firedAt: new Date(),
        firedCount: { increment: 1 },
      },
    });

    // Get all cards for this episode
    const cards = await prisma.card.findMany({
      where: {
        episodeId,
        status: 'active',
      },
    });

    let cardsAffected = 0;

    for (const card of cards) {
      const grid = card.grid as any[][];
      let updated = false;

      // Mark squares that match this event
      for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
          if (grid[row][col].eventId === eventId && !grid[row][col].marked) {
            grid[row][col].marked = true;
            grid[row][col].markedAt = new Date();
            updated = true;
          }
        }
      }

      if (updated) {
        // Count marked squares
        let markedCount = 0;
        for (const row of grid) {
          for (const cell of row) {
            if (cell.marked) markedCount++;
          }
        }

        // Detect patterns
        const patterns = detectPatterns(grid);

        // Update card
        await prisma.card.update({
          where: { id: card.id },
          data: {
            grid,
            markedSquares: markedCount,
            patterns,
          },
        });

        cardsAffected++;

        // Notify card holder
        sendToUser(card.holderId, {
          type: 'card:updated',
          cardId: card.id,
          markedSquares: markedCount,
          patterns,
          triggeredBy: 'chat',
        });
      }
    }

    // Log fired event
    await prisma.firedEvent.create({
      data: {
        episodeId,
        eventDefinitionId: eventId,
        firedBy: 'chat',
        cardsAffected,
        triggerData,
      },
    });

    // Get event name for broadcast
    const eventDef = await prisma.eventDefinition.findUnique({
      where: { id: eventId },
    });

    // Broadcast to episode
    broadcastToEpisode(episodeId, {
      type: 'event:fired',
      episodeId,
      eventId,
      eventName: eventDef?.name || 'Chat Event',
      triggeredBy: 'chat',
      chatInfo: {
        keyword: triggerData.keyword,
        username: triggerData.username,
      },
      cardsAffected,
    });

    console.log(`Chat keyword triggered: ${triggerData.keyword} for episode ${episodeId}, affected ${cardsAffected} cards`);
  } catch (error) {
    console.error('Error firing chat event:', sanitizeError(error));
  }
}

// Simple pattern detection (duplicated for now)
function detectPatterns(grid: any[][]): any[] {
  const patterns: any[] = [];
  const size = grid.length;

  for (let row = 0; row < size; row++) {
    if (grid[row].every((sq: any) => sq.marked)) {
      patterns.push({ type: 'row', index: row });
    }
  }

  for (let col = 0; col < size; col++) {
    if (grid.every((row: any[]) => row[col].marked)) {
      patterns.push({ type: 'column', index: col });
    }
  }

  let mainDiagonal = true;
  for (let i = 0; i < size; i++) {
    if (!grid[i][i].marked) {
      mainDiagonal = false;
      break;
    }
  }
  if (mainDiagonal) {
    patterns.push({ type: 'diagonal', direction: 'main' });
  }

  let antiDiagonal = true;
  for (let i = 0; i < size; i++) {
    if (!grid[i][size - 1 - i].marked) {
      antiDiagonal = false;
      break;
    }
  }
  if (antiDiagonal) {
    patterns.push({ type: 'diagonal', direction: 'anti' });
  }

  if (grid.every((row: any[]) => row.every((sq: any) => sq.marked))) {
    patterns.push({ type: 'blackout' });
  }

  return patterns;
}

export { router as automationRouter };
