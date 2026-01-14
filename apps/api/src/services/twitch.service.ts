/**
 * Twitch Integration Service
 * Handles OAuth, EventSub subscriptions, and chat monitoring
 */

import crypto from 'crypto';
import { prisma } from '../db/client.js';
import { sanitizeError } from '../utils/sanitize.js';

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || '';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
const TWITCH_REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'http://localhost:3000/auth/callback/twitch';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// Twitch API endpoints
const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2';
const TWITCH_API_URL = 'https://api.twitch.tv/helix';

interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
  broadcaster_type: string;
}

interface EventSubSubscription {
  id: string;
  type: string;
  version: string;
  status: string;
  condition: Record<string, string>;
  created_at: string;
}

// In-memory cache for webhook secrets (loaded from database)
// This cache is used for performance - secrets are persisted in the database
// and survive server restarts
const webhookSecretsCache = new Map<string, string>();
let secretsCacheInitialized = false;

/**
 * Initialize the webhook secrets cache from database
 * Called on server startup to load persisted secrets
 */
export async function initializeWebhookSecretsCache(): Promise<void> {
  try {
    const subscriptions = await prisma.twitchSubscription.findMany({
      where: { status: 'enabled' },
      select: { subscriptionId: true, secret: true },
    });

    webhookSecretsCache.clear();
    for (const sub of subscriptions) {
      webhookSecretsCache.set(sub.subscriptionId, sub.secret);
    }

    secretsCacheInitialized = true;
    console.log(`Loaded ${subscriptions.length} Twitch webhook secrets from database`);
  } catch (error) {
    console.error('Failed to initialize webhook secrets cache:', sanitizeError(error));
  }
}

/**
 * Get webhook secret, checking cache first then database
 */
async function getWebhookSecret(subscriptionId: string): Promise<string | null> {
  // Check cache first
  const cached = webhookSecretsCache.get(subscriptionId);
  if (cached) return cached;

  // Fall back to database
  try {
    const subscription = await prisma.twitchSubscription.findUnique({
      where: { subscriptionId },
      select: { secret: true },
    });

    if (subscription?.secret) {
      // Update cache
      webhookSecretsCache.set(subscriptionId, subscription.secret);
      return subscription.secret;
    }
  } catch (error) {
    console.error('Failed to fetch webhook secret from database:', sanitizeError(error));
  }

  return null;
}

/**
 * Get all webhook secrets from database
 */
async function getAllWebhookSecrets(): Promise<string[]> {
  // If cache is initialized and has values, use it
  if (secretsCacheInitialized && webhookSecretsCache.size > 0) {
    return Array.from(webhookSecretsCache.values());
  }

  // Otherwise fetch from database
  try {
    const subscriptions = await prisma.twitchSubscription.findMany({
      where: { status: 'enabled' },
      select: { subscriptionId: true, secret: true },
    });

    // Update cache while we're at it
    for (const sub of subscriptions) {
      webhookSecretsCache.set(sub.subscriptionId, sub.secret);
    }
    secretsCacheInitialized = true;

    return subscriptions.map((s: { subscriptionId: string; secret: string }) => s.secret);
  } catch (error) {
    console.error('Failed to fetch webhook secrets from database:', sanitizeError(error));
    return [];
  }
}

/**
 * Check if Twitch is configured
 */
export function isTwitchConfigured(): boolean {
  return !!(TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET);
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthorizationUrl(state: string): string {
  const scopes = [
    'user:read:email',
    'channel:read:subscriptions',
    'bits:read',
    'channel:read:redemptions',
    'moderator:read:followers',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: TWITCH_REDIRECT_URI,
    response_type: 'code',
    scope: scopes,
    state,
  });

  return `${TWITCH_AUTH_URL}/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCode(code: string): Promise<TwitchTokenResponse | null> {
  try {
    const response = await fetch(`${TWITCH_AUTH_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: TWITCH_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      // SECURITY: Don't log response body - may contain sensitive error details
      console.error('Twitch token exchange failed: HTTP', response.status);
      return null;
    }

    return await response.json() as TwitchTokenResponse;
  } catch (error) {
    console.error('Twitch token exchange error:', sanitizeError(error));
    return null;
  }
}

/**
 * Refresh access token
 */
