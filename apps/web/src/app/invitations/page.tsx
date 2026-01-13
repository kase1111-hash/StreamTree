'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { collaboratorsApi } from '@/lib/api';

interface Invitation {
  id: string;
  role: string;
  permissions: string[];
  revenueShare: number;
  invitedAt: string;
  episode: {
    id: string;
    name: string;
    status: string;
    streamer: {
      id: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    };
  };
}

export default function InvitationsPage() {
  const { user, token } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      fetchInvitations();
    }
  }, [token]);

  const fetchInvitations = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await collaboratorsApi.getPendingInvitations(token);
      setInvitations(data);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleAccept = async (invitationId: string) => {
    if (!token) return;
    setProcessingId(invitationId);
    try {
      await collaboratorsApi.acceptInvitation(invitationId, token);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
    } catch (err: any) {
      setError(err.message);
    }
    setProcessingId(null);
  };

  const handleDecline = async (invitationId: string) => {
    if (!token || !confirm('Decline this invitation?')) return;
    setProcessingId(invitationId);
    try {
      await collaboratorsApi.declineInvitation(invitationId, token);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
    } catch (err: any) {
      setError(err.message);
    }
    setProcessingId(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!user?.isStreamer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Streamer Access Required</h1>
          <p className="text-gray-400 mb-4">
            Only streamers can receive collaboration invitations
          </p>
          <Link
            href="/auth/become-streamer"
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition"
          >
            Become a Streamer
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
            <Link href="/dashboard" className="text-2xl font-bold text-green-400">
              StreamTree
            </Link>
            <span className="text-gray-400">/</span>
            <h1 className="text-lg font-semibold">Invitations</h1>
          </div>
          <Link
            href="/episodes"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            My Episodes
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500 rounded-lg text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-4 underline">
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400" />
          </div>
        ) : invitations.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📬</div>
            <h2 className="text-xl font-semibold mb-2">No pending invitations</h2>
            <p className="text-gray-400">
              When other streamers invite you to collaborate, invitations will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="bg-gray-800 rounded-xl p-6 border border-gray-700"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    {invitation.episode.streamer.avatarUrl ? (
                      <img
                        src={invitation.episode.streamer.avatarUrl}
                        alt=""
                        className="w-12 h-12 rounded-full"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                        <span className="text-xl">
                          {(invitation.episode.streamer.displayName || invitation.episode.streamer.username)[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <div className="font-semibold">
                        {invitation.episode.streamer.displayName || invitation.episode.streamer.username}
                      </div>
                      <div className="text-sm text-gray-400">
                        invited you to collaborate
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-400">
                    {formatDate(invitation.invitedAt)}
                  </div>
                </div>

                <div className="bg-gray-900 rounded-lg p-4 mb-4">
                  <div className="font-semibold text-lg mb-1">{invitation.episode.name}</div>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span
                      className={`px-2 py-0.5 rounded ${
                        invitation.episode.status === 'live'
                          ? 'bg-green-500/20 text-green-400'
                          : invitation.episode.status === 'draft'
                          ? 'bg-gray-700 text-gray-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {invitation.episode.status}
                    </span>
                    <span className="capitalize">Role: {invitation.role}</span>
                    {invitation.revenueShare > 0 && (
                      <span className="text-purple-400">
                        {invitation.revenueShare}% revenue share
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-sm text-gray-400">Permissions:</span>
                  {invitation.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="text-xs px-2 py-1 bg-gray-700 rounded"
                    >
                      {perm.replace('_', ' ')}
                    </span>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleDecline(invitation.id)}
                    disabled={processingId === invitation.id}
                    className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg font-semibold transition-colors"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => handleAccept(invitation.id)}
                    disabled={processingId === invitation.id}
                    className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg font-semibold transition-colors"
                  >
                    {processingId === invitation.id ? 'Processing...' : 'Accept'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
