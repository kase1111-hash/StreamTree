import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { prisma } from './db/client.js';
import { setupWebSocket } from './websocket/server.js';
import { sanitizeError } from './utils/sanitize.js';
import { episodesRouter } from './routes/episodes.js';
import { cardsRouter } from './routes/cards.js';
import { usersRouter } from './routes/users.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { webhooksRouter } from './routes/webhooks.js';
import { paymentsRouter } from './routes/payments.js';
import { uploadRouter } from './routes/upload.js';
import { metadataRouter } from './routes/metadata.js';
import { twitchRouter } from './routes/twitch.js';
import { automationRouter } from './routes/automation.js';
import { templatesRouter } from './routes/templates.js';
import { collaboratorsRouter } from './routes/collaborators.js';
import { errorHandler } from './middleware/error.js';
import { authMiddleware } from './middleware/auth.js';
import {
  apiRateLimiter,
  authRateLimiter,
  publicRateLimiter,
  paymentRateLimiter,
} from './middleware/rateLimit.js';
import { csrfProtection, securityHeaders, setCsrfToken } from './middleware/csrf.js';
import { initializeWebhookSecretsCache } from './services/twitch.service.js';

const app = express();
const httpServer = createServer(app);

// CORS Configuration
// SECURITY: Validate and configure CORS origins
const corsOriginEnv = process.env.CORS_ORIGIN;
const isProduction = process.env.NODE_ENV === 'production';

/**
 * SECURITY: Validate and parse CORS origins
 * - Prevents wildcard (*) with credentials (insecure and browsers reject it)
 * - Validates URL format for each origin
 * - Supports comma-separated multiple origins
 */
function validateCorsOrigins(originEnv: string | undefined): string | string[] | false {
  if (!originEnv) {
    return false;
  }

  // SECURITY: Reject wildcard - it's incompatible with credentials:true
  // and would indicate a misconfiguration
  if (originEnv === '*') {
    console.error('SECURITY ERROR: CORS_ORIGIN=* is not allowed with credentials.');
    console.error('Please specify explicit origins (e.g., https://example.com)');
    return false;
  }

  // Support comma-separated origins
  const origins = originEnv.split(',').map(o => o.trim()).filter(Boolean);

  // Validate each origin
  const validOrigins: string[] = [];
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      // SECURITY: In production, require HTTPS (except localhost for testing)
      if (isProduction && url.protocol !== 'https:' && !url.hostname.includes('localhost')) {
        console.error(`SECURITY WARNING: Non-HTTPS origin in production: ${origin}`);
        continue;
      }
      validOrigins.push(origin);
    } catch {
      console.error(`SECURITY WARNING: Invalid CORS origin URL: ${origin}`);
    }
  }

  if (validOrigins.length === 0) {
    return false;
  }

  return validOrigins.length === 1 ? validOrigins[0] : validOrigins;
}

// Validate configured origins
const validatedOrigins = validateCorsOrigins(corsOriginEnv);

// Determine final CORS origin setting
let corsOrigin: string | string[] | boolean;
if (isProduction) {
  if (!validatedOrigins) {
    console.error('SECURITY WARNING: No valid CORS_ORIGIN set in production!');
    console.error('Falling back to restrictive CORS (no cross-origin requests allowed)');
  }
  corsOrigin = validatedOrigins || false;
} else {
  // Development mode
  if (validatedOrigins) {
    corsOrigin = validatedOrigins;
  } else {
    // Default to localhost in development only
    console.log('CORS: Using default localhost:3000 for development');
    corsOrigin = 'http://localhost:3000';
  }
}

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With'],
}));

// Security headers
app.use(securityHeaders);

// Cookie parser for CSRF tokens
app.use(cookieParser());

// Stripe webhooks need raw body
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// Regular JSON parsing for other routes
app.use(express.json({ limit: '10mb' }));

// CSRF protection for state-changing requests
app.use(csrfProtection);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// CSRF token endpoint
app.get('/api/auth/csrf-token', setCsrfToken);

// Apply global API rate limiter (skips webhooks)
app.use(apiRateLimiter);

// Webhook routes (no auth, signature verified, no rate limit)
app.use('/api/webhooks', webhooksRouter);

// Public routes (no auth, with rate limiting)
app.use('/api/public', publicRateLimiter, publicRouter);
app.use('/api/auth', authRateLimiter, authRouter);
app.use('/api/metadata', metadataRouter);

// Protected routes
app.use('/api/episodes', authMiddleware, episodesRouter);
app.use('/api/cards', authMiddleware, cardsRouter);
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api/payments', authMiddleware, paymentRateLimiter, paymentsRouter);
app.use('/api/upload', authMiddleware, uploadRouter);
app.use('/api/twitch', authMiddleware, twitchRouter);
app.use('/api/automation', authMiddleware, automationRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/collaborators', authMiddleware, collaboratorsRouter);

// Error handler
app.use(errorHandler);

// Setup WebSocket
const wss = setupWebSocket(httpServer);

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('Database connected');

    // Initialize Twitch webhook secrets cache from database
    // This ensures secrets survive server restarts
    await initializeWebhookSecretsCache();

    httpServer.listen(PORT, () => {
      console.log(`API server running on port ${PORT}`);
      console.log(`WebSocket server ready`);
    });
  } catch (error) {
    console.error('Failed to start server:', sanitizeError(error));
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await prisma.$disconnect();
  httpServer.close();
  process.exit(0);
});

start();

export { app, wss };
