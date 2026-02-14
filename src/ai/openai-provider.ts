import OpenAI from 'openai';
import { config, PromptStyle } from '../config/env';
import { logger } from '../utils/logger';
import { ConversationContext, AIResponse } from '../conversations/models';
import { buildSystemPrompt, buildMessageHistory } from './prompts';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return client;
}

export async function chatOpenAI(context: ConversationContext, promptStyle: PromptStyle = 'standard'): Promise<AIResponse> {
  const openai = getClient();
  const systemPrompt = buildSystemPrompt(config.BOT_NAME, promptStyle);
  const messageHistory = buildMessageHistory(context);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messageHistory,
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    logger.debug('OpenAI raw response', { content });

    const parsed = JSON.parse(content) as AIResponse;
    return {
      message: parsed.message || 'Desculpe, não consegui processar sua mensagem.',
      action: parsed.action || 'none',
      extractedData: parsed.extractedData || {},
      leadTemperature: parsed.leadTemperature || 'warm',
      confidence: parsed.confidence ?? 0.7,
    };
  } catch (error: any) {
    logger.error('OpenAI API error', { error: error.message });
    throw error;
  }
}
