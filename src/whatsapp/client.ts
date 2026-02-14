import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

let whatsappClient: Client | null = null;
let currentQR: string | null = null;
let isReady = false;
let connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

// ─── Pending Message Queue (in-memory, backed by DB) ─────────
interface PendingMessage {
  phone: string;
  message: string;
  createdAt: Date;
  retries: number;
}

const pendingQueue: PendingMessage[] = [];
const MAX_QUEUE_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours max age
let flushInterval: NodeJS.Timeout | null = null;

// ═══════════════════════════════════════════════════════════════
// CLEANUP: Kill orphan Puppeteer/Chrome processes before startup
// ═══════════════════════════════════════════════════════════════

/**
 * Kills any orphan Chromium/Puppeteer processes that would block startup.
 * Also removes stale lock files from the session directory.
 */
export async function cleanupOrphanBrowsers(): Promise<void> {
  logger.info('Cleaning up orphan browser processes...');

  try {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Kill Chrome processes launched by Puppeteer (check command line for puppeteer path)
      await execPromise(
        'wmic process where "ExecutablePath like \'%puppeteer%\' or ExecutablePath like \'%chromium%\'" call terminate 2>nul'
      ).catch(() => {}); // Ignore errors if no processes found
    } else {
      // Linux/Mac: kill chromium processes from puppeteer cache
      await execPromise(
        "pkill -f 'chromium.*puppeteer' || true"
      ).catch(() => {});
    }

    // Remove SingletonLock file that prevents browser from starting
    const sessionPath = config.WHATSAPP_SESSION_PATH || './.wwebjs_auth';
    const lockPatterns = [
      path.join(sessionPath, 'session', 'SingletonLock'),
      path.join(sessionPath, 'session', 'SingletonSocket'),
      path.join(sessionPath, 'session', 'SingletonCookie'),
    ];

    for (const lockFile of lockPatterns) {
      try {
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
          logger.info('Removed stale lock file', { file: lockFile });
        }
      } catch {
        // Ignore — file might not exist or be locked
      }
    }

    logger.info('Browser cleanup complete');
  } catch (error: any) {
    logger.warn('Browser cleanup had issues (non-fatal)', { error: error.message });
  }
}

function execPromise(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout || stderr);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// WHATSAPP CLIENT
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize the WhatsApp client (does NOT call .initialize())
 */
export function initWhatsAppClient(): Client {
  if (whatsappClient) return whatsappClient;

  logger.info('Initializing WhatsApp client...');
  connectionStatus = 'connecting';

  whatsappClient = new Client({
    authStrategy: new LocalAuth({
      dataPath: config.WHATSAPP_SESSION_PATH,
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
      ],
    },
  });

  // QR Code event
  whatsappClient.on('qr', (qr: string) => {
    currentQR = qr;
    logger.info('QR Code received - scan with WhatsApp');
    qrcodeTerminal.generate(qr, { small: true });
  });

  // Ready event — flush pending queue
  whatsappClient.on('ready', () => {
    isReady = true;
    connectionStatus = 'connected';
    currentQR = null;
    logger.info('WhatsApp client is ready!');

    // Flush any pending messages
    flushPendingMessages();
  });

  // Authenticated event
  whatsappClient.on('authenticated', () => {
    logger.info('WhatsApp client authenticated');
  });

  // Auth failure
  whatsappClient.on('auth_failure', (msg: string) => {
    logger.error('WhatsApp authentication failed', { message: msg });
    connectionStatus = 'disconnected';
  });

  // Disconnected event — auto-reconnect with backoff
  whatsappClient.on('disconnected', (reason: string) => {
    isReady = false;
    connectionStatus = 'disconnected';
    currentQR = null;
    logger.warn('WhatsApp client disconnected', { reason });

    // Auto-reconnect with increasing delay
    scheduleReconnect(5000);
  });

  return whatsappClient;
}

// ═══════════════════════════════════════════════════════════════
// STARTUP WITH RETRY
// ═══════════════════════════════════════════════════════════════

const MAX_STARTUP_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 30000]; // 5s, 15s, 30s

/**
 * Start WhatsApp with retry logic.
 * Cleans up orphan browsers, then tries to initialize up to MAX_STARTUP_RETRIES times.
 */
export async function startWhatsApp(): Promise<void> {
  // Step 1: Clean orphan processes
  await cleanupOrphanBrowsers();

  // Step 2: Initialize client with retries
  const client = initWhatsAppClient();

  for (let attempt = 1; attempt <= MAX_STARTUP_RETRIES; attempt++) {
    try {
      logger.info(`WhatsApp init attempt ${attempt}/${MAX_STARTUP_RETRIES}...`);
      await client.initialize();
      logger.info('WhatsApp client initialized successfully');

      // Start periodic flush of pending messages
      startPendingMessageFlusher();
      return; // Success
    } catch (error: any) {
      logger.error(`WhatsApp init attempt ${attempt} failed`, { error: error.message });

      if (attempt < MAX_STARTUP_RETRIES) {
        const delay = RETRY_DELAYS[attempt - 1] || 30000;
        logger.info(`Retrying in ${delay / 1000}s...`);

        // Clean up again before retry
        whatsappClient = null;
        await cleanupOrphanBrowsers();
        await sleep(delay);

        // Re-create client
        initWhatsAppClient();
      } else {
        logger.error('All WhatsApp init attempts failed. Bot will run without WhatsApp.');
        logger.warn('Messages will be queued and sent when WhatsApp reconnects.');
        // Start flusher anyway — it will send when ready
        startPendingMessageFlusher();
      }
    }
  }
}

