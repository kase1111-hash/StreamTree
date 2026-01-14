import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { prisma } from '../db/client.js';
import type { ClientToServerEvent, ServerToClientEvent } from '@streamtree/shared';
import { sanitizeError } from '../utils/sanitize.js';

interface AuthenticatedWebSocket extends WebSocket {
  id: string;
  userId?: string;
  username?: string;
  isAlive: boolean;
  subscribedEpisodes: Set<string>;
  subscribedCards: Set<string>;
}

// Connection tracking
const connections = new Map<string, AuthenticatedWebSocket>();
const episodeSubscribers = new Map<string, Set<string>>(); // episodeId -> connectionIds
const cardSubscribers = new Map<string, Set<string>>(); // cardId -> connectionIds

let wss: WebSocketServer;

export function setupWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  // Heartbeat
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as AuthenticatedWebSocket;
      if (!client.isAlive) {
        cleanupConnection(client);
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  wss.on('connection', (ws: WebSocket, req) => {
    const client = ws as AuthenticatedWebSocket;
    client.id = uuid();
    client.isAlive = true;
    client.subscribedEpisodes = new Set();
    client.subscribedCards = new Set();

    connections.set(client.id, client);

    // Try to authenticate from query string
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
          userId: string;
          username: string;
        };
        client.userId = decoded.userId;
        client.username = decoded.username;
      } catch {
        // Continue as unauthenticated
      }
    }

    // Send connected event
    sendToClient(client, {
      type: 'connected',
      connectionId: client.id,
    });

    client.on('pong', () => {
      client.isAlive = true;
    });

    client.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientToServerEvent;
        handleMessage(client, message);
      } catch (error) {
        sendToClient(client, {
          type: 'error',
          message: 'Invalid message format',
          code: 'INVALID_MESSAGE',
        });
      }
    });

    client.on('close', () => {
      cleanupConnection(client);
    });

    client.on('error', (error) => {
      console.error('WebSocket error:', sanitizeError(error));
      cleanupConnection(client);
    });
  });

  return wss;
}

function handleMessage(client: AuthenticatedWebSocket, message: ClientToServerEvent) {
  switch (message.type) {
    case 'join:episode':
      joinEpisode(client, message.episodeId);
      break;

    case 'leave:episode':
      leaveEpisode(client, message.episodeId);
      break;

    case 'subscribe:card':
      subscribeToCard(client, message.cardId);
      break;

    case 'unsubscribe:card':
      unsubscribeFromCard(client, message.cardId);
      break;

    case 'mark:square':
      handleMarkSquare(client, message.cardId, message.position);
      break;

    case 'ping':
      client.isAlive = true;
      break;

    default:
      sendToClient(client, {
        type: 'error',
        message: 'Unknown message type',
        code: 'UNKNOWN_MESSAGE',
      });
  }
}

function joinEpisode(client: AuthenticatedWebSocket, episodeId: string) {
  client.subscribedEpisodes.add(episodeId);

  if (!episodeSubscribers.has(episodeId)) {
    episodeSubscribers.set(episodeId, new Set());
  }
  episodeSubscribers.get(episodeId)!.add(client.id);
}

function leaveEpisode(client: AuthenticatedWebSocket, episodeId: string) {
  client.subscribedEpisodes.delete(episodeId);
  episodeSubscribers.get(episodeId)?.delete(client.id);
}

function subscribeToCard(client: AuthenticatedWebSocket, cardId: string) {
  client.subscribedCards.add(cardId);

  if (!cardSubscribers.has(cardId)) {
    cardSubscribers.set(cardId, new Set());
  }
  cardSubscribers.get(cardId)!.add(client.id);
}

function unsubscribeFromCard(client: AuthenticatedWebSocket, cardId: string) {
  client.subscribedCards.delete(cardId);
  cardSubscribers.get(cardId)?.delete(client.id);
}

async function handleMarkSquare(
  client: AuthenticatedWebSocket,
  cardId: string,
  position: { row: number; col: number }
) {
  if (!client.userId) {
    sendToClient(client, {
      type: 'error',
      message: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  try {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: { episode: true },
    });

    if (!card) {
      sendToClient(client, {
        type: 'error',
        message: 'Card not found',
        code: 'NOT_FOUND',
      });
      return;
    }

    if (card.holderId !== client.userId) {
      sendToClient(client, {
        type: 'error',
        message: 'Not your card',
        code: 'FORBIDDEN',
      });
      return;
    }

    if (card.episode.status !== 'live') {
      sendToClient(client, {
        type: 'error',
        message: 'Episode is not live',
        code: 'INVALID_STATUS',
      });
      return;
    }

    // This is honor system marking - for when streamer enables it
    // For now, just acknowledge receipt
    sendToClient(client, {
      type: 'error',
      message: 'Honor system marking not enabled for this episode',
      code: 'NOT_ENABLED',
    });
  } catch (error) {
    console.error('Error handling mark square:', sanitizeError(error));
    sendToClient(client, {
      type: 'error',
      message: 'Server error',
      code: 'SERVER_ERROR',
    });
  }
}

function cleanupConnection(client: AuthenticatedWebSocket) {
  // Remove from episode subscriptions
  for (const episodeId of client.subscribedEpisodes) {
    episodeSubscribers.get(episodeId)?.delete(client.id);
  }

  // Remove from card subscriptions
  for (const cardId of client.subscribedCards) {
    cardSubscribers.get(cardId)?.delete(client.id);
  }

  connections.delete(client.id);
}

function sendToClient(client: AuthenticatedWebSocket, event: ServerToClientEvent) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(event));
  }
}

// Export broadcast functions for use in routes
export function broadcastToEpisode(episodeId: string, event: ServerToClientEvent) {
  const subscribers = episodeSubscribers.get(episodeId);
  if (!subscribers) return;

  for (const connectionId of subscribers) {
    const client = connections.get(connectionId);
    if (client) {
      sendToClient(client, event);
    }
  }
}

export function broadcastToCard(cardId: string, event: ServerToClientEvent) {
  const subscribers = cardSubscribers.get(cardId);
  if (!subscribers) return;

  for (const connectionId of subscribers) {
    const client = connections.get(connectionId);
    if (client) {
      sendToClient(client, event);
    }
  }
}

export function sendToUser(userId: string, event: ServerToClientEvent) {
  for (const client of connections.values()) {
    if (client.userId === userId) {
      sendToClient(client, event);
    }
  }
}

export async function broadcastStats(episodeId: string) {
  try {
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
    });

    if (!episode) return;

    const leaderboard = await prisma.card.findMany({
      where: { episodeId },
      orderBy: { markedSquares: 'desc' },
      take: 10,
      include: {
        holder: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    broadcastToEpisode(episodeId, {
      type: 'stats:update',
      episodeId,
      cardsMinted: episode.cardsMinted,
      revenue: episode.totalRevenue,
      leaderboard: leaderboard.map((card, index) => ({
        rank: index + 1,
        cardId: card.id,
        holderId: card.holderId,
        username: card.holder.displayName || card.holder.username,
        markedSquares: card.markedSquares,
        patterns: card.patterns as any[],
      })),
    });
  } catch (error) {
    console.error('Error broadcasting stats:', sanitizeError(error));
  }
}

export function getConnectionCount(): number {
  return connections.size;
}

export function getEpisodeViewerCount(episodeId: string): number {
  return episodeSubscribers.get(episodeId)?.size || 0;
}
