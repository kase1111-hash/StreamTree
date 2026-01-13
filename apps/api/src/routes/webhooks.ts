import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../db/client.js';
import { stripe } from '../services/stripe.service.js';
import { generateCardGrid } from '@streamtree/shared';
import { broadcastToEpisode, broadcastStats } from '../websocket/server.js';

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
    console.error('Episode not live, cannot create card');
    return;
  }

  // Check max cards
  if (episode.maxCards && episode.cardsMinted >= episode.maxCards) {
    console.error('Episode sold out, cannot create card');
    // TODO: Refund the payment
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

export { router as webhooksRouter };
