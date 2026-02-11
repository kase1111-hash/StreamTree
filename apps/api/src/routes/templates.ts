import { Router } from 'express';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { AuthenticatedRequest, requireStreamer } from '../middleware/auth.js';

const router = Router();

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
router.get('/:id', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const template = await prisma.template.findUnique({
      where: { id: req.params.id },
    });

    if (!template) {
      throw new AppError('Template not found', 404, 'NOT_FOUND');
    }

    if (template.creatorId !== req.user!.id) {
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
    const { name, description, events, gridSize } = req.body;

    if (!name || typeof name !== 'string' || name.length < 3) {
      throw new AppError('Template name must be at least 3 characters', 400, 'VALIDATION_ERROR');
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      throw new AppError('Template must have at least one event', 400, 'VALIDATION_ERROR');
    }

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
        events,
        gridSize: gridSize || 5,
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

    const { name, description, events, gridSize } = req.body;
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

    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) {
        throw new AppError('Template must have at least one event', 400, 'VALIDATION_ERROR');
      }
      updateData.events = events;
    }

    if (gridSize !== undefined) {
      updateData.gridSize = gridSize;
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

// Create episode from template (own templates only)
router.post('/:id/use', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { episodeName, cardPrice, maxCards } = req.body;

    const template = await prisma.template.findUnique({
      where: { id: req.params.id },
    });

    if (!template) {
      throw new AppError('Template not found', 404, 'NOT_FOUND');
    }

    if (template.creatorId !== req.user!.id) {
      throw new AppError('Template not found', 404, 'NOT_FOUND');
    }

    const shareCode = generateShareCode();

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
    const { name, description } = req.body;

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

    type EventDef = typeof episode.eventDefinitions[number];
    const events = episode.eventDefinitions.map((e: EventDef) => ({
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
        events,
        gridSize: episode.gridSize,
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
