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
  token: string | null;
  loading: boolean;
  login: (username: string) => Promise<void>;
  loginWithWallet: (address: string, signature: string, message: string) => Promise<void>;
  logout: () => Promise<void>;
  becomeStreamer: () => Promise<void>;
  refreshUser: () => Promise<void>;
  linkWallet: (address: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = 'streamtree_token';
const REFRESH_TOKEN_KEY = 'streamtree_refresh_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const saveTokens = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    setToken(accessToken);
  }, []);

  const clearTokens = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const fetchUser = useCallback(async (accessToken: string) => {
    try {
      const userData = await usersApi.getMe(accessToken);
      setUser(userData);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      clearTokens();
    }
  }, [clearTokens]);

  const refreshUser = useCallback(async () => {
    if (token) {
      await fetchUser(token);
    }
  }, [token, fetchUser]);

  // Initialize from stored token
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);

      if (storedToken) {
        setToken(storedToken);
        try {
          await fetchUser(storedToken);
        } catch {
          // Token might be expired, try refresh
          if (storedRefresh) {
            try {
              const { token: newToken, refreshToken: newRefresh } = await authApi.refresh(storedRefresh);
              saveTokens(newToken, newRefresh);
              await fetchUser(newToken);
            } catch {
              clearTokens();
            }
          } else {
            clearTokens();
          }
        }
      }

      setLoading(false);
    };

    initAuth();
  }, [fetchUser, saveTokens, clearTokens]);

  const login = useCallback(async (username: string) => {
    const { user: userData, token: accessToken, refreshToken } = await authApi.custodial(username);
    saveTokens(accessToken, refreshToken);
    setUser(userData);
  }, [saveTokens]);

  const loginWithWallet = useCallback(async (address: string, signature: string, message: string) => {
    const { user: userData, token: accessToken, refreshToken } = await authApi.wallet(address, signature, message);
    saveTokens(accessToken, refreshToken);
    setUser(userData);
  }, [saveTokens]);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Ignore logout errors
      }
    }
    clearTokens();
  }, [clearTokens]);

  const becomeStreamer = useCallback(async () => {
    if (!token) throw new Error('Not authenticated');

    const { user: userData, token: newToken } = await authApi.becomeStreamer(token);
    setToken(newToken);
    localStorage.setItem(TOKEN_KEY, newToken);
    setUser({ ...user!, ...userData });
  }, [token, user]);

  const linkWallet = useCallback(async (address: string) => {
    if (!token) throw new Error('Not authenticated');

    const updatedUser = await usersApi.linkWallet(token, address);
    setUser({ ...user!, walletAddress: updatedUser.walletAddress });
  }, [token, user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
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
