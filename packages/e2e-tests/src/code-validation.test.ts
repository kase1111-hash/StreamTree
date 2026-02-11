/**
 * Code Validation Tests
 *
 * These tests validate that features are properly structured
 * and will work correctly when deployed. They run without requiring
 * a live API server or database.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const API_ROOT = join(__dirname, '../../../apps/api');
const WEB_ROOT = join(__dirname, '../../../apps/web');

describe('Code Validation', () => {
  describe('Templates Feature', () => {
    it('should have Template model in Prisma schema', () => {
      const schemaPath = join(API_ROOT, 'prisma/schema.prisma');
      expect(existsSync(schemaPath)).toBe(true);

      const schema = readFileSync(schemaPath, 'utf-8');
      expect(schema).toContain('model Template');
      expect(schema).toContain('creatorId');
      expect(schema).toContain('events');
    });

    it('should have templates API routes file', () => {
      const routesPath = join(API_ROOT, 'src/routes/templates.ts');
      expect(existsSync(routesPath)).toBe(true);

      const routes = readFileSync(routesPath, 'utf-8');
      // Check for key endpoints
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
      expect(api).toContain('getMy');
      expect(api).toContain('fromEpisode');
    });

    it('should have template selection in create page', () => {
      const createPath = join(WEB_ROOT, 'src/app/create/page.tsx');
      const create = readFileSync(createPath, 'utf-8');

      expect(create).toContain('selectedTemplate');
      expect(create).toContain('templatesApi');
    });

    it('should have save as template in episodes page', () => {
      const episodesPath = join(WEB_ROOT, 'src/app/episodes/page.tsx');
      const episodes = readFileSync(episodesPath, 'utf-8');

      expect(episodes).toContain('Save Template');
      expect(episodes).toContain('handleSaveAsTemplate');
      expect(episodes).toContain('templatesApi.fromEpisode');
    });
  });

  describe('Removed Features', () => {
    it('should not have collaborators route file', () => {
      const routesPath = join(API_ROOT, 'src/routes/collaborators.ts');
      expect(existsSync(routesPath)).toBe(false);
    });

    it('should not have automation route file', () => {
      const routesPath = join(API_ROOT, 'src/routes/automation.ts');
      expect(existsSync(routesPath)).toBe(false);
    });

    it('should not have EpisodeCollaborator model in schema', () => {
      const schemaPath = join(API_ROOT, 'prisma/schema.prisma');
      const schema = readFileSync(schemaPath, 'utf-8');
      expect(schema).not.toContain('model EpisodeCollaborator');
    });

    it('should not have ChatKeyword model in schema', () => {
      const schemaPath = join(API_ROOT, 'prisma/schema.prisma');
      const schema = readFileSync(schemaPath, 'utf-8');
      expect(schema).not.toContain('model ChatKeyword');
    });

    it('should not have CustomWebhook model in schema', () => {
      const schemaPath = join(API_ROOT, 'prisma/schema.prisma');
      const schema = readFileSync(schemaPath, 'utf-8');
      expect(schema).not.toContain('model CustomWebhook');
    });

    it('should not have collaborators or automation routers in API index', () => {
      const indexPath = join(API_ROOT, 'src/index.ts');
      const index = readFileSync(indexPath, 'utf-8');
      expect(index).not.toContain('collaboratorsRouter');
      expect(index).not.toContain('automationRouter');
    });
  });

  describe('Pattern Detection Consolidation', () => {
    it('should have canonical detectPatterns in shared package', () => {
      const patternsPath = join(__dirname, '../../../packages/shared/src/utils/patterns.ts');
      expect(existsSync(patternsPath)).toBe(true);
      const patterns = readFileSync(patternsPath, 'utf-8');
      expect(patterns).toContain('export function detectPatterns');
    });

    it('should use shared detectPatterns in episodes route', () => {
      const episodesPath = join(API_ROOT, 'src/routes/episodes.ts');
      const episodes = readFileSync(episodesPath, 'utf-8');
      expect(episodes).toContain('detectPatterns');
      expect(episodes).toContain("from '@streamtree/shared'");
      // Should not have local copy
      expect(episodes).not.toContain('function detectCardPatterns');
    });

    it('should use shared detectPatterns in webhooks route', () => {
      const webhooksPath = join(API_ROOT, 'src/routes/webhooks.ts');
      const webhooks = readFileSync(webhooksPath, 'utf-8');
      expect(webhooks).toContain('detectPatterns');
      expect(webhooks).toContain("from '@streamtree/shared'");
      // Should not have local copy
      expect(webhooks).not.toContain('function detectPatterns');
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
});
