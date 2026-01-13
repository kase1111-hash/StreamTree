export type AuthProvider = 'wallet' | 'twitch' | 'google' | 'email' | 'custodial';

export interface User {
  id: string;

  // Identity
  walletAddress: string | null;
  custodialWalletId: string | null;

  // Profile
  username: string;
  displayName: string | null;
  avatarUrl: string | null;

  // Auth
  authProvider: AuthProvider;
  authProviderId: string;

  // Streamer info
  isStreamer: boolean;
  twitchId: string | null;

  // Timestamps
  createdAt: Date;
  lastActiveAt: Date;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isStreamer: boolean;
}

export interface UpdateUserInput {
  displayName?: string;
  avatarUrl?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
}

export interface WalletAuthInput {
  address: string;
  signature: string;
  message: string;
}

export interface CustodialAuthInput {
  username: string;
}
