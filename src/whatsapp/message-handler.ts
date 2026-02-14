import { getWhatsAppClient, sendWhatsAppMessage } from './client';
import { processIncomingMessage } from '../conversations/conversation-manager';
import { logger } from '../utils/logger';

// Message queue for rate limiting outgoing messages
const messageQueue: Array<{ phone: string; message: string }> = [];
let isProcessingQueue = false;

/**
 * Registers WhatsApp message event listeners
 */
export function registerMessageHandlers(): void {
  const client = getWhatsAppClient();
  if (!client) {
    logger.error('WhatsApp client not initialized');
    return;
  }

  client.on('message', async (msg) => {
    try {
      // Ignore group messages, status updates, and own messages
      if (msg.from.includes('@g.us') || msg.from === 'status@broadcast' || msg.fromMe) {
        return;
      }

      // Extract phone number (remove @c.us suffix)
      const phone = msg.from.replace('@c.us', '');
      const messageBody = msg.body;

      if (!messageBody || messageBody.trim() === '') {
        return;
      }

      logger.info('WhatsApp message received', {
        phone,
        messageLength: messageBody.length,
      });

      // Process the message through the conversation manager
      const response = await processIncomingMessage(phone, messageBody);

      if (response) {
        // Queue the response for sending
        enqueueMessage(phone, response);
      }
    } catch (error: any) {
      logger.error('Error processing WhatsApp message', { error: error.message });
    }
  });

  // Handle message creation acknowledgment
  client.on('message_create', (msg) => {
    if (msg.fromMe) {
      logger.debug('Message sent confirmed', { to: msg.to });
    }
  });

  logger.info('WhatsApp message handlers registered');
}

/**
 * Enqueue a message for sending (rate limited)
 */
function enqueueMessage(phone: string, message: string): void {
  messageQueue.push({ phone, message });
  processQueue();
}

/**
 * Process the message queue with rate limiting (1 message per second)
 */
async function processQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (messageQueue.length > 0) {
    const item = messageQueue.shift();
    if (item) {
      try {
        await sendWhatsAppMessage(item.phone, item.message);
      } catch (error: any) {
        logger.error('Failed to send queued message', { error: error.message });
      }

      // Wait 1 second between messages to avoid being blocked
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  isProcessingQueue = false;
}
