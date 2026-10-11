import type { Pattern } from '@streamtree/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// SECURITY: File upload validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// ── Response Interfaces ─────────────────────────────────────────────
// These mirror the JSON returned by apps/api/src/routes/*. Dates arrive
// as ISO strings.

export interface UserResponse {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isStreamer: boolean;
  // Omitted by custodial login
  walletAddress?: string | null;
}

export interface UserProfileResponse extends UserResponse {
  createdAt: string;
  lastActiveAt: string;
  cardsCount: number;
  episodesCount: number;
}

export interface AuthResponse {
  user: UserResponse;
  token: string;
  refreshToken: string;
}

export interface EpisodeEvent {
  id: string;
  episodeId: string;
  name: string;
  icon: string;
  description: string | null;
  triggerType: string;
  triggerConfig: unknown;
  firedAt: string | null;
  firedCount: number;
  createdAt: string;
  sortOrder: number;
}

export type PublicEpisodeEvent = Pick<EpisodeEvent, 'id' | 'name' | 'icon' | 'description' | 'firedAt'>;

export interface EpisodeResponse {
  id: string;
  streamerId: string;
  name: string;
  artworkUrl: string | null;
  artworkHash: string | null;
  cardPrice: number;
  maxCards: number | null;
  gridSize: number;
  status: string;
  createdAt: string;
  launchedAt: string | null;
  endedAt: string | null;
  cardsMinted: number;
  totalRevenue: number;
  contractAddress: string | null;
  rootTokenId: string | null;
  shareCode: string;
}

export interface EpisodeListItem extends EpisodeResponse {
  cardsCount: number;
  eventsCount: number;
}

export interface EpisodeWithEvents extends EpisodeResponse {
  eventDefinitions: EpisodeEvent[];
}

