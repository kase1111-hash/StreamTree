import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { AuthenticatedRequest, requireStreamer } from '../middleware/auth.js';
import { sanitizeError } from '../utils/sanitize.js';
import { withSerializableRetry } from '../utils/transaction.js';
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

    type WithdrawalInfo = { id: string; amount: number; netAmount: number; status: string };
    const episodeSummaries = episodes.map((ep: { id: string; name: string; status: string; totalRevenue: number; cardsMinted: number; endedAt: Date | null; withdrawals: WithdrawalInfo[] }) => {
      const withdrawn = ep.withdrawals
        .filter((w: WithdrawalInfo) => w.status === 'completed')
        .reduce((sum: number, w: WithdrawalInfo) => sum + w.netAmount, 0);

      const pending = ep.withdrawals
        .filter((w: WithdrawalInfo) => w.status === 'pending' || w.status === 'processing')
        .reduce((sum: number, w: WithdrawalInfo) => sum + w.netAmount, 0);

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

    // Pre-check: validate user Stripe setup (outside transaction — doesn't need serialization)
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

    // Atomically calculate availability and create withdrawal record
    // Uses SELECT ... FOR UPDATE to serialize concurrent withdrawal attempts
    const { withdrawal, available } = await withSerializableRetry<{ withdrawal: any; available: number }>(() =>
      prisma.$transaction(
        async (txRaw) => {
          // Cast to any — Prisma 5.9's TS types don't expose $queryRaw/models
          // on the interactive transaction client, but they are available at runtime
          const tx = txRaw as any;
          // Lock the episode row to prevent concurrent withdrawals
          const episodes: any[] = await tx.$queryRaw`
            SELECT * FROM episodes
            WHERE id = ${episodeId}
            AND streamer_id = ${req.user!.id}
            FOR UPDATE
          `;
          const ep = episodes[0];

          if (!ep) {
            // Could be not found or not owned by this user
            const exists = await tx.episode.findUnique({
              where: { id: episodeId },
              select: { id: true },
            });
            if (!exists) {
              throw new AppError('Episode not found', 404, 'NOT_FOUND');
            }
            throw new AppError('Not authorized', 403, 'FORBIDDEN');
          }

          if (ep.status !== 'ended') {
            throw new AppError('Episode must be ended before withdrawal', 400, 'INVALID_STATUS');
          }

          // Get withdrawals within the transaction (consistent snapshot)
          const withdrawals = await tx.withdrawal.findMany({
            where: { episodeId },
          });

          // Calculate available amount
          type WithdrawalRecord = { status: string; netAmount: number };
          const completedWithdrawals = withdrawals
            .filter((w: WithdrawalRecord) => w.status === 'completed')
            .reduce((sum: number, w: WithdrawalRecord) => sum + w.netAmount, 0);

          const pendingWithdrawals = withdrawals
            .filter((w: WithdrawalRecord) => w.status === 'pending' || w.status === 'processing')
            .reduce((sum: number, w: WithdrawalRecord) => sum + w.netAmount, 0);

          const netTotal = calculateStreamerPayout(ep.total_revenue);
          const available = netTotal - completedWithdrawals - pendingWithdrawals;

          if (available <= 0) {
            throw new AppError('No funds available for withdrawal', 400, 'NO_FUNDS');
          }

          // SECURITY: Calculate withdrawal amounts correctly
          const withdrawalGrossAmount = Math.round((available * 100) / (100 - PLATFORM_FEE_PERCENT));
          const withdrawalPlatformFee = withdrawalGrossAmount - available;

          // Create withdrawal record inside transaction (holds the row lock)
          const withdrawal = await tx.withdrawal.create({
            data: {
              streamerId: req.user!.id,
              episodeId,
              amount: withdrawalGrossAmount,
              platformFee: withdrawalPlatformFee,
              netAmount: available,
              status: 'processing',
            },
          });

          return { withdrawal, available };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000,
        }
      )
    );

    // Stripe transfer OUTSIDE transaction (don't hold DB lock during network call)
    try {
      const transferId = await createTransfer(
        available,
        user.stripeAccountId,
        episodeId,
        withdrawal.id
      );

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
      console.error('Stripe transfer failed:', err.message);

      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'failed',
          failedReason: err.message,
        },
      });

      // SECURITY: Don't expose raw Stripe error details to clients
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
      data: withdrawals.map((w: { id: string; episodeId: string; episode: { id: string; name: string }; amount: number; platformFee: number; netAmount: number; status: string; createdAt: Date; completedAt: Date | null }) => ({
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
