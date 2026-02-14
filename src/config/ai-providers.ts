import { config } from './env';
import { logger } from '../utils/logger';

export type AIProviderType = 'openai' | 'gemini';

export function getActiveProvider(): AIProviderType {
  const provider = config.AI_PROVIDER;

  if (provider === 'openai' && !config.OPENAI_API_KEY) {
    logger.warn('OpenAI selected but API key missing, falling back to Gemini');
    return 'gemini';
  }

  if (provider === 'gemini' && !config.GEMINI_API_KEY) {
    logger.warn('Gemini selected but API key missing, falling back to OpenAI');
    return 'openai';
  }

  return provider;
}

export function validateAIConfig(): void {
  const provider = config.AI_PROVIDER;

  if (provider === 'openai' && !config.OPENAI_API_KEY) {
    if (!config.GEMINI_API_KEY) {
      throw new Error('No AI API key configured. Set OPENAI_API_KEY or GEMINI_API_KEY');
    }
  }

  if (provider === 'gemini' && !config.GEMINI_API_KEY) {
    if (!config.OPENAI_API_KEY) {
      throw new Error('No AI API key configured. Set GEMINI_API_KEY or OPENAI_API_KEY');
    }
  }

  logger.info(`AI Provider configured: ${getActiveProvider()}`);
}
