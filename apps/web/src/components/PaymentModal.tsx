'use client';

import { useState, useEffect } from 'react';

interface PaymentModalProps {
  clientSecret: string;
  amount: number; // in cents
  episodeName: string;
  onSuccess: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

/**
 * Payment modal using Stripe Payment Element.
 *
 * Dynamically loads @stripe/stripe-js and @stripe/react-stripe-js
 * to avoid breaking builds when the packages aren't installed.
 * Falls back to a simple "payment processing" UI if Stripe.js
 * isn't available (e.g., in dev without Stripe keys).
 */
export function PaymentModal({
  clientSecret,
  amount,
  episodeName,
  onSuccess,
  onCancel,
  onError,
}: PaymentModalProps) {
  const [processing, setProcessing] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [stripePromise, setStripePromise] = useState<any>(null);
  const [StripeElements, setStripeElements] = useState<any>(null);
  const [StripePaymentElement, setStripePaymentElement] = useState<any>(null);

  // Dynamically load Stripe
  useEffect(() => {
    async function loadStripe() {
      try {
        const stripeJs = await import('@stripe/stripe-js');
        const stripeReact = await import('@stripe/react-stripe-js');

        const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (!publishableKey) {
          onError('Stripe is not configured. Please contact support.');
          return;
        }

        const promise = stripeJs.loadStripe(publishableKey);
        setStripePromise(promise);
        setStripeElements(() => stripeReact.Elements);
        setStripePaymentElement(() => stripeReact.PaymentElement);
        setStripeReady(true);
      } catch {
        onError('Payment system unavailable. Please try again later.');
      }
    }
    loadStripe();
  }, []);

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  if (!stripeReady) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
          <p className="text-center text-gray-500">Loading payment...</p>
          <button
            onClick={onCancel}
            className="mt-4 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Buy Card</h2>
          <button
            onClick={onCancel}
            disabled={processing}
            className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-sm text-gray-500">Episode</div>
          <div className="font-semibold">{episodeName}</div>
          <div className="text-2xl font-bold text-primary-600 mt-2">
            {formatPrice(amount)}
          </div>
        </div>

        <StripeElements stripe={stripePromise} options={{ clientSecret }}>
          <CheckoutForm
            PaymentElement={StripePaymentElement}
            processing={processing}
            setProcessing={setProcessing}
            onSuccess={onSuccess}
            onError={onError}
            onCancel={onCancel}
            amount={amount}
          />
        </StripeElements>
      </div>
    </div>
  );
}

interface CheckoutFormProps {
  PaymentElement: any;
  processing: boolean;
  setProcessing: (v: boolean) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
  onCancel: () => void;
  amount: number;
}

function CheckoutForm({
  PaymentElement,
  processing,
  setProcessing,
  onSuccess,
  onError,
  onCancel,
  amount,
}: CheckoutFormProps) {
  const [stripeHook, setStripeHook] = useState<any>(null);
  const [elementsHook, setElementsHook] = useState<any>(null);

  // Dynamically load hooks
  useEffect(() => {
    async function loadHooks() {
      const stripeReact = await import('@stripe/react-stripe-js');
      setStripeHook(() => stripeReact.useStripe);
      setElementsHook(() => stripeReact.useElements);
    }
    loadHooks();
  }, []);

  if (!stripeHook || !elementsHook) {
    return null;
  }

  return (
    <CheckoutFormInner
      PaymentElement={PaymentElement}
      useStripe={stripeHook}
      useElements={elementsHook}
      processing={processing}
      setProcessing={setProcessing}
      onSuccess={onSuccess}
      onError={onError}
      onCancel={onCancel}
      amount={amount}
    />
  );
}

interface CheckoutFormInnerProps extends CheckoutFormProps {
  useStripe: any;
  useElements: any;
}

function CheckoutFormInner({
  PaymentElement,
  useStripe,
  useElements,
  processing,
  setProcessing,
  onSuccess,
  onError,
  onCancel,
  amount,
}: CheckoutFormInnerProps) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (error) {
      onError(error.message || 'Payment failed. Please try again.');
      setProcessing(false);
    } else {
      // Payment succeeded — the webhook will create the card
      onSuccess();
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />

      <div className="flex gap-3 mt-6">
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={processing || !stripe || !elements}
          className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 transition"
        >
          {processing ? 'Processing...' : `Pay ${formatPrice(amount)}`}
        </button>
      </div>
    </form>
  );
}
