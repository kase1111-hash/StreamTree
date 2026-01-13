import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import Stripe from 'stripe';
import { prisma } from '../db/client.js';
import { stripe, createRefund } from '../services/stripe.service.js';
import { generateCardGrid } from '@streamtree/shared';
import { broadcastToEpisode, broadcastStats, sendToUser } from '../websocket/server.js';
import {
  verifyWebhookSignature,
  mapTwitchEventType,
  extractEventAmount,
  getEventDisplayInfo,
} from '../services/twitch.service.js';

const router = Router();

// Stripe webhook handler
router.post(
  '/stripe',
  async (req: Request, res: Response) => {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return res.status(400).json({ error: 'Missing signature or webhook secret' });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'account.updated':
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }
);

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const { episodeId, userId, type } = paymentIntent.metadata;

  if (type !== 'card_mint') {
    console.log('Payment not for card mint, skipping');
    return;
  }

  // Check if card already exists (idempotency)
  const existingCard = await prisma.card.findFirst({
    where: { paymentId: paymentIntent.id },
  });

  if (existingCard) {
    console.log('Card already created for this payment');
    return;
  }

  // Get episode
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { eventDefinitions: true },
  });

  if (!episode) {
    console.error('Episode not found for payment:', episodeId);
    return;
  }

  if (episode.status !== 'live') {
    console.error('Episode not live, cannot create card. Initiating refund...');

    try {
      const refundResult = await createRefund(paymentIntent.id, 'requested_by_customer');
      console.log(`Refund initiated for non-live episode. Refund ID: ${refundResult.refundId}, Status: ${refundResult.status}`);

      sendToUser(userId, {
        type: 'payment:refunded',
        reason: 'episode_not_live',
        message: 'This episode is no longer accepting cards. Your payment has been refunded.',
        refundId: refundResult.refundId,
        episodeId,
      });
    } catch (refundError) {
      console.error('Failed to refund non-live episode payment:', refundError);
      console.error(`MANUAL_REFUND_REQUIRED: PaymentIntent ${paymentIntent.id} for episode ${episodeId} needs manual refund`);
    }

    return;
  }

  // Check max cards - if sold out, refund the payment
  if (episode.maxCards && episode.cardsMinted >= episode.maxCards) {
    console.error('Episode sold out, cannot create card. Initiating refund...');

    try {
      const refundResult = await createRefund(paymentIntent.id, 'episode_sold_out');
      console.log(`Refund initiated for sold-out episode. Refund ID: ${refundResult.refundId}, Status: ${refundResult.status}`);

      // Notify the user about the refund
      sendToUser(userId, {
        type: 'payment:refunded',
        reason: 'episode_sold_out',
        message: 'This episode is sold out. Your payment has been refunded.',
        refundId: refundResult.refundId,
        episodeId,
      });
    } catch (refundError) {
      console.error('Failed to refund sold-out episode payment:', refundError);
      // Log for manual intervention
      console.error(`MANUAL_REFUND_REQUIRED: PaymentIntent ${paymentIntent.id} for episode ${episodeId} needs manual refund`);
    }

    return;
  }

  // Generate card grid
  const grid = generateCardGrid(
    episode.eventDefinitions.map((e) => ({
      id: e.id,
      name: e.name,
      icon: e.icon,
    })),
    episode.gridSize
  );

  // Get next card number
  const cardNumber = episode.cardsMinted + 1;

  // Create the card
  const card = await prisma.card.create({
    data: {
      episodeId,
      holderId: userId,
      grid,
      paymentId: paymentIntent.id,
      pricePaid: paymentIntent.amount,
      cardNumber,
    },
  });

  // Update episode stats
  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      cardsMinted: { increment: 1 },
      totalRevenue: { increment: paymentIntent.amount },
    },
  });

  // Broadcast updates
  broadcastToEpisode(episodeId, {
    type: 'card:minted',
    cardId: card.id,
    episodeId,
    cardNumber,
  });

  broadcastStats(episodeId);

  console.log('Card created successfully:', card.id);
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const { episodeId, userId } = paymentIntent.metadata;
  console.log('Payment failed for episode:', episodeId, 'user:', userId);
  // Could notify the user here
}

