import { Router, Request, Response } from 'express';
import { processIncomingMessage } from '../conversations/conversation-manager';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /simulate
 * Simulates an incoming WhatsApp message for testing
 * Accepts optional `force: true` to bypass business hours check
 */
router.post('/simulate', async (req: Request, res: Response) => {
  try {
    const { phone, message, force } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        error: 'Missing required fields: phone, message',
        example: {
          phone: '5511999999999',
          message: 'Oi, quero avaliar meu carro',
          force: true,
        },
      });
    }

    logger.info('Simulating incoming message', { phone, message, force: !!force });

    const response = await processIncomingMessage(phone, message, !!force);

    return res.json({
      success: true,
      phone,
      incomingMessage: message,
      botResponse: response,
      note: 'This is a simulation - no WhatsApp message was actually sent',
    });
  } catch (error: any) {
    logger.error('Simulation error', { error: error.message });
    return res.status(500).json({
      error: 'Failed to process simulated message',
      details: error.message,
    });
  }
});

export default router;
