'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { templatesApi } from '@/lib/api';

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  events: any[];
  gridSize: number;
  isPublic: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General', icon: '🎯' },
  { value: 'gaming', label: 'Gaming', icon: '🎮' },
  { value: 'irl', label: 'IRL', icon: '🎥' },
  { value: 'music', label: 'Music', icon: '🎵' },
  { value: 'sports', label: 'Sports', icon: '🏆' },
  { value: 'educational', label: 'Educational', icon: '📚' },
  { value: 'charity', label: 'Charity', icon: '❤️' },
];

export default function MyTemplatesPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('general');
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.isStreamer) {
      router.push('/dashboard');
      return;
    }
    fetchTemplates();
  }, [user, token]);

  const fetchTemplates = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await templatesApi.getMy(token);
      setTemplates(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (template: Template) => {
    setEditingTemplate(template);
    setEditName(template.name);
    setEditDescription(template.description || '');
    setEditCategory(template.category);
    setEditIsPublic(template.isPublic);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate || !token) return;

    setSaving(true);
    try {
      await templatesApi.update(
        editingTemplate.id,
        {
          name: editName,
          description: editDescription || null,
          category: editCategory,
          isPublic: editIsPublic,
        },
        token
      );
      setEditingTemplate(null);
      fetchTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!token) return;

    try {
      await templatesApi.delete(id, token);
      setDeletingId(null);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!user?.isStreamer) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-2xl font-bold text-green-400">
              StreamTree
            </Link>
            <span className="text-gray-400">/</span>
            <Link href="/templates" className="text-gray-400 hover:text-white transition-colors">
              Templates
            </Link>
            <span className="text-gray-400">/</span>
            <h1 className="text-xl font-semibold">My Templates</h1>
          </div>
          <Link
            href="/templates"
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors"
          >
            Browse Gallery
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Info */}
        <div className="bg-gradient-to-r from-green-600/20 to-blue-600/20 border border-green-500/30 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-2">Your Templates</h2>
          <p className="text-gray-300">
            Templates are reusable bingo configurations you can save from episodes.
            Make them public to share with other streamers in the gallery.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500 rounded-lg text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-4 underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-xl mb-2">No templates yet</p>
            <p className="mb-6">Save your first template from an episode to get started</p>
            <Link
              href="/dashboard"
              className="inline-block px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-semibold transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  {/* Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">
                        {CATEGORY_OPTIONS.find((c) => c.value === template.category)?.icon || '🎯'}
                      </span>
                      <h3 className="text-xl font-semibold">{template.name}</h3>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          template.isPublic
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-700 text-gray-400'
                        }`}
                      >
                        {template.isPublic ? 'Public' : 'Private'}
                      </span>
                      <span className="text-xs px-2 py-1 bg-gray-700 rounded capitalize">
                        {template.category}
                      </span>
                    </div>
                    {template.description && (
                      <p className="text-gray-400 mb-3">{template.description}</p>
                    )}
                    <div className="flex items-center gap-6 text-sm text-gray-400">
                      <span>{template.events.length} events</span>
                      <span>{template.gridSize}x{template.gridSize} grid</span>
                      <span>{template.usageCount} uses</span>
                      <span>Updated {formatDate(template.updatedAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(template)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingId(template.id)}
                      className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Events Preview */}
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="flex flex-wrap gap-2">
                    {template.events.slice(0, 10).map((event, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-gray-700 rounded-full text-sm"
                      >
                        {event.icon || '🎯'} {event.name}
                      </span>
                    ))}
                    {template.events.length > 10 && (
                      <span className="px-3 py-1 bg-gray-700 rounded-full text-sm text-gray-400">
                        +{template.events.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Edit Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-6">Edit Template</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.icon} {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={editIsPublic}
                  onChange={(e) => setEditIsPublic(e.target.checked)}
                  className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-green-500 focus:ring-green-500"
                />
                <span>Make this template public</span>
              </label>
              <p className="text-sm text-gray-400 ml-8">
                Public templates appear in the gallery and can be used by other streamers
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingTemplate(null)}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={saving || !editName.trim()}
                className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg font-semibold transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-sm w-full p-6 text-center">
            <div className="text-5xl mb-4">🗑️</div>
            <h2 className="text-xl font-bold mb-2">Delete Template?</h2>
            <p className="text-gray-400 mb-6">
              This action cannot be undone. The template will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteTemplate(deletingId)}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 rounded-lg font-semibold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
