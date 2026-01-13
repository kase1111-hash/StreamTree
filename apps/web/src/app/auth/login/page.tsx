'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { publicApi } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithWallet, user } = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  // Redirect if already logged in
  if (user) {
    router.push('/');
    return null;
  }

  const checkUsername = async (value: string) => {
    if (value.length < 3) {
      setAvailable(null);
      return;
    }

    setChecking(true);
    try {
      const result = await publicApi.checkUsername(value);
      setAvailable(result.available);
    } catch {
      setAvailable(null);
    }
    setChecking(false);
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setError('');

    // Debounce username check
    const timeoutId = setTimeout(() => checkUsername(value), 300);
    return () => clearTimeout(timeoutId);
  };

  const handleCustodialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(username);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    }

    setLoading(false);
  };

  const handleWalletLogin = async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      setError('No wallet detected. Please install MetaMask or another wallet.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const ethereum = (window as any).ethereum;
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];

      const message = `Sign in to StreamTree\n\nTimestamp: ${Date.now()}`;
      const signature = await ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      });

      await loginWithWallet(address, signature, message);
      router.push('/');
    } catch (err: any) {
      if (err.code === 4001) {
        setError('Wallet connection rejected');
      } else {
        setError(err.message || 'Failed to connect wallet');
      }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to StreamTree</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Sign in to create or join streaming bingo games
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg">
          {/* Wallet Login */}
          <button
            onClick={handleWalletLogin}
            disabled={loading}
            className="w-full mb-4 px-4 py-3 bg-accent-600 text-white rounded-lg font-semibold hover:bg-accent-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
            </svg>
            Connect Wallet
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-900 text-gray-500">
                or continue with username
              </span>
            </div>
          </div>

          {/* Username Login */}
          <form onSubmit={handleCustodialLogin}>
            <div className="mb-4">
              <label htmlFor="username" className="block text-sm font-medium mb-1">
                Username
              </label>
              <div className="relative">
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value.toLowerCase())}
                  placeholder="Enter a username"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800"
                  disabled={loading}
                />
                {checking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {!checking && available !== null && username.length >= 3 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {available ? (
                      <span className="text-green-500">✓</span>
                    ) : (
                      <span className="text-amber-500">Taken, will sign in</span>
                    )}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Letters, numbers, underscores, and hyphens only
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim() || username.length < 3}
              className="w-full px-4 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Signing in...' : 'Continue'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-gray-500">
            By signing in, you agree to our terms of service
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          Want to host your own games?{' '}
          <Link href="/auth/become-streamer" className="text-primary-600 hover:underline">
            Become a streamer
          </Link>
        </p>
      </div>
    </div>
  );
}
