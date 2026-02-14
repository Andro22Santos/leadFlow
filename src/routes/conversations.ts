import { Router, Request, Response } from 'express';
import {
  listActiveConversations,
  getConversationsByPhone,
  getRecentMessages,
  findConversationByPhone,
} from '../conversations/repository';
import { sendHumanMessage, returnToAI } from '../conversations/conversation-manager';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /conversations
 * List all active conversations
 */
router.get('/conversations', async (_req: Request, res: Response) => {
  try {
    const conversations = await listActiveConversations();
    return res.json({
      count: conversations.length,
      conversations,
    });
  } catch (error: any) {
    logger.error('Error listing conversations', { error: error.message });
    return res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/**
 * GET /conversations/:phone
 * Get conversation history for a specific phone number
 */
router.get('/conversations/:phone', async (req: Request, res: Response) => {
  try {
    const phone = req.params.phone as string;
    const conversations = await getConversationsByPhone(phone);

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'No conversations found for this phone number' });
    }

    // Get messages for the most recent active conversation
    const activeConv = conversations.find((c) => c.status === 'active') || conversations[0];
    const messages = await getRecentMessages(activeConv.id, 50);

    return res.json({
      conversation: activeConv,
      messages,
    });
  } catch (error: any) {
    logger.error('Error getting conversation', { error: error.message });
    return res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * POST /conversations/:phone/message
 * Send a message from a human agent
 */
router.post('/conversations/:phone/message', async (req: Request, res: Response) => {
  try {
    const phone = req.params.phone as string;
    const { message, agentName } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Missing required field: message' });
    }

    await sendHumanMessage(phone, message, agentName || 'Atendente');

    return res.json({
      success: true,
      message: 'Message sent and recorded',
    });
  } catch (error: any) {
    logger.error('Error sending human message', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /conversations/:phone/return-to-ai
 * Return a conversation from human mode back to AI mode
 */
router.post('/conversations/:phone/return-to-ai', async (req: Request, res: Response) => {
  try {
    const phone = req.params.phone as string;
    await returnToAI(phone);

    return res.json({
      success: true,
      message: 'Conversation returned to AI mode',
    });
  } catch (error: any) {
    logger.error('Error returning to AI', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

export default router;
