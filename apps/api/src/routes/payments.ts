import { Router } from 'express';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { AuthenticatedRequest, requireStreamer } from '../middleware/auth.js';
import { sanitizeError } from '../utils/sanitize.js';
import {
  stripe,
  createConnectedAccount,
  getAccountStatus,
  createTransfer,
  calculatePlatformFee,
  calculateStreamerPayout,
  PLATFORM_FEE_PERCENT,
} from '../services/stripe.service.js';

const router = Router();

// Get payment settings for streamer
router.get('/settings', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        stripeAccountId: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    let accountStatus = null;

    if (user.stripeAccountId && stripe) {
      try {
        accountStatus = await getAccountStatus(user.stripeAccountId);
      } catch (err) {
        console.error('Failed to get Stripe account status:', sanitizeError(err));
      }
    }

    res.json({
      success: true,
      data: {
        hasStripeAccount: !!user.stripeAccountId,
        // SECURITY: stripeAccountId removed - internal implementation detail
        // that shouldn't be exposed to clients
        chargesEnabled: accountStatus?.chargesEnabled || user.stripeChargesEnabled,
        payoutsEnabled: accountStatus?.payoutsEnabled || user.stripePayoutsEnabled,
        detailsSubmitted: accountStatus?.detailsSubmitted || false,
        platformFeePercent: PLATFORM_FEE_PERCENT,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Start Stripe Connect onboarding
router.post('/connect', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!stripe) {
      throw new AppError('Stripe is not configured', 500, 'STRIPE_NOT_CONFIGURED');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    // Check if already has an account
    if (user.stripeAccountId) {
      // Create a new account link for existing account
      const accountLink = await stripe.accountLinks.create({
        account: user.stripeAccountId,
        refresh_url: `${process.env.BASE_URL}/settings/payments?refresh=true`,
        return_url: `${process.env.BASE_URL}/settings/payments?success=true`,
        type: 'account_onboarding',
      });

      return res.json({
        success: true,
        data: { onboardingUrl: accountLink.url },
      });
    }

    // Create new account
    const { accountId, onboardingUrl } = await createConnectedAccount(
      req.body.email || `${user.username}@streamtree.local`,
      user.id
    );

    // Save account ID
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeAccountId: accountId },
    });

    res.json({
      success: true,
      data: { onboardingUrl },
    });
  } catch (error) {
    next(error);
  }
});

