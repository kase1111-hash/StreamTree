// API Response wrappers

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// Pagination

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Episode endpoints

export interface EpisodeStatsResponse {
  cardsMinted: number;
  totalRevenue: number;
  eventsTriggered: number;
  activeViewers: number;
  leaderboard: import('./card.js').LeaderboardEntry[];
}

// Card endpoints

export interface MintCardResponse {
  card?: import('./card.js').Card;
  paymentRequired?: boolean;
  paymentIntentClientSecret?: string;
}

// Auth endpoints

export interface TokenRefreshResponse {
  token: string;
  refreshToken: string;
}
