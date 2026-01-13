/**
 * Twitch Integration Service
 * Handles OAuth, EventSub subscriptions, and chat monitoring
 */

import crypto from 'crypto';

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

// Store webhook secrets by subscription ID
const webhookSecrets = new Map<string, string>();

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
      console.error('Twitch token exchange failed:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Twitch token exchange error:', error);
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
      console.error('Twitch token refresh failed:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Twitch token refresh error:', error);
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
      console.error('Twitch get user failed:', await response.text());
      return null;
    }

    const data = await response.json();
    return data.data[0] || null;
  } catch (error) {
    console.error('Twitch get user error:', error);
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
      console.error('Twitch app token failed:', await response.text());
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Twitch app token error:', error);
    return null;
  }
}

/**
 * Create EventSub subscription
 */
export async function createEventSubSubscription(
  type: string,
  condition: Record<string, string>,
  version: string = '1'
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
      const errorText = await response.text();
      console.error('Twitch EventSub subscription failed:', errorText);
      return null;
    }

    const data = await response.json();
    const subscription = data.data[0];

    // Store secret for verification
    webhookSecrets.set(subscription.id, secret);

    return subscription;
  } catch (error) {
    console.error('Twitch EventSub subscription error:', error);
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
      webhookSecrets.delete(subscriptionId);
      return true;
    }

    console.error('Twitch EventSub delete failed:', await response.text());
    return false;
  } catch (error) {
    console.error('Twitch EventSub delete error:', error);
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
      console.error('Twitch EventSub list failed:', await response.text());
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Twitch EventSub list error:', error);
    return [];
  }
}

/**
 * Verify EventSub webhook signature
 *
 * SECURITY: This function verifies that webhook requests genuinely come from Twitch
 * by checking the HMAC signature against stored secrets.
 */
export function verifyWebhookSignature(
  messageId: string,
  timestamp: string,
  body: string,
  signature: string,
  subscriptionId?: string
): boolean {
  // Validate timestamp to prevent replay attacks (Twitch recommends 10 minute window)
  const messageTimestamp = new Date(timestamp).getTime();
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;

  if (isNaN(messageTimestamp) || Math.abs(now - messageTimestamp) > tenMinutes) {
    console.warn('Twitch webhook timestamp validation failed - possible replay attack');
    return false;
  }

  // Get secrets to verify against
  const secrets = subscriptionId
    ? [webhookSecrets.get(subscriptionId)]
    : Array.from(webhookSecrets.values());

  // Filter out undefined/null secrets
  const validSecrets = secrets.filter((s): s is string => !!s);

  // SECURITY: If no valid secrets exist, reject the request
  // This prevents forged webhooks when no subscriptions have been created
  if (validSecrets.length === 0) {
    console.warn('Twitch webhook verification failed - no valid secrets stored');
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
 */
export async function setupEpisodeSubscriptions(
  twitchUserId: string,
  episodeId: string
): Promise<{ type: string; subscriptionId: string }[]> {
  const subscriptions: { type: string; subscriptionId: string }[] = [];

  // Define the event types we want to subscribe to
  const eventTypes = [
    { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: twitchUserId, moderator_user_id: twitchUserId } },
    { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: twitchUserId } },
    { type: 'channel.subscription.gift', version: '1', condition: { broadcaster_user_id: twitchUserId } },
    { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: twitchUserId } },
    { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: twitchUserId } },
    { type: 'channel.channel_points_custom_reward_redemption.add', version: '1', condition: { broadcaster_user_id: twitchUserId } },
  ];

  for (const event of eventTypes) {
    const subscription = await createEventSubSubscription(
      event.type,
      event.condition,
      event.version
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
