import { Router } from 'express';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { AuthenticatedRequest, requireStreamer } from '../middleware/auth.js';

const router = Router();

// Template categories
const CATEGORIES = ['general', 'gaming', 'irl', 'music', 'sports', 'educational', 'charity'];

// Get public templates (browse)
router.get('/browse', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { category, search, sort = 'popular' } = req.query;

    const where: any = {
      isPublic: true,
    };

    if (category && CATEGORIES.includes(category as string)) {
      where.category = category;
    }

    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    let orderBy: any = { usageCount: 'desc' };
    if (sort === 'newest') {
      orderBy = { createdAt: 'desc' };
    } else if (sort === 'name') {
      orderBy = { name: 'asc' };
    }

    const templates = await prisma.template.findMany({
      where,
      orderBy,
      take: 50,
      include: {
        creator: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    res.json({
      success: true,
      data: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        gridSize: t.gridSize,
        eventCount: (t.events as any[]).length,
        usageCount: t.usageCount,
        createdAt: t.createdAt,
        creator: {
          id: t.creator.id,
          username: t.creator.username,
          displayName: t.creator.displayName,
        },
      })),
      categories: CATEGORIES,
    });
  } catch (error) {
    next(error);
  }
});

// Get user's templates
router.get('/my', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const templates = await prisma.template.findMany({
      where: { creatorId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    next(error);
  }
});

// Get single template
router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const template = await prisma.template.findUnique({
      where: { id: req.params.id },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    if (!template) {
      throw new AppError('Template not found', 404, 'NOT_FOUND');
    }

    // If not public, only creator can view
    if (!template.isPublic && template.creatorId !== req.user?.id) {
      throw new AppError('Template not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
});

// Create a template
router.post('/', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { name, description, category, events, gridSize, isPublic } = req.body;

    if (!name || typeof name !== 'string' || name.length < 3) {
      throw new AppError('Template name must be at least 3 characters', 400, 'VALIDATION_ERROR');
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      throw new AppError('Template must have at least one event', 400, 'VALIDATION_ERROR');
    }

    // Validate events
    for (const event of events) {
      if (!event.name || typeof event.name !== 'string') {
        throw new AppError('Each event must have a name', 400, 'VALIDATION_ERROR');
      }
    }

    const template = await prisma.template.create({
      data: {
        creatorId: req.user!.id,
        name,
        description: description || null,
        category: category && CATEGORIES.includes(category) ? category : 'general',
        events,
        gridSize: gridSize || 5,
        isPublic: isPublic || false,
      },
    });

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
});

// Update a template
router.patch('/:id', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const template = await prisma.template.findUnique({
      where: { id: req.params.id },
    });

    if (!template) {
      throw new AppError('Template not found', 404, 'NOT_FOUND');
    }

    if (template.creatorId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    const { name, description, category, events, gridSize, isPublic } = req.body;
    const updateData: any = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.length < 3) {
        throw new AppError('Template name must be at least 3 characters', 400, 'VALIDATION_ERROR');
      }
      updateData.name = name;
    }

    if (description !== undefined) {
      updateData.description = description || null;
    }

    if (category !== undefined && CATEGORIES.includes(category)) {
      updateData.category = category;
    }

    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) {
        throw new AppError('Template must have at least one event', 400, 'VALIDATION_ERROR');
      }
      updateData.events = events;
    }

    if (gridSize !== undefined) {
      updateData.gridSize = gridSize;
    }

    if (isPublic !== undefined) {
      updateData.isPublic = isPublic;
    }

    const updated = await prisma.template.update({
      where: { id: template.id },
      data: updateData,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// Delete a template
router.delete('/:id', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const template = await prisma.template.findUnique({
      where: { id: req.params.id },
    });

    if (!template) {
      throw new AppError('Template not found', 404, 'NOT_FOUND');
    }

    if (template.creatorId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    await prisma.template.delete({
      where: { id: template.id },
    });

    res.json({
      success: true,
      message: 'Template deleted',
    });
  } catch (error) {
    next(error);
  }
});

// Create episode from template
router.post('/:id/use', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { episodeName, cardPrice, maxCards } = req.body;

    const template = await prisma.template.findUnique({
      where: { id: req.params.id },
    });

    if (!template) {
      throw new AppError('Template not found', 404, 'NOT_FOUND');
    }

    // Check if template is public or belongs to user
    if (!template.isPublic && template.creatorId !== req.user!.id) {
      throw new AppError('Template not found', 404, 'NOT_FOUND');
    }

    // Generate share code
    const shareCode = generateShareCode();

    // Create episode with events from template
    const episode = await prisma.episode.create({
      data: {
        streamerId: req.user!.id,
        name: episodeName || template.name,
        gridSize: template.gridSize,
        cardPrice: cardPrice || 0,
        maxCards: maxCards || null,
        shareCode,
        eventDefinitions: {
          create: (template.events as any[]).map((event, index) => ({
            name: event.name,
            icon: event.icon || '🎯',
            description: event.description || null,
            triggerType: event.triggerType || 'manual',
            triggerConfig: event.triggerConfig || null,
            sortOrder: index,
          })),
        },
      },
      include: {
        eventDefinitions: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // Increment template usage
    await prisma.template.update({
      where: { id: template.id },
      data: {
        usageCount: { increment: 1 },
      },
    });

    res.status(201).json({
      success: true,
      data: episode,
    });
  } catch (error) {
    next(error);
  }
});

// Save episode as template
router.post('/from-episode/:episodeId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { name, description, category, isPublic } = req.body;

    const episode = await prisma.episode.findUnique({
      where: { id: req.params.episodeId },
      include: {
        eventDefinitions: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (!name || typeof name !== 'string' || name.length < 3) {
      throw new AppError('Template name must be at least 3 characters', 400, 'VALIDATION_ERROR');
    }

    // Convert events to template format
    const events = episode.eventDefinitions.map((e) => ({
      name: e.name,
      icon: e.icon,
      description: e.description,
      triggerType: e.triggerType,
      triggerConfig: e.triggerConfig,
    }));

    const template = await prisma.template.create({
      data: {
        creatorId: req.user!.id,
        name,
        description: description || null,
        category: category && CATEGORIES.includes(category) ? category : 'general',
        events,
        gridSize: episode.gridSize,
        isPublic: isPublic || false,
      },
    });

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
});

function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export { router as templatesRouter };
