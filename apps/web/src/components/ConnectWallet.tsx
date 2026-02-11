'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

interface ConnectWalletProps {
  onConnect?: (address: string) => void;
  className?: string;
  showBalance?: boolean;
}

export function ConnectWallet({
  onConnect,
  className = '',
  showBalance = false,
}: ConnectWalletProps) {
  const { address, isConnected } = useAccount();
  const { user, linkWallet } = useAuth();
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const [isLinking, setIsLinking] = useState(false);

  // When wallet connects, notify parent
  useEffect(() => {
    if (isConnected && address && onConnect) {
      onConnect(address);
    }
  }, [isConnected, address, onConnect]);

  // Show confirmation prompt when wallet is connected but not linked
  useEffect(() => {
    if (isConnected && address && user && !user.walletAddress) {
      setShowLinkPrompt(true);
    } else {
      setShowLinkPrompt(false);
    }
  }, [isConnected, address, user]);

  const handleLinkWallet = useCallback(async () => {
    if (!address) return;
    setIsLinking(true);
    try {
      await linkWallet(address);
      setShowLinkPrompt(false);
    } catch (error) {
      console.error('Failed to link wallet:', error);
    } finally {
      setIsLinking(false);
    }
  }, [address, linkWallet]);

  return (
    <div className={className}>
      <ConnectButton
        accountStatus={{
          smallScreen: 'avatar',
          largeScreen: 'full',
        }}
        chainStatus={{
          smallScreen: 'icon',
          largeScreen: 'full',
        }}
        showBalance={showBalance}
      />
      {showLinkPrompt && (
        <div className="mt-2 p-3 bg-gray-800 rounded-lg border border-gray-700 text-sm">
          <p className="text-gray-300 mb-2">
            Link wallet <span className="font-mono text-green-400">{address?.slice(0, 6)}...{address?.slice(-4)}</span> to your account?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleLinkWallet}
              disabled={isLinking}
              className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-green-800 rounded text-white text-xs transition-colors"
            >
              {isLinking ? 'Linking...' : 'Link Wallet'}
            </button>
            <button
              onClick={() => setShowLinkPrompt(false)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-xs transition-colors"
            >
              Not Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple button version for minimal UI
export function ConnectWalletButton({
  className = '',
}: {
  className?: string;
}) {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className={`px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors ${className}`}
      >
        {address.slice(0, 6)}...{address.slice(-4)}
      </button>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ openConnectModal }) => (
        <button
          onClick={openConnectModal}
          className={`px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 rounded-lg transition-colors ${className}`}
        >
          Connect Wallet
        </button>
      )}
    </ConnectButton.Custom>
  );
}
