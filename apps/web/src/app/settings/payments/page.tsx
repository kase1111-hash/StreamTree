'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { paymentsApi } from '@/lib/api';
import { clsx } from 'clsx';

interface PaymentSettings {
  hasStripeAccount: boolean;
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  platformFeePercent: number;
}

interface EarningsSummary {
  totalEarnings: number;
  totalWithdrawn: number;
  pendingWithdrawals: number;
  availableBalance: number;
  platformFeePercent: number;
  episodes: EpisodeEarning[];
}

interface EpisodeEarning {
  id: string;
  name: string;
  status: string;
  cardsMinted: number;
  grossRevenue: number;
  netRevenue: number;
  withdrawn: number;
  pending: number;
  available: number;
  canWithdraw: boolean;
}

export default function PaymentSettingsPage() {
  const searchParams = useSearchParams();
  const { user, token } = useAuth();
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (token) {
      loadData();
    }

    // Check for success/refresh params
    if (searchParams.get('success')) {
      setSuccess('Payment account connected successfully!');
      loadData();
    }
    if (searchParams.get('refresh')) {
      setError('Please complete your payment account setup');
    }
  }, [token, searchParams]);

  const loadData = async () => {
    if (!token) return;

    try {
      const [settingsData, earningsData] = await Promise.all([
        paymentsApi.getSettings(token),
        paymentsApi.getEarnings(token),
      ]);
      setSettings(settingsData);
      setEarnings(earningsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load payment settings');
    }
    setLoading(false);
  };

  const handleConnectStripe = async () => {
    if (!token) return;

    setConnecting(true);
    setError('');

    try {
      const { onboardingUrl } = await paymentsApi.connectStripe(
        user?.email || `${user?.username}@streamtree.app`,
        token
      );
      window.location.href = onboardingUrl;
    } catch (err: any) {
      setError(err.message || 'Failed to start Stripe setup');
      setConnecting(false);
    }
  };

  const handleWithdraw = async (episodeId: string) => {
    if (!token) return;

    setWithdrawing(episodeId);
    setError('');
    setSuccess('');

    try {
      const result = await paymentsApi.withdraw(episodeId, token);
      setSuccess(`Withdrawal of $${(result.amount / 100).toFixed(2)} initiated!`);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Withdrawal failed');
    }

    setWithdrawing(null);
  };

  if (!user?.isStreamer) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Streamer Access Required</h1>
          <Link
            href="/auth/become-streamer"
            className="px-6 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition"
          >
            Become a Streamer
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-8" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Payment Settings</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Manage your earnings and payment account
      </p>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg text-green-600">
          {success}
        </div>
      )}

      {/* Payment Account Status */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Payment Account</h2>

        {!settings?.hasStripeAccount ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-4">💳</div>
            <h3 className="text-lg font-medium mb-2">Connect Your Bank Account</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Set up Stripe to receive payments from your episodes.
              Platform fee: {settings?.platformFeePercent || 8}%
            </p>
            <button
              onClick={handleConnectStripe}
              disabled={connecting}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 transition"
            >
              {connecting ? 'Setting up...' : 'Connect with Stripe'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">Account Status</span>
              <span className={clsx(
                'px-2 py-1 rounded text-sm font-medium',
                settings.payoutsEnabled
                  ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                  : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
              )}>
                {settings.payoutsEnabled ? 'Active' : 'Setup Required'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">Can Receive Payments</span>
              <span>{settings.chargesEnabled ? '✅' : '❌'}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400">Can Withdraw</span>
              <span>{settings.payoutsEnabled ? '✅' : '❌'}</span>
            </div>

            {!settings.payoutsEnabled && (
              <button
                onClick={handleConnectStripe}
                disabled={connecting}
                className="w-full px-4 py-2 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-950 transition"
              >
                {connecting ? 'Loading...' : 'Complete Setup'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Earnings Summary */}
      {earnings && (
        <>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Earnings Summary</h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">
                  ${(earnings.totalEarnings / 100).toFixed(2)}
                </div>
                <div className="text-sm text-gray-500">Total Earned</div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary-600">
                  ${(earnings.availableBalance / 100).toFixed(2)}
                </div>
                <div className="text-sm text-gray-500">Available</div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                <div className="text-2xl font-bold text-gray-600">
                  ${(earnings.totalWithdrawn / 100).toFixed(2)}
                </div>
                <div className="text-sm text-gray-500">Withdrawn</div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  ${(earnings.pendingWithdrawals / 100).toFixed(2)}
                </div>
                <div className="text-sm text-gray-500">Pending</div>
              </div>
            </div>

            <p className="text-sm text-gray-500 text-center">
              Platform fee: {earnings.platformFeePercent}% · Net earnings shown
            </p>
          </div>

          {/* Episodes with earnings */}
          {earnings.episodes.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Episode Earnings</h2>

              <div className="space-y-4">
                {earnings.episodes.map((ep) => (
                  <div
                    key={ep.id}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-medium">{ep.name}</h3>
                        <p className="text-sm text-gray-500">
                          {ep.cardsMinted} cards · ${(ep.grossRevenue / 100).toFixed(2)} gross
                        </p>
                      </div>
                      <span className={clsx(
                        'px-2 py-1 text-xs rounded',
                        ep.status === 'ended'
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                          : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                      )}>
                        {ep.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                      <div>
                        <div className="text-gray-500">Net</div>
                        <div className="font-medium">${(ep.netRevenue / 100).toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Withdrawn</div>
                        <div className="font-medium">${(ep.withdrawn / 100).toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Available</div>
                        <div className="font-medium text-green-600">
                          ${(ep.available / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {ep.canWithdraw && settings?.payoutsEnabled && (
                      <button
                        onClick={() => handleWithdraw(ep.id)}
                        disabled={withdrawing === ep.id}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                      >
                        {withdrawing === ep.id ? 'Processing...' : `Withdraw $${(ep.available / 100).toFixed(2)}`}
                      </button>
                    )}

                    {ep.canWithdraw && !settings?.payoutsEnabled && (
                      <p className="text-sm text-yellow-600 text-center">
                        Complete payment setup to withdraw
                      </p>
                    )}

                    {!ep.canWithdraw && ep.status !== 'ended' && (
                      <p className="text-sm text-gray-500 text-center">
                        End episode to withdraw earnings
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-8 text-center">
        <Link href="/episodes" className="text-primary-600 hover:underline">
          ← Back to Episodes
        </Link>
      </div>
    </div>
  );
}
