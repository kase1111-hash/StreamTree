import { Router } from 'express';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { AuthenticatedRequest, requireStreamer } from '../middleware/auth.js';

const router = Router();

// Default permissions by role
const ROLE_PERMISSIONS: Record<string, string[]> = {
  'co-host': ['fire_events', 'view_stats', 'manage_events'],
  moderator: ['fire_events', 'view_stats'],
};

// Get collaborators for an episode
router.get('/:episodeId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { episodeId } = req.params;

    // Check if user owns the episode or is a collaborator
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        collaborators: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    const isOwner = episode.streamerId === req.user!.id;
    const isCollaborator = episode.collaborators.some(
      (c) => c.userId === req.user!.id && c.status === 'accepted'
    );

    if (!isOwner && !isCollaborator) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    res.json({
      success: true,
      data: episode.collaborators.map((c) => ({
        id: c.id,
        user: c.user,
        role: c.role,
        permissions: c.permissions,
        status: c.status,
        revenueShare: c.revenueShare,
        invitedAt: c.invitedAt,
        acceptedAt: c.acceptedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Invite a collaborator
router.post('/:episodeId/invite', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { episodeId } = req.params;
    const { username, role = 'co-host', permissions, revenueShare = 0 } = req.body;

    // Verify episode ownership
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Only the episode owner can invite collaborators', 403, 'FORBIDDEN');
    }

    // Find user to invite
    const userToInvite = await prisma.user.findUnique({
      where: { username },
    });

    if (!userToInvite) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    if (!userToInvite.isStreamer) {
      throw new AppError('User must be a streamer to collaborate', 400, 'VALIDATION_ERROR');
    }

    if (userToInvite.id === req.user!.id) {
      throw new AppError('Cannot invite yourself', 400, 'VALIDATION_ERROR');
    }

    // Check if already invited
    const existingCollaborator = await prisma.episodeCollaborator.findUnique({
      where: {
        episodeId_userId: {
          episodeId,
          userId: userToInvite.id,
        },
      },
    });

    if (existingCollaborator) {
      if (existingCollaborator.status === 'removed' || existingCollaborator.status === 'declined') {
        // Re-invite
        const updated = await prisma.episodeCollaborator.update({
          where: { id: existingCollaborator.id },
          data: {
            status: 'pending',
            role,
            permissions: permissions || ROLE_PERMISSIONS[role] || [],
            revenueShare: Math.min(Math.max(revenueShare, 0), 50), // Max 50%
            invitedAt: new Date(),
            acceptedAt: null,
          },
          include: {
            user: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        });

        return res.json({
          success: true,
          data: updated,
        });
      }

      throw new AppError('User has already been invited', 400, 'ALREADY_INVITED');
    }

    // Create invitation
    const collaborator = await prisma.episodeCollaborator.create({
      data: {
        episodeId,
        userId: userToInvite.id,
        role,
        permissions: permissions || ROLE_PERMISSIONS[role] || [],
        revenueShare: Math.min(Math.max(revenueShare, 0), 50), // Max 50%
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: collaborator,
    });
  } catch (error) {
    next(error);
  }
});

// Get pending invitations for current user
router.get('/invitations/pending', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const invitations = await prisma.episodeCollaborator.findMany({
      where: {
        userId: req.user!.id,
        status: 'pending',
      },
      include: {
        episode: {
          select: {
            id: true,
            name: true,
            status: true,
            streamer: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { invitedAt: 'desc' },
    });

    res.json({
      success: true,
      data: invitations.map((inv) => ({
        id: inv.id,
        role: inv.role,
        permissions: inv.permissions,
        revenueShare: inv.revenueShare,
        invitedAt: inv.invitedAt,
        episode: inv.episode,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Accept an invitation
router.post('/invitations/:id/accept', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;

    const invitation = await prisma.episodeCollaborator.findUnique({
      where: { id },
      include: {
        episode: {
          select: { id: true, name: true },
        },
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found', 404, 'NOT_FOUND');
    }

    if (invitation.userId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (invitation.status !== 'pending') {
      throw new AppError('Invitation has already been processed', 400, 'ALREADY_PROCESSED');
    }

    const updated = await prisma.episodeCollaborator.update({
      where: { id },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
      },
      include: {
        episode: {
          select: { id: true, name: true },
        },
      },
    });

    res.json({
      success: true,
      data: updated,
      message: `You are now a collaborator on "${updated.episode.name}"`,
    });
  } catch (error) {
    next(error);
  }
});

// Decline an invitation
router.post('/invitations/:id/decline', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;

    const invitation = await prisma.episodeCollaborator.findUnique({
      where: { id },
    });

    if (!invitation) {
      throw new AppError('Invitation not found', 404, 'NOT_FOUND');
    }

    if (invitation.userId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (invitation.status !== 'pending') {
      throw new AppError('Invitation has already been processed', 400, 'ALREADY_PROCESSED');
    }

    await prisma.episodeCollaborator.update({
      where: { id },
      data: {
        status: 'declined',
      },
    });

    res.json({
      success: true,
      message: 'Invitation declined',
    });
  } catch (error) {
    next(error);
  }
});

// Update collaborator (permissions, role, revenue share)
router.patch('/:episodeId/:collaboratorId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { episodeId, collaboratorId } = req.params;
    const { role, permissions, revenueShare } = req.body;

    // Verify episode ownership
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Only the episode owner can update collaborators', 403, 'FORBIDDEN');
    }

    const collaborator = await prisma.episodeCollaborator.findUnique({
      where: { id: collaboratorId },
    });

    if (!collaborator || collaborator.episodeId !== episodeId) {
      throw new AppError('Collaborator not found', 404, 'NOT_FOUND');
    }

    const updateData: any = {};

    if (role !== undefined) {
      updateData.role = role;
      // Update permissions if role changed and no explicit permissions provided
      if (permissions === undefined) {
        updateData.permissions = ROLE_PERMISSIONS[role] || [];
      }
    }

    if (permissions !== undefined) {
      updateData.permissions = permissions;
    }

    if (revenueShare !== undefined) {
      updateData.revenueShare = Math.min(Math.max(revenueShare, 0), 50);
    }

    const updated = await prisma.episodeCollaborator.update({
      where: { id: collaboratorId },
      data: updateData,
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
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

// Remove a collaborator
router.delete('/:episodeId/:collaboratorId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { episodeId, collaboratorId } = req.params;

    // Verify episode ownership
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Only the episode owner can remove collaborators', 403, 'FORBIDDEN');
    }

    const collaborator = await prisma.episodeCollaborator.findUnique({
      where: { id: collaboratorId },
    });

    if (!collaborator || collaborator.episodeId !== episodeId) {
      throw new AppError('Collaborator not found', 404, 'NOT_FOUND');
    }

    await prisma.episodeCollaborator.update({
      where: { id: collaboratorId },
      data: {
        status: 'removed',
      },
    });

    res.json({
      success: true,
      message: 'Collaborator removed',
    });
  } catch (error) {
    next(error);
  }
});

// Leave as a collaborator
router.post('/:episodeId/leave', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { episodeId } = req.params;

    const collaborator = await prisma.episodeCollaborator.findUnique({
      where: {
        episodeId_userId: {
          episodeId,
          userId: req.user!.id,
        },
      },
    });

    if (!collaborator || collaborator.status !== 'accepted') {
      throw new AppError('You are not a collaborator on this episode', 404, 'NOT_FOUND');
    }

    await prisma.episodeCollaborator.update({
      where: { id: collaborator.id },
      data: {
        status: 'removed',
      },
    });

    res.json({
      success: true,
      message: 'You have left this episode',
    });
  } catch (error) {
    next(error);
  }
});

// Get episodes where user is a collaborator
router.get('/my/collaborating', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const collaborations = await prisma.episodeCollaborator.findMany({
      where: {
        userId: req.user!.id,
        status: 'accepted',
      },
      include: {
        episode: {
          include: {
            streamer: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { acceptedAt: 'desc' },
    });

    res.json({
      success: true,
      data: collaborations.map((c) => ({
        id: c.id,
        role: c.role,
        permissions: c.permissions,
        revenueShare: c.revenueShare,
        acceptedAt: c.acceptedAt,
        episode: {
          id: c.episode.id,
          name: c.episode.name,
          status: c.episode.status,
          cardsMinted: c.episode.cardsMinted,
          shareCode: c.episode.shareCode,
          streamer: c.episode.streamer,
        },
      })),
    });
  } catch (error) {
    next(error);
  }
});

export { router as collaboratorsRouter };