// Get earnings summary for streamer
router.get('/earnings', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    // Get all episodes with revenue
    const episodes = await prisma.episode.findMany({
      where: {
        streamerId: req.user!.id,
        totalRevenue: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        status: true,
        totalRevenue: true,
        cardsMinted: true,
        endedAt: true,
        withdrawals: {
          select: {
            id: true,
            amount: true,
            netAmount: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate totals
    let totalEarnings = 0;
    let totalWithdrawn = 0;
    let pendingWithdrawals = 0;

    const episodeSummaries = episodes.map((ep) => {
      const withdrawn = ep.withdrawals
        .filter((w) => w.status === 'completed')
        .reduce((sum, w) => sum + w.netAmount, 0);

      const pending = ep.withdrawals
        .filter((w) => w.status === 'pending' || w.status === 'processing')
        .reduce((sum, w) => sum + w.netAmount, 0);

      const available = ep.status === 'ended'
        ? calculateStreamerPayout(ep.totalRevenue) - withdrawn - pending
        : 0;

      totalEarnings += calculateStreamerPayout(ep.totalRevenue);
      totalWithdrawn += withdrawn;
      pendingWithdrawals += pending;

      return {
        id: ep.id,
        name: ep.name,
        status: ep.status,
        cardsMinted: ep.cardsMinted,
        grossRevenue: ep.totalRevenue,
        netRevenue: calculateStreamerPayout(ep.totalRevenue),
        withdrawn,
        pending,
        available: Math.max(0, available),
        canWithdraw: ep.status === 'ended' && available > 0,
      };
    });

    res.json({
      success: true,
      data: {
        totalEarnings,
        totalWithdrawn,
        pendingWithdrawals,
        availableBalance: totalEarnings - totalWithdrawn - pendingWithdrawals,
        platformFeePercent: PLATFORM_FEE_PERCENT,
        episodes: episodeSummaries,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Request withdrawal for an episode
router.post('/withdraw/:episodeId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!stripe) {
      throw new AppError('Stripe is not configured', 500, 'STRIPE_NOT_CONFIGURED');
    }

    const { episodeId } = req.params;

    // Get user with Stripe info
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user?.stripeAccountId) {
      throw new AppError(
        'Please set up your payment account first',
        400,
        'NO_STRIPE_ACCOUNT'
      );
    }

    if (!user.stripePayoutsEnabled) {
      throw new AppError(
        'Please complete your payment account setup',
        400,
        'STRIPE_NOT_READY'
      );
    }

    // Get episode
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        withdrawals: true,
      },
    });

    if (!episode) {
      throw new AppError('Episode not found', 404, 'NOT_FOUND');
    }

    if (episode.streamerId !== req.user!.id) {
      throw new AppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (episode.status !== 'ended') {
      throw new AppError('Episode must be ended before withdrawal', 400, 'INVALID_STATUS');
    }

    // Calculate available amount
    const completedWithdrawals = episode.withdrawals
      .filter((w) => w.status === 'completed')
      .reduce((sum, w) => sum + w.netAmount, 0);

    const pendingWithdrawals = episode.withdrawals
      .filter((w) => w.status === 'pending' || w.status === 'processing')
      .reduce((sum, w) => sum + w.netAmount, 0);

    const grossAvailable = episode.totalRevenue;
    const platformFee = calculatePlatformFee(grossAvailable);
    const netTotal = calculateStreamerPayout(grossAvailable);
    const available = netTotal - completedWithdrawals - pendingWithdrawals;

    if (available <= 0) {
      throw new AppError('No funds available for withdrawal', 400, 'NO_FUNDS');
    }

    // Create withdrawal record
    const withdrawal = await prisma.withdrawal.create({
      data: {
        streamerId: req.user!.id,
        episodeId,
        amount: grossAvailable - completedWithdrawals - pendingWithdrawals,
        platformFee: calculatePlatformFee(grossAvailable - completedWithdrawals - pendingWithdrawals),
        netAmount: available,
        status: 'processing',
      },
    });

    try {
      // Create Stripe transfer
      const transferId = await createTransfer(
        available,
        user.stripeAccountId,
        episodeId
      );

      // Update withdrawal with transfer ID
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          stripeTransferId: transferId,
          status: 'completed',
          completedAt: new Date(),
        },
      });

      res.json({
        success: true,
        data: {
          withdrawalId: withdrawal.id,
          amount: available,
          status: 'completed',
        },
      });
    } catch (err: any) {
      // Log the actual error for debugging (server-side only)
      console.error('Stripe transfer failed:', err.message);

      // Update withdrawal as failed (store details for internal use)
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'failed',
          failedReason: err.message, // Stored for admin review, not exposed to client
        },
      });

      // SECURITY: Don't expose raw Stripe error details to clients
      // They may contain sensitive implementation details
      throw new AppError(
        'Transfer failed. Please try again or contact support if the problem persists.',
        500,
        'TRANSFER_FAILED'
      );
    }
  } catch (error) {
    next(error);
  }
});

// Get withdrawal history
router.get('/withdrawals', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const withdrawals = await prisma.withdrawal.findMany({
      where: { streamerId: req.user!.id },
      include: {
        episode: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: withdrawals.map((w) => ({
        id: w.id,
        episodeId: w.episodeId,
        episodeName: w.episode.name,
        amount: w.amount,
        platformFee: w.platformFee,
        netAmount: w.netAmount,
        status: w.status,
        createdAt: w.createdAt,
        completedAt: w.completedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export { router as paymentsRouter };
