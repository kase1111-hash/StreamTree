import { describe, it, expect, beforeAll } from 'vitest';
import {
  api,
  createTestStreamer,
  createTestEpisode,
  launchEpisode,
  randomString,
} from './utils';

describe('Collaborators API', () => {
  let owner: { user: any; token: string };
  let collaborator: { user: any; token: string };
  let otherStreamer: { user: any; token: string };
  let liveEpisode: any;

  beforeAll(async () => {
    // Create streamers
    owner = await createTestStreamer(`owner_${randomString()}`);
    collaborator = await createTestStreamer(`collab_${randomString()}`);
    otherStreamer = await createTestStreamer(`other_${randomString()}`);

    // Create and launch an episode
    liveEpisode = await createTestEpisode(owner.token, {
      name: 'Collab Test Episode',
      events: [
        { name: 'Test Event 1', icon: '🎯' },
        { name: 'Test Event 2', icon: '🎮' },
      ],
    });
    await launchEpisode(liveEpisode.id, owner.token);
  });

  describe('Invite Collaborator', () => {
    it('should invite a collaborator by username', async () => {
      const response = await api(`/api/collaborators/${liveEpisode.id}/invite`, {
        method: 'POST',
        token: owner.token,
        body: {
          username: collaborator.user.username,
          role: 'co-host',
          revenueShare: 20,
        },
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.user.username).toBe(collaborator.user.username);
      expect(response.data.role).toBe('co-host');
      expect(response.data.revenueShare).toBe(20);
      expect(response.data.status).toBe('pending');
    });

    it('should fail to invite non-existent user', async () => {
      const response = await api(`/api/collaborators/${liveEpisode.id}/invite`, {
        method: 'POST',
        token: owner.token,
        body: {
          username: 'nonexistent_user_' + randomString(),
        },
      });

      expect(response.success).toBe(false);
    });

    it('should fail to invite yourself', async () => {
      const response = await api(`/api/collaborators/${liveEpisode.id}/invite`, {
        method: 'POST',
        token: owner.token,
        body: {
          username: owner.user.username,
        },
      });

      expect(response.success).toBe(false);
    });

    it('should fail if non-owner tries to invite', async () => {
      const response = await api(`/api/collaborators/${liveEpisode.id}/invite`, {
        method: 'POST',
        token: otherStreamer.token,
        body: {
          username: collaborator.user.username,
        },
      });

      expect(response.success).toBe(false);
    });

    it('should cap revenue share at 50%', async () => {
      const response = await api(`/api/collaborators/${liveEpisode.id}/invite`, {
        method: 'POST',
        token: owner.token,
        body: {
          username: otherStreamer.user.username,
          revenueShare: 80, // Try to set 80%
        },
      });

      expect(response.success).toBe(true);
      expect(response.data.revenueShare).toBe(50); // Should be capped at 50%
    });
  });

  describe('Pending Invitations', () => {
    it('should get pending invitations for user', async () => {
      const response = await api('/api/collaborators/invitations/pending', {
        token: collaborator.token,
      });

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);

      // Should have invitation from earlier test
      const invitation = response.data.find(
        (inv: any) => inv.episode.id === liveEpisode.id
      );
      expect(invitation).toBeDefined();
      expect(invitation.role).toBe('co-host');
    });
  });

  describe('Accept/Decline Invitation', () => {
    let invitationId: string;

    beforeAll(async () => {
      // Get the invitation ID
      const response = await api('/api/collaborators/invitations/pending', {
        token: collaborator.token,
      });

      const invitation = response.data.find(
        (inv: any) => inv.episode.id === liveEpisode.id
      );
      invitationId = invitation.id;
    });

    it('should accept invitation', async () => {
      const response = await api(`/api/collaborators/invitations/${invitationId}/accept`, {
        method: 'POST',
        token: collaborator.token,
      });

      expect(response.success).toBe(true);
      expect(response.data.status).toBe('accepted');
      expect(response.data.acceptedAt).toBeDefined();
    });

    it('should fail to accept already accepted invitation', async () => {
      const response = await api(`/api/collaborators/invitations/${invitationId}/accept`, {
        method: 'POST',
        token: collaborator.token,
      });

      expect(response.success).toBe(false);
    });
  });

  describe('Collaborator Permissions', () => {
    it('should allow collaborator to fire events', async () => {
      // Get episode events
      const episodeResponse = await api(`/api/episodes/${liveEpisode.id}`, {
        token: collaborator.token,
      });
      const eventId = episodeResponse.data.eventDefinitions[0].id;

      // Fire event as collaborator
      const response = await api(`/api/episodes/${liveEpisode.id}/events/${eventId}/fire`, {
        method: 'POST',
        token: collaborator.token,
      });

      expect(response.success).toBe(true);
      expect(response.data.cardsAffected).toBeDefined();
    });

    it('should allow collaborator to view stats', async () => {
      const response = await api(`/api/episodes/${liveEpisode.id}/stats`, {
        token: collaborator.token,
      });

      expect(response.success).toBe(true);
      expect(response.data.cardsMinted).toBeDefined();
      expect(response.data.leaderboard).toBeDefined();
    });

    it('should deny access to non-collaborator', async () => {
      const response = await api(`/api/episodes/${liveEpisode.id}/stats`, {
        token: otherStreamer.token,
      });

      expect(response.success).toBe(false);
    });
  });

  describe('Get Collaborators', () => {
    it('should list episode collaborators as owner', async () => {
      const response = await api(`/api/collaborators/${liveEpisode.id}`, {
        token: owner.token,
      });

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);

      // Should include the accepted collaborator
      const collab = response.data.find(
        (c: any) => c.user.username === collaborator.user.username
      );
      expect(collab).toBeDefined();
      expect(collab.status).toBe('accepted');
    });

    it('should list collaborators as collaborator', async () => {
      const response = await api(`/api/collaborators/${liveEpisode.id}`, {
        token: collaborator.token,
      });

      expect(response.success).toBe(true);
    });

    it('should deny access to non-collaborator', async () => {
      const response = await api(`/api/collaborators/${liveEpisode.id}`, {
        token: otherStreamer.token,
      });

      expect(response.success).toBe(false);
    });
  });

  describe('Update Collaborator', () => {
    it('should update collaborator permissions', async () => {
      // Get collaborator ID
      const listResponse = await api(`/api/collaborators/${liveEpisode.id}`, {
        token: owner.token,
      });
      const collab = listResponse.data.find(
        (c: any) => c.user.username === collaborator.user.username
      );

      const response = await api(`/api/collaborators/${liveEpisode.id}/${collab.id}`, {
        method: 'PATCH',
        token: owner.token,
        body: {
          role: 'moderator',
          permissions: ['fire_events'],
          revenueShare: 10,
        },
      });

      expect(response.success).toBe(true);
      expect(response.data.role).toBe('moderator');
      expect(response.data.permissions).toContain('fire_events');
      expect(response.data.revenueShare).toBe(10);
    });

    it('should fail if non-owner tries to update', async () => {
      // Get collaborator ID
      const listResponse = await api(`/api/collaborators/${liveEpisode.id}`, {
        token: owner.token,
      });
      const collab = listResponse.data[0];

      const response = await api(`/api/collaborators/${liveEpisode.id}/${collab.id}`, {
        method: 'PATCH',
        token: collaborator.token,
        body: { role: 'co-host' },
      });

      expect(response.success).toBe(false);
    });
  });

  describe('My Collaborations', () => {
    it('should list episodes where user is collaborating', async () => {
      const response = await api('/api/collaborators/my/collaborating', {
        token: collaborator.token,
      });

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);

      // Should include the live episode
      const collab = response.data.find(
        (c: any) => c.episode.id === liveEpisode.id
      );
      expect(collab).toBeDefined();
    });
  });

  describe('Leave/Remove Collaborator', () => {
    let testEpisode2: any;
    let collab2: { user: any; token: string };

    beforeAll(async () => {
      // Create another episode for leave/remove tests
      collab2 = await createTestStreamer(`collab2_${randomString()}`);

      testEpisode2 = await createTestEpisode(owner.token, {
        name: 'Leave Test Episode',
        events: [{ name: 'Test' }],
      });
      await launchEpisode(testEpisode2.id, owner.token);

      // Invite and accept
      await api(`/api/collaborators/${testEpisode2.id}/invite`, {
        method: 'POST',
        token: owner.token,
        body: { username: collab2.user.username },
      });

      const invitationsResponse = await api('/api/collaborators/invitations/pending', {
        token: collab2.token,
      });
      const invitation = invitationsResponse.data.find(
        (inv: any) => inv.episode.id === testEpisode2.id
      );

      await api(`/api/collaborators/invitations/${invitation.id}/accept`, {
        method: 'POST',
        token: collab2.token,
      });
    });

    it('should allow collaborator to leave', async () => {
      const response = await api(`/api/collaborators/${testEpisode2.id}/leave`, {
        method: 'POST',
        token: collab2.token,
      });

      expect(response.success).toBe(true);

      // Verify they're no longer a collaborator
      const collaborationsResponse = await api('/api/collaborators/my/collaborating', {
        token: collab2.token,
      });

      const stillCollab = collaborationsResponse.data.find(
        (c: any) => c.episode.id === testEpisode2.id
      );
      expect(stillCollab).toBeUndefined();
    });

    it('should allow owner to remove collaborator', async () => {
      // Re-invite collab2
      await api(`/api/collaborators/${testEpisode2.id}/invite`, {
        method: 'POST',
        token: owner.token,
        body: { username: collab2.user.username },
      });

      const invitationsResponse = await api('/api/collaborators/invitations/pending', {
        token: collab2.token,
      });
      const invitation = invitationsResponse.data.find(
        (inv: any) => inv.episode.id === testEpisode2.id
      );

      await api(`/api/collaborators/invitations/${invitation.id}/accept`, {
        method: 'POST',
        token: collab2.token,
      });

      // Get collaborator ID
      const listResponse = await api(`/api/collaborators/${testEpisode2.id}`, {
        token: owner.token,
      });
      const collabRecord = listResponse.data.find(
        (c: any) => c.user.username === collab2.user.username
      );

      // Remove collaborator
      const response = await api(`/api/collaborators/${testEpisode2.id}/${collabRecord.id}`, {
        method: 'DELETE',
        token: owner.token,
      });

      expect(response.success).toBe(true);
    });
  });

  describe('Decline Invitation', () => {
    let declineInvitationId: string;

    beforeAll(async () => {
      // Create new episode and invitation for decline test
      const declineEpisode = await createTestEpisode(owner.token, {
        name: 'Decline Test Episode',
        events: [{ name: 'Test' }],
      });
      await launchEpisode(declineEpisode.id, owner.token);

      const newCollab = await createTestStreamer(`decline_collab_${randomString()}`);

      await api(`/api/collaborators/${declineEpisode.id}/invite`, {
        method: 'POST',
        token: owner.token,
        body: { username: newCollab.user.username },
      });

      const invitationsResponse = await api('/api/collaborators/invitations/pending', {
        token: newCollab.token,
      });
      declineInvitationId = invitationsResponse.data[0].id;

      // Store for test
      (global as any).__newCollab = newCollab;
    });

    it('should decline invitation', async () => {
      const newCollab = (global as any).__newCollab;

      const response = await api(`/api/collaborators/invitations/${declineInvitationId}/decline`, {
        method: 'POST',
        token: newCollab.token,
      });

      expect(response.success).toBe(true);

      // Verify invitation is declined
      const invitationsResponse = await api('/api/collaborators/invitations/pending', {
        token: newCollab.token,
      });

      const stillPending = invitationsResponse.data.find(
        (inv: any) => inv.id === declineInvitationId
      );
      expect(stillPending).toBeUndefined();
    });
  });
});
