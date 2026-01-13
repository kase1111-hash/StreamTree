'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';
import { useEffect } from 'react';
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

  // When wallet connects, link it to the user account
  useEffect(() => {
    if (isConnected && address && onConnect) {
      onConnect(address);
    }

    // Auto-link wallet if user is logged in
    if (isConnected && address && user && !user.walletAddress) {
      linkWallet(address).catch(console.error);
    }
  }, [isConnected, address, onConnect, user, linkWallet]);

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