export async function refreshToken(refreshToken: string): Promise<TwitchTokenResponse | null> {
  try {
    const response = await fetch(`${TWITCH_AUTH_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      // SECURITY: Don't log response body - may contain sensitive error details
      console.error('Twitch token refresh failed: HTTP', response.status);
      return null;
    }

    return await response.json() as TwitchTokenResponse;
  } catch (error) {
    console.error('Twitch token refresh error:', sanitizeError(error));
    return null;
  }
}

/**
 * Get user info from access token
 */
export async function getUser(accessToken: string): Promise<TwitchUser | null> {
  try {
    const response = await fetch(`${TWITCH_API_URL}/users`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Client-Id': TWITCH_CLIENT_ID,
      },
    });

    if (!response.ok) {
      // SECURITY: Don't log response body - may contain sensitive error details
      console.error('Twitch get user failed: HTTP', response.status);
      return null;
    }

    const data = await response.json() as { data: TwitchUser[] };
    return data.data[0] || null;
  } catch (error) {
    console.error('Twitch get user error:', sanitizeError(error));
    return null;
  }
}

/**
 * Get app access token for EventSub
 */
async function getAppAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${TWITCH_AUTH_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      // SECURITY: Don't log response body - may contain sensitive error details
      console.error('Twitch app token failed: HTTP', response.status);
      return null;
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  } catch (error) {
    console.error('Twitch app token error:', sanitizeError(error));
    return null;
  }
}

/**
 * Create EventSub subscription
 * @param episodeId - Optional episode ID to associate and persist the subscription
 */
export async function createEventSubSubscription(
  type: string,
  condition: Record<string, string>,
  version: string = '1',
  episodeId?: string
): Promise<EventSubSubscription | null> {
  const appToken = await getAppAccessToken();
  if (!appToken) return null;

  const secret = crypto.randomBytes(32).toString('hex');

  try {
    const response = await fetch(`${TWITCH_API_URL}/eventsub/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'Client-Id': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        version,
        condition,
        transport: {
          method: 'webhook',
          callback: `${BASE_URL}/api/webhooks/twitch`,
          secret,
        },
      }),
    });

    if (!response.ok) {
      // SECURITY: Don't log response body - may contain sensitive error details
      console.error('Twitch EventSub subscription failed: HTTP', response.status);
      return null;
    }

    const data = await response.json() as { data: EventSubSubscription[] };
    const subscription = data.data[0];

    // Store secret in database for persistence across server restarts
    if (episodeId) {
      try {
        await prisma.twitchSubscription.create({
          data: {
            episodeId,
            subscriptionId: subscription.id,
            type,
            status: 'enabled',
            secret, // Persisted in database
          },
        });
      } catch (dbError) {
        console.error('Failed to store Twitch subscription in database:', sanitizeError(dbError));
        // Continue - the subscription was created on Twitch's side
      }
    }

    // Also cache in memory for quick access
    webhookSecretsCache.set(subscription.id, secret);

    return subscription;
  } catch (error) {
    console.error('Twitch EventSub subscription error:', sanitizeError(error));
    return null;
  }
}

/**
 * Delete EventSub subscription
 */
