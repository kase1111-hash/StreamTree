export type CardStatus = 'active' | 'fruited';

export interface Card {
  id: string;
  episodeId: string;
  holderId: string;

  // Grid
  grid: GridSquare[][];

  // State
  status: CardStatus;
  markedSquares: number;
  patterns: Pattern[];

  // Timestamps
  mintedAt: Date;
  fruitedAt: Date | null;

  // Payment
  paymentId: string | null;
  pricePaid: number;

  // Blockchain
  branchTokenId: string | null;
  fruitTokenId: string | null;

  // Metadata
  cardNumber: number;
}

export interface GridSquare {
  eventId: string;
  position: Position;
  marked: boolean;
  markedAt: Date | null;
}

export interface Position {
  row: number;
  col: number;
}

export type Pattern =
  | RowPattern
  | ColumnPattern
  | DiagonalPattern
  | BlackoutPattern;

export interface RowPattern {
  type: 'row';
  index: number;
}

export interface ColumnPattern {
  type: 'column';
  index: number;
}

export interface DiagonalPattern {
  type: 'diagonal';
  direction: 'main' | 'anti';
}

export interface BlackoutPattern {
  type: 'blackout';
}

export interface CardWithEpisode extends Card {
  episode: {
    id: string;
    name: string;
    artworkUrl: string | null;
    status: string;
    streamerName: string;
  };
}

export interface LeaderboardEntry {
  rank: number;
  cardId: string;
  holderId: string;
  username: string;
  markedSquares: number;
  patterns: Pattern[];
}