/**
 * Schedule a reconnect attempt after disconnect
 */
let reconnectAttempt = 0;
function scheduleReconnect(baseDelay: number): void {
  reconnectAttempt++;
  // Exponential backoff: 5s, 10s, 20s, 40s, max 60s
  const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempt - 1), 60000);

  logger.info(`Scheduling reconnect in ${delay / 1000}s (attempt ${reconnectAttempt})...`);

  setTimeout(async () => {
    try {
      await cleanupOrphanBrowsers();
      whatsappClient = null;
      const client = initWhatsAppClient();
      await client.initialize();
      reconnectAttempt = 0; // Reset on success
    } catch (error: any) {
      logger.error('Reconnect failed', { error: error.message, attempt: reconnectAttempt });
      if (reconnectAttempt < 10) {
        scheduleReconnect(baseDelay);
      } else {
        logger.error('Max reconnect attempts reached. Giving up auto-reconnect.');
      }
    }
  }, delay);
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE SENDING WITH QUEUE
// ═══════════════════════════════════════════════════════════════

/**
 * Send a message via WhatsApp.
 * If WhatsApp is offline, queues the message and sends when reconnected.
 */
export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  if (!whatsappClient || !isReady) {
    // Queue message for later delivery
    queueMessage(phone, message);
    return;
  }

  try {
    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    await whatsappClient.sendMessage(chatId, message);
    logger.debug('Message sent confirmed', { to: chatId });
    logger.debug('WhatsApp message sent', { phone, messageLength: message.length });
  } catch (error: any) {
    logger.error('Failed to send WhatsApp message', { phone, error: error.message });
    // Queue on send failure too (might be a transient error)
    queueMessage(phone, message);
  }
}

/**
 * Add a message to the pending queue
 */
function queueMessage(phone: string, message: string): void {
  // Avoid duplicate messages in queue
  const isDuplicate = pendingQueue.some(
    (m) => m.phone === phone && m.message === message && (Date.now() - m.createdAt.getTime()) < 60000
  );

  if (isDuplicate) {
    logger.debug('Duplicate message skipped in queue', { phone });
    return;
  }

  pendingQueue.push({
    phone,
    message,
    createdAt: new Date(),
    retries: 0,
  });

  logger.info('Message queued for later delivery', {
    phone,
    queueSize: pendingQueue.length,
    messagePreview: message.substring(0, 50),
  });
}

/**
 * Flush all pending messages (called when WhatsApp reconnects)
 */
async function flushPendingMessages(): Promise<void> {
  if (pendingQueue.length === 0) return;

  logger.info(`Flushing ${pendingQueue.length} pending messages...`);
  const now = Date.now();

  // Process queue (drain it)
  const toSend = [...pendingQueue];
  pendingQueue.length = 0; // Clear queue

  let sent = 0;
  let expired = 0;
  let failed = 0;

  for (const msg of toSend) {
    // Skip messages older than MAX_QUEUE_AGE
    if (now - msg.createdAt.getTime() > MAX_QUEUE_AGE_MS) {
      expired++;
      logger.debug('Expired queued message', { phone: msg.phone, age: `${Math.round((now - msg.createdAt.getTime()) / 60000)}min` });
      continue;
    }

    try {
      const chatId = msg.phone.includes('@c.us') ? msg.phone : `${msg.phone}@c.us`;
      await whatsappClient!.sendMessage(chatId, msg.message);
      sent++;

      // Small delay between messages to avoid rate limiting
      await sleep(1000);
    } catch (error: any) {
      failed++;
      logger.error('Failed to send queued message', { phone: msg.phone, error: error.message });

      // Re-queue if under 3 retries
      if (msg.retries < 3) {
        pendingQueue.push({ ...msg, retries: msg.retries + 1 });
      }
    }
  }

  logger.info('Pending message flush complete', { sent, expired, failed, remaining: pendingQueue.length });
}

/**
 * Start periodic flusher (checks every 2 minutes)
 */
function startPendingMessageFlusher(): void {
  if (flushInterval) return; // Already running

  flushInterval = setInterval(() => {
    if (isReady && pendingQueue.length > 0) {
      flushPendingMessages();
    }
  }, 2 * 60 * 1000); // Every 2 minutes
}

/**
 * Stop the pending message flusher
 */
export function stopPendingMessageFlusher(): void {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// GETTERS
// ═══════════════════════════════════════════════════════════════

export function getCurrentQR(): string | null {
  return currentQR;
}

export function getWhatsAppStatus(): {
  status: string;
  isReady: boolean;
  hasQR: boolean;
  pendingMessages: number;
} {
  return {
    status: connectionStatus,
    isReady,
    hasQR: currentQR !== null,
    pendingMessages: pendingQueue.length,
  };
}

export function getWhatsAppClient(): Client | null {
  return whatsappClient;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
