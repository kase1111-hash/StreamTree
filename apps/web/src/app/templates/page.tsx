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
  gridSize: number;
  eventCount: number;
  usageCount: number;
  createdAt: string;
  creator: {
    id: string;
    username: string;
    displayName: string | null;
  };
}

const CATEGORY_ICONS: Record<string, string> = {
  general: '🎯',
  gaming: '🎮',
  irl: '🎥',
  music: '🎵',
  sports: '🏆',
  educational: '📚',
  charity: '❤️',
};

export default function TemplatesPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [category, setCategory] = useState<string>('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'popular' | 'newest' | 'name'>('popular');

  // Use template modal
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [episodeName, setEpisodeName] = useState('');
  const [cardPrice, setCardPrice] = useState(0);
  const [maxCards, setMaxCards] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, [category, sort]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await templatesApi.browse({
        category: category || undefined,
        search: search || undefined,
        sort,
      }) as any;
      setTemplates(data);
      if (data.categories) {
        setCategories(data.categories);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTemplates();
  };

  const handleUseTemplate = async () => {
    if (!selectedTemplate || !token) return;

    setCreating(true);
    try {
      const episode = await templatesApi.use(
        selectedTemplate.id,
        {
          episodeName: episodeName || selectedTemplate.name,
          cardPrice: cardPrice * 100,
          maxCards: maxCards || undefined,
        },
        token
      );
      router.push(`/dashboard/${episode.id}`);
    } catch (err: any) {
      setError(err.message);
      setCreating(false);
    }
  };

  const openUseModal = (template: Template) => {
    setSelectedTemplate(template);
    setEpisodeName(template.name);
    setCardPrice(0);
    setMaxCards(null);
  };

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
            <h1 className="text-xl font-semibold">Template Gallery</h1>
          </div>
          {user?.isStreamer && (
            <Link
              href="/templates/my"
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              My Templates
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="mb-8 space-y-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-semibold transition-colors"
            >
              Search
            </button>
          </form>

          {/* Category and Sort */}
          <div className="flex flex-wrap gap-4">
            {/* Categories */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCategory('')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  category === ''
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                    category === cat
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <span>{CATEGORY_ICONS[cat] || '🎯'}</span>
                  <span className="capitalize">{cat}</span>
                </button>
              ))}
            </div>

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="ml-auto bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="popular">Most Popular</option>
              <option value="newest">Newest</option>
              <option value="name">A-Z</option>
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-xl mb-2">No templates found</p>
            <p>Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 hover:border-green-500/50 transition-colors"
              >
                {/* Header */}
                <div className="p-4 border-b border-gray-700">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{CATEGORY_ICONS[template.category] || '🎯'}</span>
                      <h3 className="text-lg font-semibold">{template.name}</h3>
                    </div>
                    <span className="text-xs px-2 py-1 bg-gray-700 rounded capitalize">
                      {template.category}
                    </span>
                  </div>
                  {template.description && (
                    <p className="text-sm text-gray-400 line-clamp-2">{template.description}</p>
                  )}
                </div>

                {/* Stats */}
                <div className="p-4 grid grid-cols-3 gap-4 bg-gray-800/50">
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-400">{template.eventCount}</div>
                    <div className="text-xs text-gray-400">Events</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-400">{template.gridSize}x{template.gridSize}</div>
                    <div className="text-xs text-gray-400">Grid</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-purple-400">{template.usageCount}</div>
                    <div className="text-xs text-gray-400">Uses</div>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 flex items-center justify-between border-t border-gray-700">
                  <div className="text-sm text-gray-400">
                    by {template.creator.displayName || template.creator.username}
                  </div>
                  <button
                    onClick={() => openUseModal(template)}
                    disabled={!user?.isStreamer}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors"
                  >
                    Use Template
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Use Template Modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Create Episode from Template</h2>
            <p className="text-gray-400 mb-6">
              Using template: <span className="text-white font-semibold">{selectedTemplate.name}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Episode Name</label>
                <input
                  type="text"
                  value={episodeName}
                  onChange={(e) => setEpisodeName(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Card Price ($)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={cardPrice}
                  onChange={(e) => setCardPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">Set to 0 for free cards</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Max Cards (optional)</label>
                <input
                  type="number"
                  min={1}
                  value={maxCards || ''}
                  onChange={(e) => setMaxCards(e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="Unlimited"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setSelectedTemplate(null)}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUseTemplate}
                disabled={creating}
                className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg font-semibold transition-colors"
              >
                {creating ? 'Creating...' : 'Create Episode'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