export interface EpisodeDetail extends EpisodeWithEvents {
  streamer: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface LeaderboardEntryResponse {
  rank: number;
  cardId: string;
  username: string;
  markedSquares: number;
  patterns: Pattern[];
  score: number;
}

export interface PublicLeaderboardEntry extends Omit<LeaderboardEntryResponse, 'patterns'> {
  // Public leaderboard returns the pattern count rather than the patterns
  patterns: number;
}

export interface EpisodeStats {
  cardsMinted: number;
  totalRevenue: number;
  eventsTriggered: number;
  leaderboard: LeaderboardEntryResponse[];
}

export interface EpisodeResults {
  id: string;
  name: string;
  artworkUrl: string | null;
  status: string;
  cardsMinted: number;
  totalRevenue: number;
  launchedAt: string | null;
  endedAt: string | null;
  streamer: {
    id: string;
    username: string;
    displayName: string | null;
  };
  eventsFired: number;
  totalEvents: number;
  leaderboard: LeaderboardEntryResponse[];
}

export interface FireEventResponse {
  firedEvent: {
    id: string;
    episodeId: string;
    eventDefinitionId: string;
    firedAt: string;
    firedBy: string;
    cardsAffected: number;
    triggerData: unknown;
  };
  cardsAffected: number;
}

export interface GridSquareResponse {
  eventId: string;
  position: { row: number; col: number };
  marked: boolean;
  markedAt: string | null;
}

export interface CardResponse {
  id: string;
  episodeId: string;
  holderId: string;
  grid: GridSquareResponse[][];
  status: string;
  markedSquares: number;
  patterns: Pattern[];
  mintedAt: string;
  fruitedAt: string | null;
  paymentId: string | null;
  pricePaid: number;
  branchTokenId: string | null;
  fruitTokenId: string | null;
  cardNumber: number;
}

export interface MyCardListItem extends CardResponse {
  episode: {
    id: string;
    name: string;
    artworkUrl: string | null;
    status: string;
    streamer: { username: string; displayName: string | null };
    streamerName: string;
  };
}

export interface MyEpisodeCardResponse extends CardResponse {
  episode: EpisodeWithEvents & {
    streamer: { username: string; displayName: string | null };
  };
}

export interface CardDetailResponse extends CardResponse {
  episode: EpisodeWithEvents & {
    streamer: {
      id: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    };
  };
  holder: { id: string; username: string; displayName: string | null };
}

export interface MintedCardResponse extends CardResponse {
  episode: {
    id: string;
    name: string;
    artworkUrl: string | null;
    status: string;
    rootTokenId: string | null;
  };
}

export interface GalleryCard {
  id: string;
  episodeId: string;
  episodeName: string;
  artworkUrl: string | null;
  streamerName: string;
  cardNumber: number;
  markedSquares: number;
  patterns: Pattern[];
  mintedAt: string;
  fruitedAt: string | null;
  fruitTokenId: string | null;
}

export interface PublicEpisodeResponse {
  id: string;
  name: string;
  artworkUrl: string | null;
  cardPrice: number;
  maxCards: number | null;
  gridSize: number;
  status: string;
  launchedAt: string | null;
  endedAt: string | null;
  cardsMinted: number;
  shareCode: string;
  events: PublicEpisodeEvent[];
  streamer: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  isSoldOut: boolean;
}

export interface UserStats {
  cardsTotal: number;
  cardsFruited: number;
  patternsCompleted: number;
  episodesCreated: number;
  episodesLive: number;
}

export interface PaymentSettings {
  hasStripeAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  platformFeePercent: number;
}

export interface EarningsSummary {
  totalEarnings: number;
  totalWithdrawn: number;
  pendingWithdrawals: number;
  availableBalance: number;
  platformFeePercent: number;
  episodes: Array<{
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
  }>;
}

export interface WithdrawResponse {
  withdrawalId: string;
  amount: number;
  status: string;
}

export interface WithdrawalResponse {
  id: string;
  episodeId: string;
  episodeName: string;
  amount: number;
  platformFee: number;
  netAmount: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export interface TemplateEvent {
  name: string;
  icon?: string;
  description?: string | null;
  triggerType?: string;
  triggerConfig?: unknown;
}

export interface TemplateResponse {
  id: string;
  creatorId: string;
  name: string;
  description: string | null;
  events: TemplateEvent[];
  gridSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface UploadResponse {
  url: string;
  // Returned for artwork uploads only
  hash?: string;
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
  description?: string | null;
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
    api<{ user: Omit<UserResponse, 'avatarUrl' | 'walletAddress'>; token: string }>('/api/auth/become-streamer', {
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
    api<EpisodeWithEvents>('/api/episodes', { method: 'POST', body: data, token }),

  update: (id: string, data: EpisodeUpdateData, token: string) =>
    api<EpisodeWithEvents>(`/api/episodes/${id}`, { method: 'PATCH', body: data, token }),

  delete: (id: string, token: string) =>
    api(`/api/episodes/${id}`, { method: 'DELETE', token }),

  launch: (id: string, token: string) =>
    api<EpisodeWithEvents>(`/api/episodes/${id}/launch`, { method: 'POST', token }),

  end: (id: string, token: string) =>
    api<EpisodeResponse>(`/api/episodes/${id}/end`, { method: 'POST', token }),

  getStats: (id: string, token: string) =>
    api<EpisodeStats>(`/api/episodes/${id}/stats`, { token }),

  addEvent: (episodeId: string, data: { name: string; icon?: string; description?: string }, token: string) =>
    api<EpisodeEvent>(`/api/episodes/${episodeId}/events`, { method: 'POST', body: data, token }),

  updateEvent: (episodeId: string, eventId: string, data: EventUpdateData, token: string) =>
    api<EpisodeEvent>(`/api/episodes/${episodeId}/events/${eventId}`, { method: 'PATCH', body: data, token }),

  deleteEvent: (episodeId: string, eventId: string, token: string) =>
    api(`/api/episodes/${episodeId}/events/${eventId}`, { method: 'DELETE', token }),

  fireEvent: (episodeId: string, eventId: string, token: string) =>
    api<FireEventResponse>(`/api/episodes/${episodeId}/events/${eventId}/fire`, { method: 'POST', token }),

  getResults: (id: string, token?: string) =>
    api<EpisodeResults>(`/api/episodes/${id}/results`, { token }),
};

// ── Cards ────────────────────────────────────────────────────────────

export const cardsApi = {
  getMy: (token: string) =>
    api<MyCardListItem[]>('/api/cards/my', { token }),

  getMyForEpisode: (episodeId: string, token: string) =>
    api<MyEpisodeCardResponse>(`/api/cards/my/${episodeId}`, { token }),

  get: (id: string, token: string) =>
    api<CardDetailResponse>(`/api/cards/${id}`, { token }),

  mint: (episodeId: string, token: string) =>
    api<MintedCardResponse>(`/api/cards/mint/${episodeId}`, { method: 'POST', token }),

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
    api<PublicLeaderboardEntry[]>(`/api/public/episode/${shareCode}/leaderboard`),

  checkUsername: (username: string) =>
    api<{ available: boolean }>(`/api/public/username-available/${username}`),
};

// ── Users ────────────────────────────────────────────────────────────

export const usersApi = {
  getMe: (token: string) =>
    api<UserProfileResponse>('/api/users/me', { token }),

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
    api<WithdrawResponse>(`/api/payments/withdraw/${episodeId}`, { method: 'POST', token }),

  getWithdrawals: (token: string) =>
    api<WithdrawalResponse[]>('/api/payments/withdrawals', { token }),

  createPaymentIntent: (episodeId: string, token: string) =>
    api<{ clientSecret: string; paymentIntentId: string; amount: number }>(`/api/cards/mint/${episodeId}/payment`, {
      method: 'POST',
      token,
    }),
};

// ── Upload ───────────────────────────────────────────────────────────

// Multipart uploads can't use the JSON content type that satisfies the API's
// CSRF check, so mark them as script-initiated with X-Requested-With instead.
function uploadHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const uploadApi = {
  uploadArtwork: async (file: File, episodeId: string, token: string) => {
    // SECURITY: Validate file before upload
    validateFileUpload(file);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('episodeId', episodeId);

    const response = await fetch(`${API_URL}/api/upload/artwork`, {
      method: 'POST',
      headers: uploadHeaders(token),
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
      headers: uploadHeaders(token),
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
    api<EpisodeWithEvents>(`/api/templates/${id}/use`, { method: 'POST', body: data, token }),

  fromEpisode: (
    episodeId: string,
    data: { name: string; description?: string },
    token: string
  ) =>
    api<TemplateResponse>(`/api/templates/from-episode/${episodeId}`, { method: 'POST', body: data, token }),
};
