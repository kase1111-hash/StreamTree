import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { prisma } from './db/client.js';
import { setupWebSocket } from './websocket/server.js';
import { episodesRouter } from './routes/episodes.js';
import { cardsRouter } from './routes/cards.js';
import { usersRouter } from './routes/users.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { errorHandler } from './middleware/error.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes (no auth)
app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/episodes', authMiddleware, episodesRouter);
app.use('/api/cards', authMiddleware, cardsRouter);
app.use('/api/users', authMiddleware, usersRouter);

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

    httpServer.listen(PORT, () => {
      console.log(`API server running on port ${PORT}`);
      console.log(`WebSocket server ready`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
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
