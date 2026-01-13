// Test setup file
// This runs before all tests

import { beforeAll, afterAll } from 'vitest';

// Set test environment variables
process.env.API_URL = process.env.API_URL || 'http://localhost:3001';

beforeAll(async () => {
  console.log('Starting E2E tests...');
  console.log('API URL:', process.env.API_URL);
});

afterAll(async () => {
  console.log('E2E tests completed.');
});
