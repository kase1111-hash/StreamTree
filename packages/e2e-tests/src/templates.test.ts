import { describe, it, expect, beforeAll } from 'vitest';
import {
  api,
  createTestStreamer,
  createTestEpisode,
  launchEpisode,
  endEpisode,
  randomString,
} from './utils';

describe('Templates API', () => {
  let streamer1: { user: any; token: string };
  let streamer2: { user: any; token: string };
  let testEpisode: any;

  beforeAll(async () => {
    // Create two test streamers
    streamer1 = await createTestStreamer(`streamer1_${randomString()}`);
    streamer2 = await createTestStreamer(`streamer2_${randomString()}`);

    // Create an episode with events for streamer1
    testEpisode = await createTestEpisode(streamer1.token, {
      name: 'Template Test Episode',
      gridSize: 5,
      events: [
        { name: 'First Blood', icon: '🩸' },
        { name: 'Victory Royale', icon: '👑' },
        { name: 'Rage Quit', icon: '😤' },
        { name: 'Epic Fail', icon: '💀' },
        { name: 'Clutch Play', icon: '🎯' },
      ],
    });

    // Launch and end the episode so we can save it as a template
    await launchEpisode(testEpisode.id, streamer1.token);
    await endEpisode(testEpisode.id, streamer1.token);
  });

  describe('Create Template', () => {
    it('should create a template from events', async () => {
      const response = await api('/api/templates', {
        method: 'POST',
        token: streamer1.token,
        body: {
          name: 'Gaming Template ' + randomString(),
          description: 'A test gaming template',
          category: 'gaming',
          events: [
            { name: 'First Blood', icon: '🩸' },
            { name: 'Victory Royale', icon: '👑' },
          ],
          gridSize: 5,
          isPublic: false,
        },
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.name).toContain('Gaming Template');
      expect(response.data.category).toBe('gaming');
      expect(response.data.events).toHaveLength(2);
      expect(response.data.isPublic).toBe(false);
    });

    it('should fail to create template without name', async () => {
      const response = await api('/api/templates', {
        method: 'POST',
        token: streamer1.token,
        body: {
          events: [{ name: 'Test Event' }],
        },
      });

      expect(response.success).toBe(false);
    });

    it('should fail to create template without events', async () => {
      const response = await api('/api/templates', {
        method: 'POST',
        token: streamer1.token,
        body: {
          name: 'Empty Template',
          events: [],
        },
      });

      expect(response.success).toBe(false);
    });
  });

  describe('Save Episode as Template', () => {
    it('should save an ended episode as a template', async () => {
      const response = await api(`/api/templates/from-episode/${testEpisode.id}`, {
        method: 'POST',
        token: streamer1.token,
        body: {
          name: 'From Episode Template ' + randomString(),
          description: 'Created from an episode',
          category: 'gaming',
          isPublic: true,
        },
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.events).toHaveLength(5);
      expect(response.data.isPublic).toBe(true);
    });

    it('should fail to save template from another user\'s episode', async () => {
      const response = await api(`/api/templates/from-episode/${testEpisode.id}`, {
        method: 'POST',
        token: streamer2.token,
        body: {
          name: 'Stolen Template',
        },
      });

      expect(response.success).toBe(false);
    });
  });

  describe('Browse Templates', () => {
    let publicTemplate: any;

    beforeAll(async () => {
      // Create a public template
      const response = await api('/api/templates', {
        method: 'POST',
        token: streamer1.token,
        body: {
          name: 'Public Browse Template ' + randomString(),
          description: 'A public template for browsing',
          category: 'gaming',
          events: [
            { name: 'Event 1', icon: '🎮' },
            { name: 'Event 2', icon: '🎯' },
          ],
          gridSize: 5,
          isPublic: true,
        },
      });
      publicTemplate = response.data;
    });

    it('should browse public templates without auth', async () => {
      const response = await api('/api/templates/browse');

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should filter templates by category', async () => {
      const response = await api('/api/templates/browse?category=gaming');

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
      // All returned templates should be in the gaming category
      response.data.forEach((template: any) => {
        expect(template.category).toBe('gaming');
      });
    });

    it('should sort templates by popularity', async () => {
      const response = await api('/api/templates/browse?sort=popular');

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  describe('My Templates', () => {
    it('should list user\'s own templates', async () => {
      const response = await api('/api/templates/my', {
        token: streamer1.token,
      });

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
      // All templates should belong to streamer1
      response.data.forEach((template: any) => {
        expect(template.creatorId).toBe(streamer1.user.id);
      });
    });

    it('should require authentication', async () => {
      const response = await api('/api/templates/my');

      expect(response.success).toBe(false);
    });
  });

  describe('Update Template', () => {
    let templateToUpdate: any;

    beforeAll(async () => {
      const response = await api('/api/templates', {
        method: 'POST',
        token: streamer1.token,
        body: {
          name: 'Update Test Template',
          events: [{ name: 'Test Event' }],
          isPublic: false,
        },
      });
      templateToUpdate = response.data;
    });

    it('should update template name', async () => {
      const newName = 'Updated Template Name ' + randomString();
      const response = await api(`/api/templates/${templateToUpdate.id}`, {
        method: 'PATCH',
        token: streamer1.token,
        body: { name: newName },
      });

      expect(response.success).toBe(true);
      expect(response.data.name).toBe(newName);
    });

    it('should update template visibility', async () => {
      const response = await api(`/api/templates/${templateToUpdate.id}`, {
        method: 'PATCH',
        token: streamer1.token,
        body: { isPublic: true },
      });

      expect(response.success).toBe(true);
      expect(response.data.isPublic).toBe(true);
    });

    it('should fail to update another user\'s template', async () => {
      const response = await api(`/api/templates/${templateToUpdate.id}`, {
        method: 'PATCH',
        token: streamer2.token,
        body: { name: 'Hacked Name' },
      });

      expect(response.success).toBe(false);
    });
  });

  describe('Use Template', () => {
    let templateToUse: any;

    beforeAll(async () => {
      const response = await api('/api/templates', {
        method: 'POST',
        token: streamer1.token,
        body: {
          name: 'Template To Use',
          events: [
            { name: 'Event A', icon: '🅰️' },
            { name: 'Event B', icon: '🅱️' },
            { name: 'Event C', icon: '🅾️' },
          ],
          gridSize: 4,
          isPublic: true,
        },
      });
      templateToUse = response.data;
    });

    it('should create episode from template', async () => {
      const episodeName = 'Episode from Template ' + randomString();
      const response = await api(`/api/templates/${templateToUse.id}/use`, {
        method: 'POST',
        token: streamer1.token,
        body: {
          episodeName,
          cardPrice: 100,
          maxCards: 50,
        },
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.name).toBe(episodeName);
      expect(response.data.gridSize).toBe(4); // Should inherit grid size
      expect(response.data.cardPrice).toBe(100);
      expect(response.data.maxCards).toBe(50);
      expect(response.data.eventDefinitions).toHaveLength(3);
    });

    it('should allow other users to use public template', async () => {
      const response = await api(`/api/templates/${templateToUse.id}/use`, {
        method: 'POST',
        token: streamer2.token,
        body: {
          episodeName: 'Another User Episode ' + randomString(),
        },
      });

      expect(response.success).toBe(true);
      expect(response.data.eventDefinitions).toHaveLength(3);
    });

    it('should increment usage count', async () => {
      // Get template before use
      const beforeResponse = await api(`/api/templates/${templateToUse.id}`, {
        token: streamer1.token,
      });
      const beforeCount = beforeResponse.data.usageCount;

      // Use template
      await api(`/api/templates/${templateToUse.id}/use`, {
        method: 'POST',
        token: streamer1.token,
        body: { episodeName: 'Usage Count Test ' + randomString() },
      });

      // Get template after use
      const afterResponse = await api(`/api/templates/${templateToUse.id}`, {
        token: streamer1.token,
      });

      expect(afterResponse.data.usageCount).toBe(beforeCount + 1);
    });
  });

  describe('Delete Template', () => {
    it('should delete own template', async () => {
      // Create a template to delete
      const createResponse = await api('/api/templates', {
        method: 'POST',
        token: streamer1.token,
        body: {
          name: 'Template to Delete',
          events: [{ name: 'Test' }],
        },
      });
      const templateId = createResponse.data.id;

      // Delete it
      const deleteResponse = await api(`/api/templates/${templateId}`, {
        method: 'DELETE',
        token: streamer1.token,
      });

      expect(deleteResponse.success).toBe(true);

      // Verify it's deleted
      const getResponse = await api(`/api/templates/${templateId}`, {
        token: streamer1.token,
      });

      expect(getResponse.success).toBe(false);
    });

    it('should fail to delete another user\'s template', async () => {
      // Create a template with streamer1
      const createResponse = await api('/api/templates', {
        method: 'POST',
        token: streamer1.token,
        body: {
          name: 'Protected Template',
          events: [{ name: 'Test' }],
        },
      });
      const templateId = createResponse.data.id;

      // Try to delete with streamer2
      const deleteResponse = await api(`/api/templates/${templateId}`, {
        method: 'DELETE',
        token: streamer2.token,
      });

      expect(deleteResponse.success).toBe(false);
    });
  });
});
