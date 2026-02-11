export type EpisodeStatus = 'draft' | 'live' | 'ended' | 'archived';

export interface Episode {
  id: string;
  streamerId: string;

  // Content
  name: string;
  artworkUrl: string | null;
  artworkHash: string | null;

  // Configuration
  cardPrice: number; // Price in cents (0 = free)
  maxCards: number | null; // null = unlimited
  gridSize: number; // Default: 5 (5x5 grid)

  // State
  status: EpisodeStatus;

  // Timestamps
  createdAt: Date;
  launchedAt: Date | null;
  endedAt: Date | null;

  // Stats
  cardsMinted: number;
  totalRevenue: number;

  // Blockchain
  contractAddress: string | null;
  rootTokenId: string | null;

  // Share
  shareCode: string;
}

export interface CreateEpisodeInput {
  name: string;
  cardPrice?: number;
  maxCards?: number | null;
  gridSize?: number;
}

export interface UpdateEpisodeInput {
  name?: string;
  artworkUrl?: string;
  cardPrice?: number;
  maxCards?: number | null;
  gridSize?: number;
}

export interface EpisodeWithEvents extends Episode {
  events: EventDefinition[];
}

export interface EventDefinition {
  id: string;
  episodeId: string;

  name: string;
  icon: string;
  description: string | null;

  // Automation
  triggerType: TriggerType;
  triggerConfig: TriggerConfig | null;

  // State
  firedAt: Date | null;
  firedCount: number;

  createdAt: Date;
  order: number;
}

export type TriggerType = 'manual' | 'twitch';

export type TriggerConfig =
  | ManualTriggerConfig
  | TwitchTriggerConfig;

export interface ManualTriggerConfig {
  type: 'manual';
}

export interface TwitchTriggerConfig {
  type: 'twitch';
  event: 'subscription' | 'donation' | 'raid' | 'bits';
  threshold?: number;
}

export interface CreateEventInput {
  name: string;
  icon?: string;
  description?: string;
  triggerType?: TriggerType;
  triggerConfig?: TriggerConfig;
}

export interface UpdateEventInput {
  name?: string;
  icon?: string;
  description?: string;
  triggerType?: TriggerType;
  triggerConfig?: TriggerConfig;
  order?: number;
}

export interface FiredEvent {
  id: string;
  episodeId: string;
  eventDefinitionId: string;
  firedAt: Date;
  firedBy: 'manual' | 'automation';
  cardsAffected: number;
  triggerData: Record<string, unknown> | null;
}