async function handleAccountUpdated(account: Stripe.Account) {
  const { userId } = account.metadata || {};

  if (!userId) {
    return;
  }

  // Update user's Stripe account status
  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeAccountId: account.id,
      stripeChargesEnabled: account.charges_enabled,
      stripePayoutsEnabled: account.payouts_enabled,
    },
  });

  console.log('Updated Stripe status for user:', userId);
}

// Twitch EventSub webhook handler
router.post('/twitch', async (req: Request, res: Response) => {
  const messageId = req.headers['twitch-eventsub-message-id'] as string;
  const timestamp = req.headers['twitch-eventsub-message-timestamp'] as string;
  const signature = req.headers['twitch-eventsub-message-signature'] as string;
  const messageType = req.headers['twitch-eventsub-message-type'] as string;

  // Verify signature
  const body = JSON.stringify(req.body);
  if (!verifyWebhookSignature(messageId, timestamp, body, signature)) {
    console.error('Twitch webhook signature verification failed');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  // Handle verification challenge
  if (messageType === 'webhook_callback_verification') {
    console.log('Twitch webhook verification challenge');
    return res.status(200).send(req.body.challenge);
  }

  // Handle revocation
  if (messageType === 'revocation') {
    console.log('Twitch subscription revoked:', req.body.subscription.type);
    return res.status(200).json({ received: true });
  }

  // Handle notification
  if (messageType === 'notification') {
    await handleTwitchNotification(req.body);
  }

  res.status(200).json({ received: true });
});

async function handleTwitchNotification(payload: any) {
  const { subscription, event } = payload;
  const eventType = subscription.type;
  const broadcasterUserId = subscription.condition.broadcaster_user_id ||
                             subscription.condition.to_broadcaster_user_id;

  console.log('Twitch event received:', eventType, 'for broadcaster:', broadcasterUserId);

  // Find active episodes for this broadcaster
  const episodes = await prisma.episode.findMany({
    where: {
      status: 'live',
      streamer: {
        twitchId: broadcasterUserId,
      },
    },
    include: {
      eventDefinitions: true,
      streamer: { select: { id: true } },
    },
  });

  if (episodes.length === 0) {
    console.log('No active episodes for broadcaster:', broadcasterUserId);
    return;
  }

  // Map Twitch event to our event type
  const streamTreeEventType = mapTwitchEventType(eventType);
  const eventAmount = extractEventAmount(eventType, event);
  const displayInfo = getEventDisplayInfo(eventType, event);

  // Fire events on all matching episodes
  for (const episode of episodes) {
    // Find matching event definitions
    const matchingEvents = episode.eventDefinitions.filter((eventDef) => {
      if (eventDef.triggerType !== 'twitch') return false;

      const config = eventDef.triggerConfig as any;
      if (!config) return false;

      // Check event type match
      if (config.twitchEvent !== streamTreeEventType) return false;

      // Check threshold if set
      if (config.threshold && eventAmount < config.threshold) return false;

      return true;
    });

    // Fire each matching event
    for (const eventDef of matchingEvents) {
      await fireEventFromTwitch(episode.id, eventDef.id, event, displayInfo);
    }
  }
}

async function fireEventFromTwitch(
  episodeId: string,
  eventId: string,
  twitchEvent: any,
  displayInfo: { title: string; description: string }
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

    // Get all cards for this episode that have this event
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
          triggeredBy: 'twitch',
        });
      }
    }

    // Log fired event
    await prisma.firedEvent.create({
      data: {
        episodeId,
        eventDefinitionId: eventId,
        firedBy: 'twitch',
        cardsAffected,
        triggerData: twitchEvent,
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
      eventName: eventDef?.name || displayInfo.title,
      triggeredBy: 'twitch',
      twitchInfo: displayInfo,
      cardsAffected,
    });

    console.log(`Twitch event fired: ${displayInfo.title} for episode ${episodeId}, affected ${cardsAffected} cards`);
  } catch (error) {
    console.error('Error firing Twitch event:', error);
  }
}

