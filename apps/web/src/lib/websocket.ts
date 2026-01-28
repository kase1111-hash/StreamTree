'use client';

import type { ClientToServerEvent, ServerToClientEvent } from '@streamtree/shared';

type MessageHandler = (event: ServerToClientEvent) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private messageQueue: ClientToServerEvent[] = [];

  constructor() {
    this.url = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';
  }

  connect(token?: string) {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;
    this.token = token || this.token;

    // SECURITY: Don't pass token in URL query parameter as it gets logged
    // Use Sec-WebSocket-Protocol header instead, which is not logged
    try {
      const protocols = this.token ? ['streamtree', `auth-${this.token}`] : ['streamtree'];
      this.ws = new WebSocket(this.url, protocols);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        console.log('WebSocket connected');

        // Send queued messages
        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift();
          if (msg) this.send(msg);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ServerToClientEvent;
          this.handlers.forEach((handler) => handler(data));
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        console.log('WebSocket disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        this.isConnecting = false;
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      this.isConnecting = false;
      console.error('Failed to create WebSocket:', error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: ClientToServerEvent) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for when connection is established
      this.messageQueue.push(message);
      this.connect();
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  joinEpisode(episodeId: string) {
    this.send({ type: 'join:episode', episodeId });
  }

  leaveEpisode(episodeId: string) {
    this.send({ type: 'leave:episode', episodeId });
  }

  subscribeToCard(cardId: string) {
    this.send({ type: 'subscribe:card', cardId });
  }

  unsubscribeFromCard(cardId: string) {
    this.send({ type: 'unsubscribe:card', cardId });
  }

  ping() {
    this.send({ type: 'ping' });
  }
}

// Singleton instance
export const wsClient = new WebSocketClient();

// React hook for WebSocket
import { useEffect, useState } from 'react';

export function useWebSocket(token: string | null) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (token) {
      wsClient.connect(token);
    }

    const unsubscribe = wsClient.subscribe((event) => {
      if (event.type === 'connected') {
        setConnected(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [token]);

  return { connected, wsClient };
}

export function useEpisodeEvents(
  episodeId: string | null,
  onEvent: (event: ServerToClientEvent) => void
) {
  useEffect(() => {
    if (!episodeId) return;

    wsClient.joinEpisode(episodeId);

    const unsubscribe = wsClient.subscribe((event) => {
      if (
        (event.type === 'episode:state' && event.episodeId === episodeId) ||
        (event.type === 'event:fired' && event.episodeId === episodeId) ||
        (event.type === 'stats:update' && event.episodeId === episodeId)
      ) {
        onEvent(event);
      }
    });

    return () => {
      wsClient.leaveEpisode(episodeId);
      unsubscribe();
    };
  }, [episodeId, onEvent]);
}

export function useCardEvents(
  cardId: string | null,
  onEvent: (event: ServerToClientEvent) => void
) {
  useEffect(() => {
    if (!cardId) return;

    wsClient.subscribeToCard(cardId);

    const unsubscribe = wsClient.subscribe((event) => {
      if (
        (event.type === 'card:updated' && event.cardId === cardId) ||
        (event.type === 'card:fruited' && event.cardId === cardId)
      ) {
        onEvent(event);
      }
    });

    return () => {
      wsClient.unsubscribeFromCard(cardId);
      unsubscribe();
    };
  }, [cardId, onEvent]);
}
