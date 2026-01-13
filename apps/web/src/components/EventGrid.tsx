'use client';

import { useState } from 'react';
import { clsx } from 'clsx';

interface EventDefinition {
  id: string;
  name: string;
  icon: string;
  description?: string | null;
  firedAt?: Date | null;
  firedCount?: number;
}

interface EventGridEditorProps {
  events: EventDefinition[];
  onAdd: (event: { name: string; icon: string; description?: string }) => void;
  onUpdate: (id: string, event: Partial<EventDefinition>) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

const EMOJI_OPTIONS = ['🎯', '🎮', '🏆', '💥', '🔥', '⚡', '🎉', '💀', '👑', '🎁', '💎', '🚀', '😂', '😱', '🤔', '❤️'];

export function EventGridEditor({
  events,
  onAdd,
  onUpdate,
  onRemove,
  disabled = false,
}: EventGridEditorProps) {
  const [newEventName, setNewEventName] = useState('');
  const [newEventIcon, setNewEventIcon] = useState('🎯');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newEventName.trim()) return;

    onAdd({
      name: newEventName.trim(),
      icon: newEventIcon,
      description: newEventDescription.trim() || undefined,
    });

    setNewEventName('');
    setNewEventIcon('🎯');
    setNewEventDescription('');
  };

  return (
    <div className="space-y-4">
      {/* Event list */}
      <div className="space-y-2">
        {events.map((event, index) => (
          <div
            key={event.id}
            className={clsx(
              'flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border',
              event.firedAt
                ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950'
                : 'border-gray-200 dark:border-gray-700'
            )}
          >
            <span className="text-gray-400 text-sm w-6">{index + 1}</span>
            <span className="text-2xl">{event.icon}</span>
            <div className="flex-1 min-w-0">
              {editingId === event.id ? (
                <input
                  type="text"
                  value={event.name}
                  onChange={(e) => onUpdate(event.id, { name: e.target.value })}
                  onBlur={() => setEditingId(null)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)}
                  className="w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              ) : (
                <div
                  onClick={() => !disabled && setEditingId(event.id)}
                  className={clsx(
                    'font-medium truncate',
                    !disabled && 'cursor-pointer hover:text-primary-600'
                  )}
                >
                  {event.name}
                </div>
              )}
              {event.description && (
                <div className="text-sm text-gray-500 truncate">{event.description}</div>
              )}
            </div>
            {event.firedAt && (
              <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-xs rounded">
                Fired {event.firedCount || 1}x
              </span>
            )}
            {!disabled && (
              <button
                onClick={() => onRemove(event.id)}
                className="p-1 text-gray-400 hover:text-red-500 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}

        {events.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No events yet. Add events that might happen during your stream!
          </div>
        )}
      </div>

      {/* Add new event */}
      {!disabled && (
        <div className="border-t pt-4">
          <div className="flex gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-12 h-12 flex items-center justify-center text-2xl bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                {newEventIcon}
              </button>
              {showEmojiPicker && (
                <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                  <div className="grid grid-cols-4 gap-1">
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          setNewEventIcon(emoji);
                          setShowEmojiPicker(false);
                        }}
                        className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <input
              type="text"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Event name (e.g., 'Gets a sub')"
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800"
            />
            <button
              onClick={handleAdd}
              disabled={!newEventName.trim()}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Add
            </button>
          </div>
          <input
            type="text"
            value={newEventDescription}
            onChange={(e) => setNewEventDescription(e.target.value)}
            placeholder="Optional description"
            className="mt-2 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 text-sm"
          />
        </div>
      )}

      {/* Event count */}
      <div className="text-sm text-gray-500">
        {events.length} event{events.length !== 1 ? 's' : ''} defined
        {events.length > 0 && events.length < 25 && (
          <span className="ml-2 text-amber-600">
            (Tip: Add at least 25 events to fill a 5x5 grid uniquely)
          </span>
        )}
      </div>
    </div>
  );
}

// Display-only version for live dashboard
interface EventGridDisplayProps {
  events: EventDefinition[];
  onFire: (eventId: string) => void;
  disabled?: boolean;
}

export function EventGridDisplay({
  events,
  onFire,
  disabled = false,
}: EventGridDisplayProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {events.map((event) => (
        <button
          key={event.id}
          onClick={() => onFire(event.id)}
          disabled={disabled}
          className={clsx(
            'p-4 rounded-lg border-2 text-left transition-all',
            event.firedAt
              ? 'bg-primary-100 dark:bg-primary-900 border-primary-400 dark:border-primary-600'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:shadow-md',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="text-2xl mb-1">{event.icon}</div>
          <div className="font-medium truncate">{event.name}</div>
          {event.firedAt && (
            <div className="text-xs text-primary-600 dark:text-primary-400 mt-1">
              Triggered {event.firedCount || 1}x
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
