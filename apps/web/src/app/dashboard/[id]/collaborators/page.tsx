'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { episodesApi, collaboratorsApi } from '@/lib/api';

interface Collaborator {
  id: string;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  role: string;
  permissions: string[];
  status: string;
  revenueShare: number;
  invitedAt: string;
  acceptedAt: string | null;
}

const ROLE_OPTIONS = [
  { value: 'co-host', label: 'Co-Host', description: 'Full access to fire events and view stats' },
  { value: 'moderator', label: 'Moderator', description: 'Can fire events and view stats' },
];

const PERMISSION_OPTIONS = [
  { value: 'fire_events', label: 'Fire Events', description: 'Trigger bingo events' },
  { value: 'view_stats', label: 'View Stats', description: 'View episode statistics' },
  { value: 'manage_events', label: 'Manage Events', description: 'Add/edit event definitions' },
];

export default function CollaboratorsPage() {
  const params = useParams();
  const episodeId = params.id as string;
  const { user, token } = useAuth();

  const [episode, setEpisode] = useState<any>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState('co-host');
  const [inviteRevenueShare, setInviteRevenueShare] = useState(0);
  const [inviting, setInviting] = useState(false);

  // Edit modal
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [editRevenueShare, setEditRevenueShare] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token, episodeId]);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [episodeData, collaboratorsData] = await Promise.all([
        episodesApi.get(episodeId, token),
        collaboratorsApi.getForEpisode(episodeId, token),
      ]);
      setEpisode(episodeData);
      setCollaborators(collaboratorsData);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleInvite = async () => {
    if (!token || !inviteUsername.trim()) return;

    setInviting(true);
    setError(null);
    try {
      await collaboratorsApi.invite(
        episodeId,
        {
          username: inviteUsername.trim(),
          role: inviteRole,
          revenueShare: inviteRevenueShare,
        },
        token
      );
      setShowInvite(false);
      setInviteUsername('');
      setInviteRole('co-host');
      setInviteRevenueShare(0);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
    setInviting(false);
  };

  const handleUpdate = async () => {
    if (!token || !editingCollaborator) return;

    setSaving(true);
    try {
      await collaboratorsApi.update(
        episodeId,
        editingCollaborator.id,
        {
          role: editRole,
          permissions: editPermissions,
          revenueShare: editRevenueShare,
        },
        token
      );
      setEditingCollaborator(null);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
    setSaving(false);
  };

  const handleRemove = async (collaboratorId: string) => {
    if (!token || !confirm('Remove this collaborator?')) return;

    try {
      await collaboratorsApi.remove(episodeId, collaboratorId, token);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openEditModal = (collaborator: Collaborator) => {
    setEditingCollaborator(collaborator);
    setEditRole(collaborator.role);
    setEditPermissions(collaborator.permissions);
    setEditRevenueShare(collaborator.revenueShare);
  };

  const togglePermission = (perm: string) => {
    setEditPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const isOwner = episode?.streamerId === user?.id;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!episode || !isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="text-red-400 mb-4">Access denied</div>
          <Link href="/episodes" className="text-green-400 hover:underline">
            Back to episodes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/episodes" className="text-2xl font-bold text-green-400">
              StreamTree
            </Link>
            <span className="text-gray-400">/</span>
            <Link
              href={episode.status === 'live' ? `/dashboard/${episodeId}` : `/episodes`}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {episode.name}
            </Link>
            <span className="text-gray-400">/</span>
            <h1 className="text-lg font-semibold">Collaborators</h1>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-semibold transition-colors"
          >
            Invite Collaborator
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Info */}
        <div className="bg-gradient-to-r from-green-600/20 to-blue-600/20 border border-green-500/30 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-2">Multi-Streamer Collaboration</h2>
          <p className="text-gray-300">
            Invite other streamers to help manage your episode. Collaborators can fire events,
            view statistics, and optionally share in the revenue.
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

        {/* Collaborators List */}
        {collaborators.length === 0 ? (
          <div className="text-center py-16 bg-gray-800 rounded-xl">
            <div className="text-5xl mb-4">👥</div>
            <p className="text-xl text-gray-300 mb-2">No collaborators yet</p>
            <p className="text-gray-400 mb-6">Invite other streamers to help run your episode</p>
            <button
              onClick={() => setShowInvite(true)}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-semibold transition-colors"
            >
              Invite Your First Collaborator
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {collaborators.map((collab) => (
              <div
                key={collab.id}
                className="bg-gray-800 rounded-xl p-6 border border-gray-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    {collab.user.avatarUrl ? (
                      <img
                        src={collab.user.avatarUrl}
                        alt=""
                        className="w-12 h-12 rounded-full"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                        <span className="text-xl">
                          {(collab.user.displayName || collab.user.username)[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <div className="font-semibold">
                        {collab.user.displayName || collab.user.username}
                      </div>
                      <div className="text-sm text-gray-400">@{collab.user.username}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        collab.status === 'accepted'
                          ? 'bg-green-500/20 text-green-400'
                          : collab.status === 'pending'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {collab.status}
                    </span>
                    <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded capitalize">
                      {collab.role}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {collab.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="text-xs px-2 py-1 bg-gray-700 rounded"
                    >
                      {perm.replace('_', ' ')}
                    </span>
                  ))}
                  {collab.revenueShare > 0 && (
                    <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-400 rounded">
                      {collab.revenueShare}% revenue share
                    </span>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => openEditModal(collab)}
                    className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleRemove(collab.id)}
                    className="px-3 py-1.5 text-sm bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-6">Invite Collaborator</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Username</label>
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="Enter streamer's username"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Revenue Share: {inviteRevenueShare}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={inviteRevenueShare}
                  onChange={(e) => setInviteRevenueShare(parseInt(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Percentage of episode revenue to share (max 50%)
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowInvite(false)}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteUsername.trim()}
                className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg font-semibold transition-colors"
              >
                {inviting ? 'Inviting...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingCollaborator && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-6">
              Edit {editingCollaborator.user.displayName || editingCollaborator.user.username}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Permissions</label>
                <div className="space-y-2">
                  {PERMISSION_OPTIONS.map((perm) => (
                    <label key={perm.value} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={editPermissions.includes(perm.value)}
                        onChange={() => togglePermission(perm.value)}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-green-500"
                      />
                      <div>
                        <div className="text-sm">{perm.label}</div>
                        <div className="text-xs text-gray-400">{perm.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Revenue Share: {editRevenueShare}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={editRevenueShare}
                  onChange={(e) => setEditRevenueShare(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingCollaborator(null)}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={saving}
                className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg font-semibold transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
