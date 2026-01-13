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
  timestamp: string;
}

export interface CardUpdatedEvent {
  type: 'card:updated';
  cardId: string;
  markedSquares: GridSquare[];
  newPatterns: Pattern[];
  totalMarked: number;
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

export type ServerToClientEvent =
  | EpisodeStateEvent
  | EventFiredEvent
  | CardUpdatedEvent
  | StatsUpdateEvent
  | CardFruitedEvent
  | ErrorEvent
  | ConnectedEvent;

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
