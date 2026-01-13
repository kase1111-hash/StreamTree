'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

interface LeaderboardEntry {
  rank: number;
  username: string;
  markedSquares: number;
  patterns: any[];
}

interface EventNotification {
  id: string;
  eventName: string;
  triggeredBy: string;
  cardsAffected: number;
  timestamp: Date;
}

export default function OBSOverlayPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const shareCode = params.shareCode as string;

  // Overlay configuration from query params
  const showLeaderboard = searchParams.get('leaderboard') !== 'false';
  const showStats = searchParams.get('stats') !== 'false';
  const showEvents = searchParams.get('events') !== 'false';
  const theme = searchParams.get('theme') || 'dark';
  const maxLeaderboard = parseInt(searchParams.get('maxLeaderboard') || '5');
  const position = searchParams.get('position') || 'right';

  const [episode, setEpisode] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [recentEvents, setRecentEvents] = useState<EventNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const res = await fetch(`${API_URL}/api/public/episode/${shareCode}`);
        const data = await res.json();

        if (!data.success) {
          setError('Episode not found');
          return;
        }

        setEpisode(data.data);

        // Fetch leaderboard
        const lbRes = await fetch(`${API_URL}/api/public/episode/${shareCode}/leaderboard`);
        const lbData = await lbRes.json();
        if (lbData.success) {
          setLeaderboard(lbData.data.slice(0, maxLeaderboard));
        }
      } catch (err) {
        setError('Failed to load episode');
      }
    };

    fetchData();
  }, [shareCode, maxLeaderboard]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!episode) return;

    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setConnected(true);
      // Join episode room
      ws.send(JSON.stringify({ type: 'join:episode', episodeId: episode.id }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 3 seconds
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    };

    ws.onerror = () => {
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [episode]);

  const handleWebSocketMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'event:fired':
        // Add to recent events
        const newEvent: EventNotification = {
          id: crypto.randomUUID(),
          eventName: data.eventName,
          triggeredBy: data.triggeredBy || 'manual',
          cardsAffected: data.cardsAffected || 0,
          timestamp: new Date(),
        };
        setRecentEvents((prev) => [newEvent, ...prev].slice(0, 5));

        // Remove after 5 seconds
        setTimeout(() => {
          setRecentEvents((prev) => prev.filter((e) => e.id !== newEvent.id));
        }, 5000);
        break;

      case 'stats:update':
        // Update leaderboard
        if (data.leaderboard) {
          setLeaderboard(data.leaderboard.slice(0, maxLeaderboard));
        }
        // Update episode stats
        if (data.cardsMinted !== undefined) {
          setEpisode((prev: any) =>
            prev ? { ...prev, cardsMinted: data.cardsMinted } : prev
          );
        }
        break;

      case 'episode:state':
        if (data.status) {
          setEpisode((prev: any) =>
            prev ? { ...prev, status: data.status } : prev
          );
        }
        break;
    }
  }, [maxLeaderboard]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  const themeClasses = theme === 'light'
    ? 'text-gray-900'
    : 'text-white';

  const bgClasses = theme === 'light'
    ? 'bg-white/90'
    : 'bg-black/80';

  const positionClasses = {
    left: 'left-4',
    right: 'right-4',
    center: 'left-1/2 -translate-x-1/2',
  }[position] || 'right-4';

  return (
    <div className={`min-h-screen bg-transparent ${themeClasses}`}>
      {/* Event Notifications - Top */}
      {showEvents && (
        <div className={`fixed top-4 ${positionClasses} flex flex-col gap-2 z-50`}>
          {recentEvents.map((event, index) => (
            <div
              key={event.id}
              className={`${bgClasses} backdrop-blur-sm px-4 py-3 rounded-lg shadow-lg animate-slide-in`}
              style={{
                animation: 'slideIn 0.3s ease-out',
                animationDelay: `${index * 0.1}s`,
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <span className="text-xl">
                    {event.triggeredBy === 'twitch' ? '💜' : event.triggeredBy === 'chat' ? '💬' : '🎯'}
                  </span>
                </div>
                <div>
                  <div className="font-bold">{event.eventName}</div>
                  <div className="text-sm opacity-70">
                    {event.cardsAffected} cards affected
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats Panel */}
      {showStats && (
        <div className={`fixed bottom-20 ${positionClasses} ${bgClasses} backdrop-blur-sm px-4 py-3 rounded-lg shadow-lg`}>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-400">
              {episode.cardsMinted}
            </div>
            <div className="text-sm opacity-70">Players</div>
          </div>
        </div>
      )}

      {/* Leaderboard Panel */}
      {showLeaderboard && leaderboard.length > 0 && (
        <div className={`fixed bottom-4 ${positionClasses} ${bgClasses} backdrop-blur-sm rounded-lg shadow-lg overflow-hidden min-w-[200px]`}>
          <div className="px-4 py-2 bg-gradient-to-r from-green-600/50 to-blue-600/50">
            <h3 className="font-bold text-sm">Leaderboard</h3>
          </div>
          <div className="divide-y divide-white/10">
            {leaderboard.map((entry, index) => (
              <div
                key={index}
                className="px-4 py-2 flex items-center gap-3"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0 ? 'bg-yellow-500 text-black' :
                  index === 1 ? 'bg-gray-300 text-black' :
                  index === 2 ? 'bg-orange-600 text-white' :
                  'bg-gray-600 text-white'
                }`}>
                  {entry.rank}
                </div>
                <div className="flex-1 truncate text-sm">
                  {entry.username}
                </div>
                <div className="text-sm font-mono">
                  {entry.markedSquares}
                </div>
                {entry.patterns.length > 0 && (
                  <div className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
                    {entry.patterns.length} bingo{entry.patterns.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connection indicator - Small dot */}
      <div className={`fixed bottom-2 right-2 w-2 h-2 rounded-full ${
        connected ? 'bg-green-500' : 'bg-red-500'
      }`} />

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
