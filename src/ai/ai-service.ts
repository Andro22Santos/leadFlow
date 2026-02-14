import { getActiveProvider } from '../config/ai-providers';
import { config, PromptStyle } from '../config/env';
import { logger } from '../utils/logger';
import { ConversationContext, AIResponse } from '../conversations/models';
import { chatOpenAI } from './openai-provider';
import { chatGemini } from './gemini-provider';

/**
 * Main AI service - routes requests to the active AI provider
 */
export async function generateAIResponse(context: ConversationContext): Promise<AIResponse> {
  const provider = getActiveProvider();
  const promptStyle: PromptStyle = config.PROMPT_STYLE || 'standard';

  logger.debug('Generating AI response', {
    provider,
    promptStyle,
    role: config.AI_ROLE,
    mode: config.AI_MODE,
    phone: context.conversation.phone_number,
    messageCount: context.recentMessages.length,
  });

  let response: AIResponse;

  try {
    if (provider === 'openai') {
      response = await chatOpenAI(context, promptStyle);
    } else {
      response = await chatGemini(context, promptStyle);
    }
  } catch (error: any) {
    logger.error('AI service error, trying fallback', { provider, error: error.message });

    try {
      if (provider === 'openai') {
        response = await chatGemini(context, promptStyle);
      } else {
        response = await chatOpenAI(context, promptStyle);
      }
      logger.info('Fallback AI provider succeeded');
    } catch (fallbackError: any) {
      logger.error('Both AI providers failed', { error: fallbackError.message });
      response = {
        message: 'Desculpe, estou com uma dificuldade técnica no momento. Vou transferir para um atendente humano.',
        action: 'transfer',
        confidence: 0,
      };
    }
  }

  // Auto-transfer on low confidence
  if (response.confidence < 0.3 && response.action !== 'transfer') {
    logger.warn('Low confidence response, marking for transfer', {
      confidence: response.confidence,
    });
    response.action = 'transfer';
    response.message += '\n\nVou te encaminhar para um dos nossos especialistas que pode te ajudar melhor!';
  }

  return response;
}
