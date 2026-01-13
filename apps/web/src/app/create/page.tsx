'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { episodesApi } from '@/lib/api';
import { EventGridEditor } from '@/components/EventGrid';

interface EventDef {
  id: string;
  name: string;
  icon: string;
  description?: string | null;
}

export default function CreateEpisodePage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [step, setStep] = useState<'info' | 'events'>('info');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Episode info
  const [name, setName] = useState('');
  const [gridSize, setGridSize] = useState(5);
  const [episodeId, setEpisodeId] = useState<string | null>(null);

  // Events
  const [events, setEvents] = useState<EventDef[]>([]);

  // Not a streamer
  if (user && !user.isStreamer) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Streamer Access Required</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            You need to be a streamer to create episodes.
          </p>
          <Link
            href="/auth/become-streamer"
            className="px-6 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition"
          >
            Become a Streamer
          </Link>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user || !token) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Sign In Required</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Please sign in to create episodes.
          </p>
          <Link
            href="/auth/login"
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const handleCreateEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Episode name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const episode = await episodesApi.create(
        { name: name.trim(), gridSize },
        token
      );
      setEpisodeId(episode.id);
      setStep('events');
    } catch (err: any) {
      setError(err.message || 'Failed to create episode');
    }

    setLoading(false);
  };

  const handleAddEvent = async (event: { name: string; icon: string; description?: string }) => {
    if (!episodeId || !token) return;

    try {
      const newEvent = await episodesApi.addEvent(episodeId, event, token);
      setEvents([...events, newEvent]);
    } catch (err: any) {
      setError(err.message || 'Failed to add event');
    }
  };

  const handleRemoveEvent = async (eventId: string) => {
    if (!episodeId || !token) return;

    try {
      await episodesApi.deleteEvent(episodeId, eventId, token);
      setEvents(events.filter((e) => e.id !== eventId));
    } catch (err: any) {
      setError(err.message || 'Failed to remove event');
    }
  };

  const handleUpdateEvent = async (eventId: string, data: Partial<EventDef>) => {
    if (!episodeId || !token) return;

    try {
      const updated = await episodesApi.updateEvent(episodeId, eventId, data, token);
      setEvents(events.map((e) => (e.id === eventId ? { ...e, ...updated } : e)));
    } catch (err: any) {
      setError(err.message || 'Failed to update event');
    }
  };

  const handleLaunch = async () => {
    if (!episodeId || !token) return;

    if (events.length === 0) {
      setError('Add at least one event before launching');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await episodesApi.launch(episodeId, token);
      router.push(`/dashboard/${episodeId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to launch episode');
    }

    setLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Progress indicator */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step === 'info' ? 'bg-primary-600 text-white' : 'bg-primary-100 text-primary-600'
            }`}
          >
            1
          </div>
          <div className="w-24 h-1 bg-gray-200 dark:bg-gray-700 mx-2" />
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step === 'events' ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}
          >
            2
          </div>
        </div>
      </div>

      {step === 'info' && (
        <div>
          <h1 className="text-3xl font-bold text-center mb-2">Create Episode</h1>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
            Set up a new streaming bingo game
          </p>

          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg">
            <form onSubmit={handleCreateEpisode}>
              <div className="mb-4">
                <label htmlFor="name" className="block text-sm font-medium mb-1">
                  Episode Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Friday Night Chaos - Ep. 23"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Grid Size</label>
                <div className="flex gap-2">
                  {[3, 4, 5, 6, 7].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setGridSize(size)}
                      className={`px-4 py-2 rounded-lg border transition ${
                        gridSize === size
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                      }`}
                    >
                      {size}x{size}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {gridSize}x{gridSize} = {gridSize * gridSize} squares
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="w-full px-4 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 transition"
              >
                {loading ? 'Creating...' : 'Continue to Events'}
              </button>
            </form>
          </div>
        </div>
      )}

      {step === 'events' && episodeId && (
        <div>
          <h1 className="text-3xl font-bold text-center mb-2">Add Events</h1>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
            Define events that might happen during your stream
          </p>

          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg mb-4">
            <EventGridEditor
              events={events}
              onAdd={handleAddEvent}
              onUpdate={handleUpdateEvent}
              onRemove={handleRemoveEvent}
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => setStep('info')}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              Back
            </button>
            <button
              onClick={handleLaunch}
              disabled={loading || events.length === 0}
              className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 transition"
            >
              {loading ? 'Launching...' : 'Launch Episode'}
            </button>
          </div>

          <p className="mt-4 text-center text-sm text-gray-500">
            You can add more events after launching, but viewers will only get new events on new cards
          </p>
        </div>
      )}
    </div>
  );
}
