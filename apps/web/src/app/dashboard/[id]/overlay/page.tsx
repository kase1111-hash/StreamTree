'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { episodesApi } from '@/lib/api';

export default function OverlayConfigPage() {
  const params = useParams();
  const episodeId = params.id as string;
  const { token } = useAuth();

  const [episode, setEpisode] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Overlay configuration
  const [config, setConfig] = useState({
    showLeaderboard: true,
    showStats: true,
    showEvents: true,
    theme: 'dark',
    maxLeaderboard: 5,
    position: 'right',
  });

  useEffect(() => {
    if (!token) return;

    const fetchEpisode = async () => {
      try {
        const data = await episodesApi.get(episodeId, token);
        setEpisode(data);
      } catch (err) {
        console.error('Failed to fetch episode:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEpisode();
  }, [episodeId, token]);

  const getOverlayUrl = () => {
    if (!episode) return '';

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams();

    if (!config.showLeaderboard) params.set('leaderboard', 'false');
    if (!config.showStats) params.set('stats', 'false');
    if (!config.showEvents) params.set('events', 'false');
    if (config.theme !== 'dark') params.set('theme', config.theme);
    if (config.maxLeaderboard !== 5) params.set('maxLeaderboard', config.maxLeaderboard.toString());
    if (config.position !== 'right') params.set('position', config.position);

    const queryString = params.toString();
    return `${baseUrl}/overlay/${episode.shareCode}${queryString ? '?' + queryString : ''}`;
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(getOverlayUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">Episode not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">OBS Overlay Setup</h1>
        <p className="text-gray-400 mb-8">
          Configure your overlay and add it as a Browser Source in OBS
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuration */}
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Configuration</h2>

              <div className="space-y-4">
                {/* Theme */}
                <div>
                  <label className="block text-sm font-medium mb-2">Theme</label>
                  <select
                    value={config.theme}
                    onChange={(e) => setConfig({ ...config, theme: e.target.value })}
                    className="w-full bg-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>

                {/* Position */}
                <div>
                  <label className="block text-sm font-medium mb-2">Position</label>
                  <select
                    value={config.position}
                    onChange={(e) => setConfig({ ...config, position: e.target.value })}
                    className="w-full bg-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="right">Right</option>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                  </select>
                </div>

                {/* Toggle Options */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.showLeaderboard}
                      onChange={(e) => setConfig({ ...config, showLeaderboard: e.target.checked })}
                      className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-green-500 focus:ring-green-500"
                    />
                    <span>Show Leaderboard</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.showStats}
                      onChange={(e) => setConfig({ ...config, showStats: e.target.checked })}
                      className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-green-500 focus:ring-green-500"
                    />
                    <span>Show Player Count</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.showEvents}
                      onChange={(e) => setConfig({ ...config, showEvents: e.target.checked })}
                      className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-green-500 focus:ring-green-500"
                    />
                    <span>Show Event Notifications</span>
                  </label>
                </div>

                {/* Max Leaderboard */}
                {config.showLeaderboard && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Leaderboard Entries: {config.maxLeaderboard}
                    </label>
                    <input
                      type="range"
                      min={3}
                      max={10}
                      value={config.maxLeaderboard}
                      onChange={(e) => setConfig({ ...config, maxLeaderboard: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Overlay URL */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Overlay URL</h2>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm break-all mb-4">
                {getOverlayUrl()}
              </div>
              <button
                onClick={copyUrl}
                className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-lg font-semibold transition-colors"
              >
                {copied ? 'Copied!' : 'Copy URL'}
              </button>
            </div>

            {/* Instructions */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">OBS Setup Instructions</h2>
              <ol className="list-decimal list-inside space-y-2 text-gray-300">
                <li>Open OBS and go to your scene</li>
                <li>Click the + under Sources</li>
                <li>Select "Browser"</li>
                <li>Name it "StreamTree Overlay"</li>
                <li>Paste the URL above</li>
                <li>Set width to 400 and height to 800</li>
                <li>Check "Shutdown source when not visible"</li>
                <li>Position the overlay in your scene</li>
              </ol>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Preview</h2>
            <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ height: '500px' }}>
              <iframe
                src={getOverlayUrl()}
                className="w-full h-full border-0"
                title="Overlay Preview"
              />
              <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-gray-700 rounded-lg" />
            </div>
            <p className="text-sm text-gray-400 mt-2 text-center">
              Live preview - Events and updates will appear here
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
