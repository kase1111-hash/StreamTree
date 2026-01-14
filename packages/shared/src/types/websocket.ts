import type { GridSquare, Pattern, LeaderboardEntry } from './card.js';

// Server -> Client Events

export interface EpisodeStateEvent {
  type: 'episode:state';
  episodeId: string;
  status: 'live' | 'ended';
}

export interface EventFiredEvent {
  type: 'event:fired';
  episodeId: string;
  eventId: string;
  eventName: string;
  timestamp?: string;
  triggeredBy?: string;
  cardsAffected?: number;
  twitchInfo?: { title: string; description: string };
  chatInfo?: { keyword: string; username?: string };
}

export interface CardUpdatedEvent {
  type: 'card:updated';
  cardId: string;
  markedSquares: number;
  patterns: Pattern[];
  triggeredBy?: string;
}

export interface StatsUpdateEvent {
  type: 'stats:update';
  episodeId: string;
  cardsMinted: number;
  revenue: number;
  leaderboard: LeaderboardEntry[];
}

export interface CardFruitedEvent {
  type: 'card:fruited';
  cardId: string;
  fruitTokenId: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  code?: string;
}

export interface ConnectedEvent {
  type: 'connected';
  connectionId: string;
}

export interface PaymentRefundedEvent {
  type: 'payment:refunded';
  cardId?: string;
  episodeId: string;
  amount?: number;
  reason?: string;
  message?: string;
  refundId?: string;
}

export interface CardMintedEvent {
  type: 'card:minted';
  cardId: string;
  episodeId: string;
  holderId?: string;
  cardNumber: number;
}

export type ServerToClientEvent =
  | EpisodeStateEvent
  | EventFiredEvent
  | CardUpdatedEvent
  | StatsUpdateEvent
  | CardFruitedEvent
  | ErrorEvent
  | ConnectedEvent
  | PaymentRefundedEvent
  | CardMintedEvent;

// Client -> Server Events

export interface JoinEpisodeMessage {
  type: 'join:episode';
  episodeId: string;
}

export interface LeaveEpisodeMessage {
  type: 'leave:episode';
  episodeId: string;
}

export interface SubscribeCardMessage {
  type: 'subscribe:card';
  cardId: string;
}

export interface UnsubscribeCardMessage {
  type: 'unsubscribe:card';
  cardId: string;
}

export interface MarkSquareMessage {
  type: 'mark:square';
  cardId: string;
  position: { row: number; col: number };
}

export interface PingMessage {
  type: 'ping';
}

export type ClientToServerEvent =
  | JoinEpisodeMessage
  | LeaveEpisodeMessage
  | SubscribeCardMessage
  | UnsubscribeCardMessage
  | MarkSquareMessage
  | PingMessage;
