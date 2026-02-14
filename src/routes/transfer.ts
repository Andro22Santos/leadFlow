import { Router, Request, Response } from 'express';
import {
  findConversationByPhone,
  updateConversationMode,
} from '../conversations/repository';
import { sendWhatsAppMessage } from '../whatsapp/client';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /conversations/:phone/transfer
 * Transfer a conversation to a human agent
 */
router.post('/conversations/:phone/transfer', async (req: Request, res: Response) => {
  try {
    const phone = req.params.phone as string;
    const { agentName } = req.body;

    const conversation = await findConversationByPhone(phone);
    if (!conversation) {
      return res.status(404).json({ error: 'No active conversation found' });
    }

    if (conversation.mode === 'human') {
      return res.json({
        success: true,
        message: 'Conversation is already in human mode',
      });
    }

    // Update conversation mode
    await updateConversationMode(
      conversation.id,
      'human',
      agentName || 'Atendente'
    );

    // Notify customer
    try {
      await sendWhatsAppMessage(
        phone,
        'Vou te encaminhar para um dos nossos especialistas que pode te ajudar melhor! Um momento 😊'
      );
    } catch (err) {
      logger.warn('Could not send transfer notification via WhatsApp');
    }

    logger.info('Conversation transferred to human', { phone, agentName });

    return res.json({
      success: true,
      message: `Conversation transferred to ${agentName || 'human agent'}`,
      conversation: {
        id: conversation.id,
        phone: conversation.phone_number,
        mode: 'human',
        assignedTo: agentName || 'Atendente',
      },
    });
  } catch (error: any) {
    logger.error('Error transferring conversation', { error: error.message });
    return res.status(500).json({ error: 'Failed to transfer conversation' });
  }
});

export default router;
