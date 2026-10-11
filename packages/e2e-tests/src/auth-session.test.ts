import { describe, it, expect } from 'vitest';
import { api } from './utils';

describe('Auth session check', () => {
  // The web app calls GET /api/auth/me on every page load. The strict auth rate
  // limiter allows 10 requests per 15 minutes per IP, so if it counted these,
  // signed-in users would appear logged out after a handful of reloads.
  it('is not counted by the strict auth rate limiter', async () => {
    for (let i = 1; i <= 12; i++) {
      const response = await api('/api/auth/me');
      expect(response.success, `GET /api/auth/me #${i}: ${response.error?.code}`).toBe(true);
    }
  });
});
