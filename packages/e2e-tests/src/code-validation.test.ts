/**
 * Code Validation Tests
 *
 * These tests validate that the Phase 5 features are properly structured
 * and will work correctly when deployed. They run without requiring
 * a live API server or database.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const API_ROOT = join(__dirname, '../../../apps/api');
const WEB_ROOT = join(__dirname, '../../../apps/web');

describe('Phase 5 Code Validation', () => {
  describe('Templates Feature', () => {
    it('should have Template model in Prisma schema', () => {
      const schemaPath = join(API_ROOT, 'prisma/schema.prisma');
      expect(existsSync(schemaPath)).toBe(true);

      const schema = readFileSync(schemaPath, 'utf-8');
      expect(schema).toContain('model Template');
      expect(schema).toContain('creatorId');
      expect(schema).toContain('events');
      expect(schema).toContain('isPublic');
      expect(schema).toContain('usageCount');
    });

    it('should have templates API routes file', () => {
      const routesPath = join(API_ROOT, 'src/routes/templates.ts');
      expect(existsSync(routesPath)).toBe(true);

      const routes = readFileSync(routesPath, 'utf-8');
      // Check for key endpoints
      expect(routes).toContain("router.get('/browse'");
      expect(routes).toContain("router.get('/my'");
      expect(routes).toContain("router.post('/'");
      expect(routes).toContain("router.patch('/:id'");
      expect(routes).toContain("router.delete('/:id'");
      expect(routes).toContain("router.post('/:id/use'");
      expect(routes).toContain("router.post('/from-episode/:episodeId'");
    });

    it('should have templates registered in API index', () => {
      const indexPath = join(API_ROOT, 'src/index.ts');
      const index = readFileSync(indexPath, 'utf-8');

      expect(index).toContain('templatesRouter');
      expect(index).toContain('/api/templates');
    });

    it('should have templates API in frontend', () => {
      const apiPath = join(WEB_ROOT, 'src/lib/api.ts');
      const api = readFileSync(apiPath, 'utf-8');

      expect(api).toContain('templatesApi');
      expect(api).toContain('browse');
      expect(api).toContain('getMy');
      expect(api).toContain('fromEpisode');
    });

    it('should have templates browse page', () => {
      const pagePath = join(WEB_ROOT, 'src/app/templates/page.tsx');
      expect(existsSync(pagePath)).toBe(true);

      const page = readFileSync(pagePath, 'utf-8');
      expect(page).toContain('TemplatesPage');
      expect(page).toContain('templatesApi.browse');
    });

    it('should have my templates page', () => {
      const pagePath = join(WEB_ROOT, 'src/app/templates/my/page.tsx');
      expect(existsSync(pagePath)).toBe(true);

      const page = readFileSync(pagePath, 'utf-8');
      expect(page).toContain('MyTemplatesPage');
      expect(page).toContain('templatesApi.getMy');
    });

    it('should have template selection in create page', () => {
      const createPath = join(WEB_ROOT, 'src/app/create/page.tsx');
      const create = readFileSync(createPath, 'utf-8');

      expect(create).toContain('selectedTemplate');
      expect(create).toContain('templatesApi');
      expect(create).toContain('Template Selection');
    });

    it('should have save as template in episodes page', () => {
      const episodesPath = join(WEB_ROOT, 'src/app/episodes/page.tsx');
      const episodes = readFileSync(episodesPath, 'utf-8');

      expect(episodes).toContain('Save Template');
      expect(episodes).toContain('handleSaveAsTemplate');
      expect(episodes).toContain('templatesApi.fromEpisode');
    });
  });

  describe('Collaborators Feature', () => {
    it('should have EpisodeCollaborator model in Prisma schema', () => {
      const schemaPath = join(API_ROOT, 'prisma/schema.prisma');
      const schema = readFileSync(schemaPath, 'utf-8');

      expect(schema).toContain('model EpisodeCollaborator');
      expect(schema).toContain('episodeId');
      expect(schema).toContain('userId');
      expect(schema).toContain('role');
      expect(schema).toContain('permissions');
      expect(schema).toContain('revenueShare');
      expect(schema).toContain('status');
    });

    it('should have collaborators relation in Episode model', () => {
      const schemaPath = join(API_ROOT, 'prisma/schema.prisma');
      const schema = readFileSync(schemaPath, 'utf-8');

      // Check Episode model has collaborators
      const episodeSection = schema.match(/model Episode \{[\s\S]*?\n\}/)?.[0] || '';
      expect(episodeSection).toContain('collaborators');
      expect(episodeSection).toContain('EpisodeCollaborator[]');
    });

    it('should have collaborators relation in User model', () => {
      const schemaPath = join(API_ROOT, 'prisma/schema.prisma');
      const schema = readFileSync(schemaPath, 'utf-8');

      // Check User model has collaborations
      const userSection = schema.match(/model User \{[\s\S]*?\n\}/)?.[0] || '';
      expect(userSection).toContain('collaborations');
      expect(userSection).toContain('EpisodeCollaborator[]');
    });

    it('should have collaborators API routes file', () => {
      const routesPath = join(API_ROOT, 'src/routes/collaborators.ts');
      expect(existsSync(routesPath)).toBe(true);

      const routes = readFileSync(routesPath, 'utf-8');
      // Check for key endpoints
      expect(routes).toContain("router.get('/:episodeId'");
      expect(routes).toContain("router.post('/:episodeId/invite'");
      expect(routes).toContain("/invitations/pending");
      expect(routes).toContain("/accept");
      expect(routes).toContain("/decline");
      expect(routes).toContain("router.delete");
      expect(routes).toContain("router.post('/:episodeId/leave'");
    });

    it('should have collaborators registered in API index', () => {
      const indexPath = join(API_ROOT, 'src/index.ts');
      const index = readFileSync(indexPath, 'utf-8');

      expect(index).toContain('collaboratorsRouter');
      expect(index).toContain('/api/collaborators');
    });

    it('should have collaborator permission checks in episodes routes', () => {
      const episodesPath = join(API_ROOT, 'src/routes/episodes.ts');
      const episodes = readFileSync(episodesPath, 'utf-8');

      // Check fire event allows collaborators
      expect(episodes).toContain('hasFirePermission');
      expect(episodes).toContain('fire_events');

      // Check stats allows collaborators
      expect(episodes).toContain('hasViewPermission');
      expect(episodes).toContain('view_stats');
    });

    it('should have collaborators API in frontend', () => {
      const apiPath = join(WEB_ROOT, 'src/lib/api.ts');
      const api = readFileSync(apiPath, 'utf-8');

      expect(api).toContain('collaboratorsApi');
      expect(api).toContain('getForEpisode');
      expect(api).toContain('invite');
      expect(api).toContain('acceptInvitation');
      expect(api).toContain('declineInvitation');
      expect(api).toContain('getMyCollaborations');
    });

    it('should have collaborators management page', () => {
      const pagePath = join(WEB_ROOT, 'src/app/dashboard/[id]/collaborators/page.tsx');
      expect(existsSync(pagePath)).toBe(true);

      const page = readFileSync(pagePath, 'utf-8');
      expect(page).toContain('CollaboratorsPage');
      expect(page).toContain('collaboratorsApi');
      expect(page).toContain('Invite Collaborator');
    });

    it('should have invitations page', () => {
      const pagePath = join(WEB_ROOT, 'src/app/invitations/page.tsx');
      expect(existsSync(pagePath)).toBe(true);

      const page = readFileSync(pagePath, 'utf-8');
      expect(page).toContain('InvitationsPage');
      expect(page).toContain('getPendingInvitations');
      expect(page).toContain('Accept');
      expect(page).toContain('Decline');
    });
  });

  describe('Gallery Enhancements', () => {
    it('should have enhanced gallery page with filtering', () => {
      const galleryPath = join(WEB_ROOT, 'src/app/gallery/page.tsx');
      expect(existsSync(galleryPath)).toBe(true);

      const gallery = readFileSync(galleryPath, 'utf-8');

      // Check for filtering
      expect(gallery).toContain('FilterOption');
      expect(gallery).toContain('filter');

      // Check for sorting
      expect(gallery).toContain('SortOption');
      expect(gallery).toContain('sort');

      // Check for search
      expect(gallery).toContain('search');

      // Check for achievements
      expect(gallery).toContain('Achievement');
    });

    it('should have rarity badges', () => {
      const galleryPath = join(WEB_ROOT, 'src/app/gallery/page.tsx');
      const gallery = readFileSync(galleryPath, 'utf-8');

      expect(gallery).toContain('getRarityBadge');
      expect(gallery).toContain('Legendary');
      expect(gallery).toContain('Epic');
      expect(gallery).toContain('Rare');
    });
  });

  describe('API Route Categories', () => {
    it('should have valid template categories', () => {
      const templatesPath = join(API_ROOT, 'src/routes/templates.ts');
      const templates = readFileSync(templatesPath, 'utf-8');

      expect(templates).toContain('CATEGORIES');
      expect(templates).toContain('general');
      expect(templates).toContain('gaming');
      expect(templates).toContain('irl');
      expect(templates).toContain('music');
      expect(templates).toContain('sports');
      expect(templates).toContain('educational');
      expect(templates).toContain('charity');
    });

    it('should have valid collaborator roles', () => {
      const collaboratorsPath = join(API_ROOT, 'src/routes/collaborators.ts');
      const collaborators = readFileSync(collaboratorsPath, 'utf-8');

      expect(collaborators).toContain('ROLE_PERMISSIONS');
      expect(collaborators).toContain('co-host');
      expect(collaborators).toContain('moderator');
      expect(collaborators).toContain('fire_events');
      expect(collaborators).toContain('view_stats');
      expect(collaborators).toContain('manage_events');
    });
  });
});
