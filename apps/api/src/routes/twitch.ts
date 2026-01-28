import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../db/client.js';
import { AppError } from '../middleware/error.js';
import { AuthenticatedRequest, requireStreamer } from '../middleware/auth.js';
import {
  isTwitchConfigured,
  getAuthorizationUrl,
  exchangeCode,
  getUser,
  setupEpisodeSubscriptions,
  cleanupEpisodeSubscriptions,
} from '../services/twitch.service.js';

const router = Router();

// SECURITY: Whitelist of allowed redirect URL paths to prevent open redirect attacks
const ALLOWED_REDIRECT_PATHS = [
  '/settings',
  '/settings/payments',
  '/dashboard',
  '/create',
];

/**
 * Validates and sanitizes a redirect URL to prevent open redirect attacks
 * Only allows relative paths from the whitelist or the default
 */
function validateRedirectUrl(redirectUrl: string | undefined): string {
  const defaultUrl = '/settings?twitch=connected';

  if (!redirectUrl) {
    return defaultUrl;
  }

  // Only allow relative paths (prevent open redirect to external sites)
  try {
    // Check if it's an absolute URL (has protocol)
    if (redirectUrl.includes('://') || redirectUrl.startsWith('//')) {
      console.warn(`OAuth redirect blocked: absolute URL not allowed: ${redirectUrl}`);
      return defaultUrl;
    }

    // Must start with /
    if (!redirectUrl.startsWith('/')) {
      console.warn(`OAuth redirect blocked: must start with /: ${redirectUrl}`);
      return defaultUrl;
    }

    // Extract the path without query params
    const path = redirectUrl.split('?')[0];

    // Check against whitelist
    const isAllowed = ALLOWED_REDIRECT_PATHS.some(
      (allowed) => path === allowed || path.startsWith(allowed + '/')
    );

    if (!isAllowed) {
      console.warn(`OAuth redirect blocked: path not in whitelist: ${path}`);
      return defaultUrl;
    }

    return redirectUrl;
  } catch {
    return defaultUrl;
  }
}

// In-memory state storage (use Redis in production)
const oauthStates = new Map<string, { userId: string; redirectUrl?: string; expiresAt: number }>();

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (data.expiresAt < now) {
      oauthStates.delete(state);
    }
  }
}, 60000);

// Check if Twitch is configured
router.get('/status', requireStreamer, async (req: AuthenticatedRequest, res) => {
  const configured = isTwitchConfigured();

  if (!configured) {
    return res.json({
      success: true,
      data: {
        configured: false,
        connected: false,
      },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { twitchId: true, twitchAccessToken: true },
  });

  res.json({
    success: true,
    data: {
      configured: true,
      connected: !!(user?.twitchId && user?.twitchAccessToken),
      twitchId: user?.twitchId,
    },
  });
});

// Start OAuth flow
router.get('/connect', requireStreamer, async (req: AuthenticatedRequest, res) => {
  if (!isTwitchConfigured()) {
    throw new AppError('Twitch integration not configured', 501, 'NOT_CONFIGURED');
  }

  // Generate state for CSRF protection
  const state = crypto.randomBytes(32).toString('hex');
  const redirectUrl = req.query.redirect as string | undefined;

  oauthStates.set(state, {
    userId: req.user!.id,
    redirectUrl,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });

  const authUrl = getAuthorizationUrl(state);

  res.json({
    success: true,
    data: { authUrl },
  });
});

// OAuth callback
router.get('/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      throw new AppError(`Twitch authorization failed: ${error}`, 400, 'OAUTH_ERROR');
    }

    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      throw new AppError('Missing code or state parameter', 400, 'INVALID_REQUEST');
    }

    // Verify state
    const stateData = oauthStates.get(state);
    if (!stateData || stateData.expiresAt < Date.now()) {
      throw new AppError('Invalid or expired state', 400, 'INVALID_STATE');
    }
    oauthStates.delete(state);

    // Exchange code for tokens
    const tokens = await exchangeCode(code);
    if (!tokens) {
      throw new AppError('Failed to exchange code for tokens', 500, 'TOKEN_EXCHANGE_FAILED');
    }

    // Get Twitch user info
    const twitchUser = await getUser(tokens.access_token);
    if (!twitchUser) {
      throw new AppError('Failed to get Twitch user info', 500, 'USER_INFO_FAILED');
    }

    // Update user with Twitch info
    await prisma.user.update({
      where: { id: stateData.userId },
      data: {
        twitchId: twitchUser.id,
        twitchAccessToken: tokens.access_token,
      },
    });

    // SECURITY: Validate redirect URL to prevent open redirect attacks
    const safeRedirectUrl = validateRedirectUrl(stateData.redirectUrl);
    res.redirect(safeRedirectUrl);
  } catch (error) {
    next(error);
  }
});

// Disconnect Twitch
router.post('/disconnect', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        twitchId: null,
        twitchAccessToken: null,
      },
    });

    res.json({
      success: true,
      message: 'Twitch account disconnected',
    });
  } catch (error) {
    next(error);
  }
});

// Setup Twitch event subscriptions for an episode
router.post('/subscribe/:episodeId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!isTwitchConfigured()) {
      throw new AppError('Twitch integration not configured', 501, 'NOT_CONFIGURED');
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

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { twitchId: true, twitchAccessToken: true },
    });

    if (!user?.twitchId || !user?.twitchAccessToken) {
      throw new AppError('Twitch account not connected', 400, 'NOT_CONNECTED');
    }

    // Setup EventSub subscriptions
    const subscriptions = await setupEpisodeSubscriptions(user.twitchId, episode.id);

    res.json({
      success: true,
      data: {
        subscriptions,
        message: `Set up ${subscriptions.length} Twitch event subscriptions`,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Cleanup Twitch event subscriptions for an episode
router.post('/unsubscribe/:episodeId', requireStreamer, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { subscriptionIds } = req.body;

    if (!Array.isArray(subscriptionIds)) {
      throw new AppError('subscriptionIds array required', 400, 'VALIDATION_ERROR');
    }

    await cleanupEpisodeSubscriptions(subscriptionIds);

    res.json({
      success: true,
      message: 'Twitch subscriptions cleaned up',
    });
  } catch (error) {
    next(error);
  }
});

export { router as twitchRouter };
