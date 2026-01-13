'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, usersApi } from './api';

interface User {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isStreamer: boolean;
  walletAddress?: string | null;
}

interface AuthContextType {
  user: User | null;
  /**
   * @deprecated Token is now stored in HttpOnly cookies for security.
   * API calls will automatically include cookies via credentials: 'include'.
   * This returns an empty string for backwards compatibility with existing API calls.
   */
  token: string;
  loading: boolean;
  login: (username: string) => Promise<void>;
  loginWithWallet: (address: string, signature: string, message: string) => Promise<void>;
  logout: () => Promise<void>;
  becomeStreamer: () => Promise<void>;
  refreshUser: () => Promise<void>;
  linkWallet: (address: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * SECURITY: This auth context now uses HttpOnly cookies for token storage
 * instead of localStorage. This prevents XSS attacks from stealing tokens.
 *
 * How it works:
 * - Login/register endpoints set HttpOnly cookies on the server
 * - The API client includes credentials: 'include' to send cookies
 * - Session validation uses /api/auth/me which reads cookies server-side
 * - Logout clears cookies on the server
 *
 * Migration: The 'token' property has been removed from the context.
 * API calls now rely on cookies sent automatically via credentials: 'include'.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check session status via HttpOnly cookies (server validates token)
  const checkSession = useCallback(async (): Promise<User | null> => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (data.data?.needsRefresh) {
        // Token expired, try refresh (server reads refresh token from cookie)
        try {
          await authApi.refresh('');
          // Retry getting user
          const retryResponse = await fetch(`${API_URL}/api/auth/me`, {
            credentials: 'include',
          });
          const retryData = await retryResponse.json();
          return retryData.data?.user || null;
        } catch {
          return null;
        }
      }

      return data.data?.user || null;
    } catch (error) {
      console.error('Session check failed:', error);
      return null;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const userData = await checkSession();
    setUser(userData);
  }, [checkSession]);

  // Initialize from cookie-based session
  useEffect(() => {
    const initAuth = async () => {
      const userData = await checkSession();
      setUser(userData);
      setLoading(false);
    };

    initAuth();
  }, [checkSession]);

  const login = useCallback(async (username: string) => {
    // Server sets HttpOnly cookies automatically
    const { user: userData } = await authApi.custodial(username);
    setUser(userData);
  }, []);

  const loginWithWallet = useCallback(async (address: string, signature: string, message: string) => {
    // Server sets HttpOnly cookies automatically
    const { user: userData } = await authApi.wallet(address, signature, message);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Server clears cookies and invalidates refresh token
      await authApi.logout('');
    } catch {
      // Ignore logout errors
    }
    setUser(null);
  }, []);

  const becomeStreamer = useCallback(async () => {
    if (!user) throw new Error('Not authenticated');

    // Server updates cookie with new token containing isStreamer: true
    const { user: userData } = await authApi.becomeStreamer('');
    setUser({ ...user, ...userData });
  }, [user]);

  const linkWallet = useCallback(async (address: string) => {
    if (!user) throw new Error('Not authenticated');

    // Token is sent via HttpOnly cookie
    const updatedUser = await usersApi.linkWallet('', address);
    setUser({ ...user, walletAddress: updatedUser.walletAddress });
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        // SECURITY: Token is now stored in HttpOnly cookies, not accessible to JS
        // Empty string for backwards compatibility - API uses cookies via credentials: 'include'
        token: '',
        loading,
        login,
        loginWithWallet,
        logout,
        becomeStreamer,
        refreshUser,
        linkWallet,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
