const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.error?.message || 'API Error',
      response.status,
      data.error?.code || 'API_ERROR'
    );
  }

  return data.data;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiError';
  }
}

// Auth
export const authApi = {
  custodial: (username: string) =>
    api<{ user: any; token: string; refreshToken: string }>('/api/auth/custodial', {
      method: 'POST',
      body: { username },
    }),

  wallet: (address: string, signature: string, message: string) =>
    api<{ user: any; token: string; refreshToken: string }>('/api/auth/wallet', {
      method: 'POST',
      body: { address, signature, message },
    }),

  refresh: (refreshToken: string) =>
    api<{ token: string; refreshToken: string }>('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    }),

  logout: (refreshToken: string) =>
    api('/api/auth/logout', {
      method: 'POST',
      body: { refreshToken },
    }),

  becomeStreamer: (token: string) =>
    api<{ user: any; token: string }>('/api/auth/become-streamer', {
      method: 'POST',
      token,
    }),
};

// Episodes
export const episodesApi = {
  list: (token: string) =>
    api<any[]>('/api/episodes', { token }),

  get: (id: string, token: string) =>
    api<any>(`/api/episodes/${id}`, { token }),

  create: (data: { name: string; cardPrice?: number; maxCards?: number; gridSize?: number }, token: string) =>
    api<any>('/api/episodes', { method: 'POST', body: data, token }),

  update: (id: string, data: any, token: string) =>
    api<any>(`/api/episodes/${id}`, { method: 'PATCH', body: data, token }),

  delete: (id: string, token: string) =>
    api(`/api/episodes/${id}`, { method: 'DELETE', token }),

  launch: (id: string, token: string) =>
    api<any>(`/api/episodes/${id}/launch`, { method: 'POST', token }),

  end: (id: string, token: string) =>
    api<any>(`/api/episodes/${id}/end`, { method: 'POST', token }),

  getStats: (id: string, token: string) =>
    api<any>(`/api/episodes/${id}/stats`, { token }),

  addEvent: (episodeId: string, data: { name: string; icon?: string; description?: string }, token: string) =>
    api<any>(`/api/episodes/${episodeId}/events`, { method: 'POST', body: data, token }),

  updateEvent: (episodeId: string, eventId: string, data: any, token: string) =>
    api<any>(`/api/episodes/${episodeId}/events/${eventId}`, { method: 'PATCH', body: data, token }),

  deleteEvent: (episodeId: string, eventId: string, token: string) =>
    api(`/api/episodes/${episodeId}/events/${eventId}`, { method: 'DELETE', token }),

  fireEvent: (episodeId: string, eventId: string, token: string) =>
    api<any>(`/api/episodes/${episodeId}/events/${eventId}/fire`, { method: 'POST', token }),

  getResults: (id: string, token?: string) =>
    api<any>(`/api/episodes/${id}/results`, { token }),
};

// Cards
export const cardsApi = {
  getMy: (token: string) =>
    api<any[]>('/api/cards/my', { token }),

  getMyForEpisode: (episodeId: string, token: string) =>
    api<any>(`/api/cards/my/${episodeId}`, { token }),

  get: (id: string, token: string) =>
    api<any>(`/api/cards/${id}`, { token }),

  mint: (episodeId: string, token: string) =>
    api<any>(`/api/cards/mint/${episodeId}`, { method: 'POST', token }),

  getGallery: (token: string) =>
    api<any[]>('/api/cards/gallery/all', { token }),
};

// Public
export const publicApi = {
  getEpisode: (shareCode: string) =>
    api<any>(`/api/public/episode/${shareCode}`),

  getLeaderboard: (shareCode: string) =>
    api<any[]>(`/api/public/episode/${shareCode}/leaderboard`),

  checkUsername: (username: string) =>
    api<{ available: boolean }>(`/api/public/username-available/${username}`),
};

// Users
export const usersApi = {
  getMe: (token: string) =>
    api<any>('/api/users/me', { token }),

  updateMe: (data: { displayName?: string; avatarUrl?: string }, token: string) =>
    api<any>('/api/users/me', { method: 'PATCH', body: data, token }),

  getStats: (token: string) =>
    api<any>('/api/users/me/stats', { token }),

  linkWallet: (token: string, walletAddress: string) =>
    api<any>('/api/users/me/wallet', { method: 'POST', body: { walletAddress }, token }),
};

// Payments
export const paymentsApi = {
  getSettings: (token: string) =>
    api<any>('/api/payments/settings', { token }),

  connectStripe: (email: string, token: string) =>
    api<{ onboardingUrl: string }>('/api/payments/connect', {
      method: 'POST',
      body: { email },
      token,
    }),

  getEarnings: (token: string) =>
    api<any>('/api/payments/earnings', { token }),

  withdraw: (episodeId: string, token: string) =>
    api<any>(`/api/payments/withdraw/${episodeId}`, { method: 'POST', token }),

  getWithdrawals: (token: string) =>
    api<any[]>('/api/payments/withdrawals', { token }),

  createPaymentIntent: (episodeId: string, token: string) =>
    api<{ clientSecret: string }>(`/api/cards/mint/${episodeId}/payment`, {
      method: 'POST',
      token,
    }),
};

// Upload
export const uploadApi = {
  uploadArtwork: async (file: File, episodeId: string, token: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('episodeId', episodeId);

    const response = await fetch(`${API_URL}/api/upload/artwork`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error?.message || 'Upload failed',
        response.status,
        data.error?.code || 'UPLOAD_ERROR'
      );
    }

    return data.data;
  },

  uploadAvatar: async (file: File, token: string) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/upload/avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error?.message || 'Upload failed',
        response.status,
        data.error?.code || 'UPLOAD_ERROR'
      );
    }

    return data.data;
  },

  deleteArtwork: (episodeId: string, token: string) =>
    api(`/api/upload/artwork/${episodeId}`, { method: 'DELETE', token }),
};
