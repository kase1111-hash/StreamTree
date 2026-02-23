const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// SECURITY: File upload validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// ── Response Interfaces ─────────────────────────────────────────────

export interface UserResponse {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'viewer' | 'streamer' | 'admin';
  walletAddress: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: UserResponse;
  token: string;
  refreshToken: string;
}

export interface EpisodeEvent {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  firedAt: string | null;
}

export interface EpisodeListItem {
  id: string;
  name: string;
  artworkUrl: string | null;
  status: string;
  cardPrice: number;
  cardsMinted: number;
  maxCards: number | null;
  gridSize: number;
  shareCode: string;
  createdAt: string;
}

export interface EpisodeDetail extends EpisodeListItem {
  events: EpisodeEvent[];
}

export interface EpisodeStats {
  totalCards: number;
  totalRevenue: number;
  eventsFired: number;
  totalEvents: number;
  topPatterns: Array<{ type: string; count: number }>;
}

export interface EpisodeResults {
  episode: EpisodeDetail;
  leaderboard: LeaderboardEntryResponse[];
  stats: EpisodeStats;
}

export interface GridSquareResponse {
  eventId: string;
  eventName: string;
  eventIcon: string;
  position: { row: number; col: number };
  marked: boolean;
  markedAt: string | null;
}

export interface PatternResponse {
  type: 'row' | 'column' | 'diagonal' | 'blackout';
  index?: number;
  direction?: 'main' | 'anti';
}

export interface CardResponse {
  id: string;
  episodeId: string;
  holderId: string;
  grid: GridSquareResponse[][];
  markedSquares: number;
  patterns: PatternResponse[];
  status: string;
  createdAt: string;
}

export interface GalleryCard {
  id: string;
  episodeId: string;
  episodeName: string;
  artworkUrl: string | null;
  markedSquares: number;
  patterns: PatternResponse[];
  status: string;
  createdAt: string;
}

export interface LeaderboardEntryResponse {
  rank: number;
  cardId: string;
  username: string;
  markedSquares: number;
  patterns: number;
  score: number;
}