// Simple pattern detection (duplicated from shared for now)
function detectPatterns(grid: any[][]): any[] {
  const patterns: any[] = [];
  const size = grid.length;

  // Check rows
  for (let row = 0; row < size; row++) {
    if (grid[row].every((sq: any) => sq.marked)) {
      patterns.push({ type: 'row', index: row });
    }
  }

  // Check columns
  for (let col = 0; col < size; col++) {
    if (grid.every((row: any[]) => row[col].marked)) {
      patterns.push({ type: 'column', index: col });
    }
  }

  // Check main diagonal
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

  // Check anti-diagonal
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

  // Check blackout
  if (grid.every((row: any[]) => row.every((sq: any) => sq.marked))) {
    patterns.push({ type: 'blackout' });
  }

  return patterns;
}

// Custom webhook handler for external integrations
router.post('/custom/:webhookId', async (req: Request, res: Response) => {
  const { webhookId } = req.params;
  const signature = req.headers['x-streamtree-signature'] as string;

  // Find the webhook
  const webhook = await prisma.customWebhook.findUnique({
    where: { id: webhookId },
    include: {
      episode: {
        include: {
          eventDefinitions: true,
        },
      },
    },
  });

  if (!webhook || !webhook.isActive) {
    return res.status(404).json({ error: 'Webhook not found or inactive' });
  }

  // Verify signature if provided
  if (signature) {
    const body = JSON.stringify(req.body);
    const expectedSignature =
      'sha256=' +
      crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');

    if (signature !== expectedSignature) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  // Check if episode is live
  if (webhook.episode.status !== 'live') {
    return res.status(400).json({ error: 'Episode is not live' });
  }

  const { eventName, eventId } = req.body;

  // Find matching event
  let targetEvent = webhook.episode.eventDefinitions.find((e) => e.id === eventId);

  if (!targetEvent && eventName) {
    targetEvent = webhook.episode.eventDefinitions.find(
      (e) => e.name.toLowerCase() === eventName.toLowerCase()
    );
  }

  if (!targetEvent) {
    return res.status(400).json({
      error: 'Event not found. Provide eventId or eventName.',
    });
  }

  // Fire the event
  try {
    await fireEventFromCustomWebhook(webhook.episode.id, targetEvent.id, req.body);

    // Update webhook usage
    await prisma.customWebhook.update({
      where: { id: webhook.id },
      data: {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 },
      },
    });

    res.json({
      success: true,
      message: `Event "${targetEvent.name}" fired successfully`,
    });
  } catch (error) {
    console.error('Custom webhook error:', error);
    res.status(500).json({ error: 'Failed to fire event' });
  }
});

async function fireEventFromCustomWebhook(
  episodeId: string,
  eventId: string,
  webhookData: any
) {
  await prisma.eventDefinition.update({
    where: { id: eventId },
    data: {
      firedAt: new Date(),
      firedCount: { increment: 1 },
    },
  });

  const cards = await prisma.card.findMany({
    where: { episodeId, status: 'active' },
  });

  let cardsAffected = 0;

  for (const card of cards) {
    const grid = card.grid as any[][];
    let updated = false;

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
      let markedCount = 0;
      for (const row of grid) {
        for (const cell of row) {
          if (cell.marked) markedCount++;
        }
      }

      const patterns = detectPatterns(grid);

      await prisma.card.update({
        where: { id: card.id },
        data: { grid, markedSquares: markedCount, patterns },
      });

      cardsAffected++;

      sendToUser(card.holderId, {
        type: 'card:updated',
        cardId: card.id,
        markedSquares: markedCount,
        patterns,
        triggeredBy: 'webhook',
      });
    }
  }

  await prisma.firedEvent.create({
    data: {
      episodeId,
      eventDefinitionId: eventId,
      firedBy: 'webhook',
      cardsAffected,
      triggerData: webhookData,
    },
  });

  const eventDef = await prisma.eventDefinition.findUnique({
    where: { id: eventId },
  });

  broadcastToEpisode(episodeId, {
    type: 'event:fired',
    episodeId,
    eventId,
    eventName: eventDef?.name || 'Webhook Event',
    triggeredBy: 'webhook',
    cardsAffected,
  });

  console.log(`Custom webhook fired event ${eventId} for episode ${episodeId}, affected ${cardsAffected} cards`);
}

export { router as webhooksRouter };
