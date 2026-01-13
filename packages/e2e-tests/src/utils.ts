/**
 * Test utilities for E2E tests
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
}

/**
 * Make an API request
 */
export async function api<T = any>(
  endpoint: string,
  options: {
    method?: string;
    body?: any;
    token?: string;
  } = {}
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return response.json();
}

/**
 * Create a test user and get auth token
 */
export async function createTestUser(username?: string): Promise<{
  user: any;
  token: string;
  refreshToken: string;
}> {
  const testUsername = username || `testuser_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const response = await api('/api/auth/custodial', {
    method: 'POST',
    body: { username: testUsername },
  });

  if (!response.success) {
    throw new Error(`Failed to create test user: ${response.error?.message}`);
  }

  return response.data;
}

/**
 * Create a test streamer
 */
export async function createTestStreamer(username?: string): Promise<{
  user: any;
  token: string;
}> {
  const { user, token } = await createTestUser(username);

  // Become a streamer
  const response = await api('/api/auth/become-streamer', {
    method: 'POST',
    token,
  });

  if (!response.success) {
    throw new Error(`Failed to become streamer: ${response.error?.message}`);
  }

  return {
    user: response.data.user,
    token: response.data.token,
  };
}

/**
 * Create a test episode
 */
export async function createTestEpisode(
  token: string,
  options?: {
    name?: string;
    gridSize?: number;
    events?: Array<{ name: string; icon?: string }>;
  }
): Promise<any> {
  const name = options?.name || `Test Episode ${Date.now()}`;
  const gridSize = options?.gridSize || 5;

  // Create episode
  const createResponse = await api('/api/episodes', {
    method: 'POST',
    token,
    body: { name, gridSize },
  });

  if (!createResponse.success) {
    throw new Error(`Failed to create episode: ${createResponse.error?.message}`);
  }

  const episode = createResponse.data;

  // Add events if specified
  if (options?.events && options.events.length > 0) {
    for (const event of options.events) {
      await api(`/api/episodes/${episode.id}/events`, {
        method: 'POST',
        token,
        body: event,
      });
    }
  }

  // Get updated episode with events
  const getResponse = await api(`/api/episodes/${episode.id}`, { token });
  return getResponse.data;
}

/**
 * Launch an episode
 */
export async function launchEpisode(episodeId: string, token: string): Promise<any> {
  const response = await api(`/api/episodes/${episodeId}/launch`, {
    method: 'POST',
    token,
  });

  if (!response.success) {
    throw new Error(`Failed to launch episode: ${response.error?.message}`);
  }

  return response.data;
}

/**
 * End an episode
 */
export async function endEpisode(episodeId: string, token: string): Promise<any> {
  const response = await api(`/api/episodes/${episodeId}/end`, {
    method: 'POST',
    token,
  });

  if (!response.success) {
    throw new Error(`Failed to end episode: ${response.error?.message}`);
  }

  return response.data;
}

/**
 * Generate random string
 */
export function randomString(length = 8): string {
  return Math.random().toString(36).slice(2, 2 + length);
}
