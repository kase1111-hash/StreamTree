import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not set - payment features disabled');
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    })
  : null;

export interface CreatePaymentIntentParams {
  amount: number; // in cents
  episodeId: string;
  userId: string;
  metadata?: Record<string, string>;
}

export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const { amount, episodeId, userId, metadata = {} } = params;

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    automatic_payment_methods: {
      enabled: true,
    },
    metadata: {
      episodeId,
      userId,
      type: 'card_mint',
      ...metadata,
    },
  });

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
  };
}

export async function confirmPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  return stripe.paymentIntents.retrieve(paymentIntentId);
}

export async function createConnectedAccount(
  email: string,
  userId: string
): Promise<{ accountId: string; onboardingUrl: string }> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  // Create a Stripe Connect Express account
  const account = await stripe.accounts.create({
    type: 'express',
    email,
    metadata: {
      userId,
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  // Create an account link for onboarding
  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.BASE_URL}/settings/payments?refresh=true`,
    return_url: `${process.env.BASE_URL}/settings/payments?success=true`,
    type: 'account_onboarding',
  });

  return {
    accountId: account.id,
    onboardingUrl: accountLink.url,
  };
}

export async function getAccountStatus(
  accountId: string
): Promise<{
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const account = await stripe.accounts.retrieve(accountId);

  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

export async function createTransfer(
  amount: number,
  destinationAccountId: string,
  episodeId: string
): Promise<string> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const transfer = await stripe.transfers.create({
    amount,
    currency: 'usd',
    destination: destinationAccountId,
    metadata: {
      episodeId,
    },
  });

  return transfer.id;
}

export async function getAccountBalance(
  accountId: string
): Promise<{ available: number; pending: number }> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const balance = await stripe.balance.retrieve({
    stripeAccount: accountId,
  });

  const available = balance.available.reduce(
    (sum, b) => sum + (b.currency === 'usd' ? b.amount : 0),
    0
  );
  const pending = balance.pending.reduce(
    (sum, b) => sum + (b.currency === 'usd' ? b.amount : 0),
    0
  );

  return { available, pending };
}

// Platform fee percentage (8%)
export const PLATFORM_FEE_PERCENT = parseInt(
  process.env.PLATFORM_FEE_PERCENT || '8',
  10
);

export function calculatePlatformFee(amount: number): number {
  return Math.round((amount * PLATFORM_FEE_PERCENT) / 100);
}

export function calculateStreamerPayout(amount: number): number {
  return amount - calculatePlatformFee(amount);
}