export interface PublicEpisodeResponse {
  id: string;
  name: string;
  artworkUrl: string | null;
  status: string;
  cardPrice: number;
  cardsMinted: number;
  maxCards: number | null;
  gridSize: number;
  shareCode: string;
  isSoldOut: boolean;
  events: EpisodeEvent[];
  streamer: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface UserStats {
  totalCards: number;
  totalPatterns: number;
  episodesPlayed: number;
  bestScore: number;
}

export interface PaymentSettings {
  stripeConnected: boolean;
  stripeAccountId: string | null;
  payoutsEnabled: boolean;
}

export interface EarningsSummary {
  totalEarnings: number;
  availableBalance: number;
  pendingBalance: number;
  episodes: Array<{
    episodeId: string;
    episodeName: string;
    earnings: number;
    cardsSold: number;
    withdrawn: boolean;
  }>;
}

export interface WithdrawalResponse {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
}

export interface TemplateResponse {
  id: string;
  name: string;
  description: string | null;
  events: Array<{ name: string; icon: string; description: string | null }>;
  gridSize: number;
  createdAt: string;
}

export interface UploadResponse {
  url: string;
}

// ── Update / Input Interfaces ───────────────────────────────────────

export interface EpisodeUpdateData {
  name?: string;
  cardPrice?: number;
  maxCards?: number | null;
  artworkUrl?: string | null;
}

export interface EventUpdateData {
  name?: string;
  icon?: string;
  description?: string;
}

export interface TemplateUpdateData {
  name?: string;
  description?: string;
  events?: Array<{ name: string; icon?: string; description?: string }>;
  gridSize?: number;
}

// ── Validation ──────────────────────────────────────────────────────

/**
 * Validates a file before upload
 * @throws Error if file is invalid
 */
function validateFileUpload(file: File, maxSize: number = MAX_FILE_SIZE): void {
  // Check file type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new ApiError(
      `Invalid file type: ${file.type}. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
      400,
      'INVALID_FILE_TYPE'
    );
  }

  // Check file size
  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    throw new ApiError(
      `File too large: ${Math.round(file.size / (1024 * 1024))}MB. Maximum allowed: ${maxMB}MB`,
      400,
      'FILE_TOO_LARGE'
    );
  }

  // Check if file is empty
  if (file.size === 0) {
    throw new ApiError('File is empty', 400, 'EMPTY_FILE');
  }
}

// ── Core API Client ─────────────────────────────────────────────────

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

  // Still support token header for backwards compatibility, but cookies are preferred
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    // SECURITY: Include credentials to send HttpOnly cookies
    credentials: 'include',
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

// ── Auth ─────────────────────────────────────────────────────────────

export const authApi = {
  custodial: (username: string) =>
    api<AuthResponse>('/api/auth/custodial', {
      method: 'POST',
      body: { username },
    }),

  wallet: (address: string, signature: string, message: string) =>
    api<AuthResponse>('/api/auth/wallet', {
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
    api<{ user: UserResponse; token: string }>('/api/auth/become-streamer', {
      method: 'POST',
      token,
    }),
};

// ── Episodes ─────────────────────────────────────────────────────────

export const episodesApi = {
  list: (token: string) =>
    api<EpisodeListItem[]>('/api/episodes', { token }),

  get: (id: string, token: string) =>
    api<EpisodeDetail>(`/api/episodes/${id}`, { token }),

  create: (data: { name: string; cardPrice?: number; maxCards?: number; gridSize?: number }, token: string) =>
    api<EpisodeDetail>('/api/episodes', { method: 'POST', body: data, token }),

  update: (id: string, data: EpisodeUpdateData, token: string) =>
    api<EpisodeDetail>(`/api/episodes/${id}`, { method: 'PATCH', body: data, token }),

  delete: (id: string, token: string) =>
    api(`/api/episodes/${id}`, { method: 'DELETE', token }),

  launch: (id: string, token: string) =>
    api<EpisodeDetail>(`/api/episodes/${id}/launch`, { method: 'POST', token }),

  end: (id: string, token: string) =>
    api<EpisodeDetail>(`/api/episodes/${id}/end`, { method: 'POST', token }),

  getStats: (id: string, token: string) =>
    api<EpisodeStats>(`/api/episodes/${id}/stats`, { token }),

  addEvent: (episodeId: string, data: { name: string; icon?: string; description?: string }, token: string) =>
    api<EpisodeEvent>(`/api/episodes/${episodeId}/events`, { method: 'POST', body: data, token }),

  updateEvent: (episodeId: string, eventId: string, data: EventUpdateData, token: string) =>
    api<EpisodeEvent>(`/api/episodes/${episodeId}/events/${eventId}`, { method: 'PATCH', body: data, token }),

  deleteEvent: (episodeId: string, eventId: string, token: string) =>
    api(`/api/episodes/${episodeId}/events/${eventId}`, { method: 'DELETE', token }),

  fireEvent: (episodeId: string, eventId: string, token: string) =>
    api<EpisodeEvent>(`/api/episodes/${episodeId}/events/${eventId}/fire`, { method: 'POST', token }),

  getResults: (id: string, token?: string) =>
    api<EpisodeResults>(`/api/episodes/${id}/results`, { token }),
};

// ── Cards ────────────────────────────────────────────────────────────

export const cardsApi = {
  getMy: (token: string) =>
    api<CardResponse[]>('/api/cards/my', { token }),

  getMyForEpisode: (episodeId: string, token: string) =>
    api<CardResponse>(`/api/cards/my/${episodeId}`, { token }),

  get: (id: string, token: string) =>
    api<CardResponse>(`/api/cards/${id}`, { token }),

  mint: (episodeId: string, token: string) =>
    api<CardResponse>(`/api/cards/mint/${episodeId}`, { method: 'POST', token }),

  createPaymentIntent: (episodeId: string, token: string) =>
    api<{ clientSecret: string; paymentIntentId: string; amount: number }>(
      `/api/cards/mint/${episodeId}/payment`,
      { method: 'POST', token }
    ),

  getGallery: (token: string) =>
    api<GalleryCard[]>('/api/cards/gallery/all', { token }),
};

// ── Public ───────────────────────────────────────────────────────────

export const publicApi = {
  getEpisode: (shareCode: string) =>
    api<PublicEpisodeResponse>(`/api/public/episode/${shareCode}`),

  getLeaderboard: (shareCode: string) =>
    api<LeaderboardEntryResponse[]>(`/api/public/episode/${shareCode}/leaderboard`),

  checkUsername: (username: string) =>
    api<{ available: boolean }>(`/api/public/username-available/${username}`),
};

// ── Users ────────────────────────────────────────────────────────────

export const usersApi = {
  getMe: (token: string) =>
    api<UserResponse>('/api/users/me', { token }),

  updateMe: (data: { displayName?: string; avatarUrl?: string }, token: string) =>
    api<UserResponse>('/api/users/me', { method: 'PATCH', body: data, token }),

  getStats: (token: string) =>
    api<UserStats>('/api/users/me/stats', { token }),

  linkWallet: (token: string, walletAddress: string) =>
    api<UserResponse>('/api/users/me/wallet', { method: 'POST', body: { walletAddress }, token }),
};

// ── Payments ─────────────────────────────────────────────────────────

export const paymentsApi = {
  getSettings: (token: string) =>
    api<PaymentSettings>('/api/payments/settings', { token }),

  connectStripe: (email: string, token: string) =>
    api<{ onboardingUrl: string }>('/api/payments/connect', {
      method: 'POST',
      body: { email },
      token,
    }),

  getEarnings: (token: string) =>
    api<EarningsSummary>('/api/payments/earnings', { token }),

  withdraw: (episodeId: string, token: string) =>
    api<WithdrawalResponse>(`/api/payments/withdraw/${episodeId}`, { method: 'POST', token }),

  getWithdrawals: (token: string) =>
    api<WithdrawalResponse[]>('/api/payments/withdrawals', { token }),

  createPaymentIntent: (episodeId: string, token: string) =>
    api<{ clientSecret: string }>(`/api/cards/mint/${episodeId}/payment`, {
      method: 'POST',
      token,
    }),
};

// ── Upload ───────────────────────────────────────────────────────────

export const uploadApi = {
  uploadArtwork: async (file: File, episodeId: string, token: string) => {
    // SECURITY: Validate file before upload
    validateFileUpload(file);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('episodeId', episodeId);

    const response = await fetch(`${API_URL}/api/upload/artwork`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
      // SECURITY: Include credentials for HttpOnly cookies
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error?.message || 'Upload failed',
        response.status,
        data.error?.code || 'UPLOAD_ERROR'
      );
    }

    return data.data as UploadResponse;
  },

  uploadAvatar: async (file: File, token: string) => {
    // SECURITY: Validate file before upload (5MB limit for avatars)
    validateFileUpload(file, 5 * 1024 * 1024);

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/upload/avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
      // SECURITY: Include credentials for HttpOnly cookies
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error?.message || 'Upload failed',
        response.status,
        data.error?.code || 'UPLOAD_ERROR'
      );
    }

    return data.data as UploadResponse;
  },

  deleteArtwork: (episodeId: string, token: string) =>
    api(`/api/upload/artwork/${episodeId}`, { method: 'DELETE', token }),
};

// ── Templates ────────────────────────────────────────────────────────

export const templatesApi = {
  getMy: (token: string) =>
    api<TemplateResponse[]>('/api/templates/my', { token }),

  get: (id: string, token: string) =>
    api<TemplateResponse>(`/api/templates/${id}`, { token }),

  create: (
    data: {
      name: string;
      description?: string;
      events: Array<{ name: string; icon?: string; description?: string }>;
      gridSize?: number;
    },
    token: string
  ) =>
    api<TemplateResponse>('/api/templates', { method: 'POST', body: data, token }),

  update: (id: string, data: TemplateUpdateData, token: string) =>
    api<TemplateResponse>(`/api/templates/${id}`, { method: 'PATCH', body: data, token }),

  delete: (id: string, token: string) =>
    api(`/api/templates/${id}`, { method: 'DELETE', token }),

  use: (id: string, data: { episodeName?: string; cardPrice?: number; maxCards?: number }, token: string) =>
    api<EpisodeDetail>(`/api/templates/${id}/use`, { method: 'POST', body: data, token }),

  fromEpisode: (
    episodeId: string,
    data: { name: string; description?: string },
    token: string
  ) =>
    api<TemplateResponse>(`/api/templates/from-episode/${episodeId}`, { method: 'POST', body: data, token }),
};
