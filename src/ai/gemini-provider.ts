import { GoogleGenerativeAI } from '@google/generative-ai';
import { config, PromptStyle } from '../config/env';
import { logger } from '../utils/logger';
import { ConversationContext, AIResponse } from '../conversations/models';
import { buildSystemPrompt, buildMessageHistory } from './prompts';

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  }
  return genAI;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiWithRetry(
  model: any,
  prompt: string,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      const is429 = error.message?.includes('429') || error.message?.includes('Resource exhausted');
      
      if (is429 && attempt < maxRetries) {
        const waitTime = attempt * 10000;
        logger.warn(`Gemini rate limited (attempt ${attempt}/${maxRetries}), waiting ${waitTime / 1000}s...`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exhausted');
}

export async function chatGemini(context: ConversationContext, promptStyle: PromptStyle = 'standard'): Promise<AIResponse> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

  const systemPrompt = buildSystemPrompt(config.BOT_NAME, promptStyle);
  const messageHistory = buildMessageHistory(context);

  const parts: string[] = [systemPrompt, ''];

  for (const msg of messageHistory) {
    if (msg.role === 'system') {
      parts.push(`[Sistema]: ${msg.content}`);
    } else if (msg.role === 'user') {
      parts.push(`[Cliente]: ${msg.content}`);
    } else if (msg.role === 'assistant') {
      parts.push(`[Assistente]: ${msg.content}`);
    }
  }

  parts.push('');
  parts.push('Responda APENAS com o JSON no formato especificado:');

  const fullPrompt = parts.join('\n');

  try {
    let text = await callGeminiWithRetry(model, fullPrompt, 3);

    logger.debug('Gemini raw response', { text });

    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    const parsed = JSON.parse(text) as AIResponse;
    return {
      message: parsed.message || 'Desculpe, não consegui processar sua mensagem.',
      action: parsed.action || 'none',
      extractedData: parsed.extractedData || {},
      leadTemperature: parsed.leadTemperature || 'warm',
      confidence: parsed.confidence ?? 0.7,
    };
  } catch (error: any) {
    logger.error('Gemini API error', { error: error.message });
    throw error;
  }
}