export async function deleteEventSubSubscription(subscriptionId: string): Promise<boolean> {
  const appToken = await getAppAccessToken();
  if (!appToken) return false;

  try {
    const response = await fetch(
      `${TWITCH_API_URL}/eventsub/subscriptions?id=${subscriptionId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'Client-Id': TWITCH_CLIENT_ID,
        },
      }
    );

    if (response.ok) {
      // Remove from cache
      webhookSecretsCache.delete(subscriptionId);

      // Remove from database
      try {
        await prisma.twitchSubscription.delete({
          where: { subscriptionId },
        });
      } catch (dbError) {
        // May not exist in database (legacy subscriptions)
        console.warn('Could not delete subscription from database:', sanitizeError(dbError));
      }

      return true;
    }

    // SECURITY: Don't log response body - may contain sensitive error details
    console.error('Twitch EventSub delete failed: HTTP', response.status);
    return false;
  } catch (error) {
    console.error('Twitch EventSub delete error:', sanitizeError(error));
    return false;
  }
}

/**
 * List active EventSub subscriptions
 */
export async function listEventSubSubscriptions(): Promise<EventSubSubscription[]> {
  const appToken = await getAppAccessToken();
  if (!appToken) return [];

  try {
    const response = await fetch(`${TWITCH_API_URL}/eventsub/subscriptions`, {
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'Client-Id': TWITCH_CLIENT_ID,
      },
    });

    if (!response.ok) {
      // SECURITY: Don't log response body - may contain sensitive error details
      console.error('Twitch EventSub list failed: HTTP', response.status);
      return [];
    }

    const data = await response.json() as { data: EventSubSubscription[] };
    return data.data || [];
  } catch (error) {
    console.error('Twitch EventSub list error:', sanitizeError(error));
    return [];
  }
}

/**
 * Verify EventSub webhook signature
 *
 * SECURITY: This function verifies that webhook requests genuinely come from Twitch
 * by checking the HMAC signature against secrets stored in the database.
 * Secrets are cached in memory for performance but persisted in DB for reliability.
 */
export async function verifyWebhookSignature(
  messageId: string,
  timestamp: string,
  body: string,
  signature: string,
  subscriptionId?: string
): Promise<boolean> {
  // Validate timestamp to prevent replay attacks (Twitch recommends 10 minute window)
  const messageTimestamp = new Date(timestamp).getTime();
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;

  if (isNaN(messageTimestamp) || Math.abs(now - messageTimestamp) > tenMinutes) {
    console.warn('Twitch webhook timestamp validation failed - possible replay attack');
    return false;
  }

  // Get secrets to verify against (from cache or database)
  let validSecrets: string[] = [];

  if (subscriptionId) {
    // Try to get specific secret
    const secret = await getWebhookSecret(subscriptionId);
    if (secret) {
      validSecrets = [secret];
    }
  } else {
    // Get all secrets (for verification challenge before we know the subscription ID)
    validSecrets = await getAllWebhookSecrets();
  }

  // SECURITY: If no valid secrets exist, reject the request
  // This prevents forged webhooks when no subscriptions have been created
  if (validSecrets.length === 0) {
    console.warn('Twitch webhook verification failed - no valid secrets stored in database');
    return false;
  }

  // Try to verify against each stored secret
  for (const secret of validSecrets) {
    const message = messageId + timestamp + body;
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    try {
      if (
        signature.length === expectedSignature.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
      ) {
        return true;
      }
    } catch {
      // timingSafeEqual throws if buffer lengths don't match, continue to next secret
      continue;
    }
  }

  console.warn('Twitch webhook signature verification failed - no matching secret found');
  return false;
}

/**
 * Setup EventSub subscriptions for an episode
 * Subscriptions are stored in the database for persistence across server restarts
 */
export async function setupEpisodeSubscriptions(
  twitchUserId: string,
  episodeId: string
): Promise<{ type: string; subscriptionId: string }[]> {
  const subscriptions: { type: string; subscriptionId: string }[] = [];

  // Define the event types we want to subscribe to
  const eventTypes: Array<{ type: string; version: string; condition: Record<string, string> }> = [
    { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: twitchUserId, moderator_user_id: twitchUserId } },
    { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: twitchUserId } },
    { type: 'channel.subscription.gift', version: '1', condition: { broadcaster_user_id: twitchUserId } },
    { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: twitchUserId } },
    { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: twitchUserId } },
    { type: 'channel.channel_points_custom_reward_redemption.add', version: '1', condition: { broadcaster_user_id: twitchUserId } },
  ];

  for (const event of eventTypes) {
    // Pass episodeId to persist subscription secrets in database
    const subscription = await createEventSubSubscription(
      event.type,
      event.condition,
      event.version,
      episodeId
    );

    if (subscription) {
      subscriptions.push({
        type: event.type,
        subscriptionId: subscription.id,
      });
    }
  }

  return subscriptions;
}

/**
 * Cleanup EventSub subscriptions for an episode
 */
export async function cleanupEpisodeSubscriptions(
  subscriptionIds: string[]
): Promise<void> {
  for (const id of subscriptionIds) {
    await deleteEventSubSubscription(id);
  }
}

/**
 * Map Twitch event to StreamTree event type
 */
export function mapTwitchEventType(twitchEventType: string): string {
  const mapping: Record<string, string> = {
    'channel.follow': 'follow',
    'channel.subscribe': 'subscription',
    'channel.subscription.gift': 'gift_sub',
    'channel.cheer': 'cheer',
    'channel.raid': 'raid',
    'channel.channel_points_custom_reward_redemption.add': 'redemption',
  };

  return mapping[twitchEventType] || 'unknown';
}

/**
 * Extract amount from Twitch event for threshold checking
 */
export function extractEventAmount(eventType: string, eventData: any): number {
  switch (eventType) {
    case 'channel.cheer':
      return eventData.bits || 0;
    case 'channel.subscription.gift':
      return eventData.total || 1;
    case 'channel.raid':
      return eventData.viewers || 0;
    default:
      return 1;
  }
}

/**
 * Get event display name for Twitch event
 */
export function getEventDisplayInfo(eventType: string, eventData: any): { title: string; description: string } {
  switch (eventType) {
    case 'channel.follow':
      return {
        title: 'New Follower',
        description: `${eventData.user_name} followed!`,
      };
    case 'channel.subscribe':
      return {
        title: 'New Subscriber',
        description: `${eventData.user_name} subscribed!`,
      };
    case 'channel.subscription.gift':
      return {
        title: 'Gift Subs',
        description: `${eventData.user_name} gifted ${eventData.total} subs!`,
      };
    case 'channel.cheer':
      return {
        title: 'Cheer',
        description: `${eventData.user_name} cheered ${eventData.bits} bits!`,
      };
    case 'channel.raid':
      return {
        title: 'Raid',
        description: `${eventData.from_broadcaster_user_name} raided with ${eventData.viewers} viewers!`,
      };
    case 'channel.channel_points_custom_reward_redemption.add':
      return {
        title: 'Reward Redeemed',
        description: `${eventData.user_name} redeemed ${eventData.reward.title}!`,
      };
    default:
      return {
        title: 'Event',
        description: 'Twitch event occurred',
      };
  }
}
