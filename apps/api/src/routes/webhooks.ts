import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../db/client.js';
import { stripe, createRefund } from '../services/stripe.service.js';
import { generateCardGrid, detectPatterns } from '@streamtree/shared';
import { broadcastToEpisode, broadcastStats, sendToUser } from '../websocket/server.js';
import {
  verifyWebhookSignature,
  mapTwitchEventType,
  extractEventAmount,
  getEventDisplayInfo,
} from '../services/twitch.service.js';
import { sanitizeError } from '../utils/sanitize.js';

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

  // Generate card grid with full event definition mapping
  type EventDef = typeof episode.eventDefinitions[number];
  const grid = generateCardGrid(
    episode.eventDefinitions.map((e: EventDef) => ({
      id: e.id,
      episodeId: e.episodeId,
      name: e.name,
      icon: e.icon,
      description: e.description,
      triggerType: e.triggerType as 'manual' | 'twitch' | 'custom',
      triggerConfig: e.triggerConfig as Record<string, unknown> | null,
      firedAt: e.firedAt,
      firedCount: e.firedCount,
      createdAt: e.createdAt,
      order: e.sortOrder,
    })),
    episode.gridSize
  );

  // Mark any already-fired events on the new card
  const firedEventIds = episode.eventDefinitions
    .filter((e: EventDef) => e.firedAt !== null)
    .map((e: EventDef) => e.id);

  let markedCount = 0;
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (firedEventIds.includes(grid[row][col].eventId)) {
        grid[row][col].marked = true;
        grid[row][col].markedAt = new Date();
        markedCount++;
      }
    }
  }

  // Get next card number
  const cardNumber = episode.cardsMinted + 1;

  // Create the card
  const card = await prisma.card.create({
    data: {
      episodeId,
      holderId: userId,
      grid: grid as any,
      markedSquares: markedCount,
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

  // Mark pending payment as completed
  await prisma.pendingPayment.updateMany({
    where: {
      paymentIntentId: paymentIntent.id,
      status: 'pending',
    },
    data: { status: 'completed' },
  });

  // Notify the specific user that their card was minted
  sendToUser(userId, {
    type: 'card:minted',
    cardId: card.id,
    episodeId,
    holderId: userId,
    cardNumber,
  });

  // Broadcast to episode room
  broadcastToEpisode(episodeId, {
    type: 'card:minted',
    cardId: card.id,
    episodeId,
    cardNumber,
  });

  broadcastStats(episodeId);

  console.log('Paid card created successfully:', card.id, 'for user:', userId);
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const { episodeId, userId } = paymentIntent.metadata;
  console.log('Payment failed for episode:', episodeId, 'user:', userId);

  // Mark pending payment as failed
  await prisma.pendingPayment.updateMany({
    where: {
      paymentIntentId: paymentIntent.id,
      status: 'pending',
    },
    data: { status: 'failed' },
  });

  // Notify user
  if (userId) {
    sendToUser(userId, {
      type: 'error',
      message: 'Payment failed. Please try again.',
      code: 'PAYMENT_FAILED',
    });
  }
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

  // Verify signature (async - checks database for persisted secrets)
  const body = JSON.stringify(req.body);
  if (!await verifyWebhookSignature(messageId, timestamp, body, signature)) {
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
    const matchingEvents = episode.eventDefinitions.filter((eventDef: { id: string; triggerType: string; triggerConfig: unknown }) => {
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
    console.error('Error firing Twitch event:', sanitizeError(error));
  }
}

export { router as webhooksRouter };
