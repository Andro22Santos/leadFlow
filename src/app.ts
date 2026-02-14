import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import { initDatabase, runMigrations } from './config/database';
import { validateAIConfig } from './config/ai-providers';
import { startWhatsApp, stopPendingMessageFlusher } from './whatsapp/client';
import { registerMessageHandlers } from './whatsapp/message-handler';
import { startFollowUpScheduler, stopFollowUpScheduler } from './scheduling/follow-up';
import { logger } from './utils/logger';

// Routes
import healthRoutes from './routes/health';
import simulateRoutes from './routes/simulate';
import conversationRoutes from './routes/conversations';
import transferRoutes from './routes/transfer';
import appointmentRoutes from './routes/appointments';
import whatsappRoutes from './routes/whatsapp';
import statsRoutes from './routes/stats';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`, {
    query: req.query,
    body: req.method === 'POST' ? req.body : undefined,
  });
  next();
});

// Routes
app.use('/', healthRoutes);
app.use('/', simulateRoutes);
app.use('/', conversationRoutes);
app.use('/', transferRoutes);
app.use('/', appointmentRoutes);
app.use('/', whatsappRoutes);
app.use('/', statsRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'LeadFlow',
    version: '1.0.0',
    description: 'Lead Manager V1 - Atendimento automatizado via WhatsApp com IA',
    endpoints: {
      health: 'GET /health',
      simulate: 'POST /simulate',
      whatsappQR: 'GET /whatsapp/qr',
      whatsappStatus: 'GET /whatsapp/status',
      conversations: 'GET /conversations',
      conversationByPhone: 'GET /conversations/:phone',
      transferToHuman: 'POST /conversations/:phone/transfer',
      appointments: 'GET /appointments',
      appointmentsToday: 'GET /appointments/today',
      stats: 'GET /stats',
    },
  });
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Startup ─────────────────────────────────────────────────────

async function start(): Promise<void> {
  logger.info('=== LeadFlow V1 Starting ===');
  logger.info(`Environment: ${config.NODE_ENV}`);
  logger.info(`Bot Name: ${config.BOT_NAME}`);
  logger.info(`Brand: ${config.AI_BRAND_NAME}`);
  logger.info(`AI Provider: ${config.AI_PROVIDER}`);
  logger.info(`AI Role: ${config.AI_ROLE} | Mode: ${config.AI_MODE} | Style: ${config.PROMPT_STYLE}`);

  // Validate AI configuration
  try {
    validateAIConfig();
  } catch (error: any) {
    logger.error('AI configuration error', { error: error.message });
    logger.warn('Continuing without AI - simulation mode only');
  }

  // Initialize database
  try {
    await initDatabase();
    await runMigrations();
  } catch (error: any) {
    logger.error('Database initialization failed', { error: error.message });
    logger.warn('Continuing without database - some features may not work');
  }

  // Initialize WhatsApp with cleanup + retry
  try {
    await startWhatsApp();
    registerMessageHandlers();
    logger.info('WhatsApp client started');
  } catch (error: any) {
    logger.error('WhatsApp initialization failed', { error: error.message });
    logger.warn('Continuing without WhatsApp - messages will be queued');
    // Register handlers anyway — they'll work once WhatsApp reconnects
    registerMessageHandlers();
  }

  // Start follow-up scheduler
  startFollowUpScheduler();

  // Start HTTP server
  const PORT = config.PORT;
  app.listen(PORT, () => {
    logger.info(`\n🟢 LeadFlow server running at http://localhost:${PORT}`);
    logger.info(`📱 WhatsApp QR Code: http://localhost:${PORT}/whatsapp/qr`);
    logger.info(`🧪 Simulate endpoint: POST http://localhost:${PORT}/simulate`);
    logger.info(`❤️ Health check: http://localhost:${PORT}/health\n`);
  });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  stopFollowUpScheduler();
  stopPendingMessageFlusher();
  const { closeDatabase } = await import('./config/database');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  stopFollowUpScheduler();
  stopPendingMessageFlusher();
  const { closeDatabase } = await import('./config/database');
  await closeDatabase();
  process.exit(0);
});

start().catch((error) => {
  logger.error('Fatal startup error', { error: error.message });
  process.exit(1);
});

export default app;
