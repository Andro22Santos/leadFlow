import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export type AIRole = 'seller' | 'buyer' | 'hybrid';
export type AIMode = 'high_conversion' | 'low_pressure' | 'balanced';
export type PromptStyle = 'standard' | 'compact' | 'aggressive' | 'premium';

export interface EnvConfig {
  // Server
  PORT: number;
  NODE_ENV: string;

  // Database
  DATABASE_URL: string;

  // AI
  AI_PROVIDER: 'openai' | 'gemini';
  OPENAI_API_KEY: string;
  GEMINI_API_KEY: string;

  // AI Personality
  AI_ROLE: AIRole;
  AI_MODE: AIMode;
  AI_BRAND_NAME: string;
  AI_GOAL: string;
  PROMPT_STYLE: PromptStyle;

  // Google Sheets
  GOOGLE_SHEETS_ID: string;
  GOOGLE_SERVICE_ACCOUNT_JSON: string;

  // WhatsApp
  WHATSAPP_SESSION_PATH: string;

  // Bot
  BOT_NAME: string;
  BUSINESS_HOURS_START: string;
  BUSINESS_HOURS_END: string;
  WORKING_DAYS: number[];
}

function parseWorkingDays(days: string | undefined): number[] {
  if (!days) return [1, 2, 3, 4, 5, 6]; // Mon-Sat default
  return days.split(',').map((d) => parseInt(d.trim(), 10));
}

function getEnvVar(key: string, required: boolean = true, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

export function loadConfig(): EnvConfig {
  return {
    PORT: parseInt(getEnvVar('PORT', false, '3000'), 10),
    NODE_ENV: getEnvVar('NODE_ENV', false, 'development'),
    DATABASE_URL: getEnvVar('DATABASE_URL', true),
    AI_PROVIDER: getEnvVar('AI_PROVIDER', false, 'openai') as 'openai' | 'gemini',
    OPENAI_API_KEY: getEnvVar('OPENAI_API_KEY', false, ''),
    GEMINI_API_KEY: getEnvVar('GEMINI_API_KEY', false, ''),
    AI_ROLE: getEnvVar('AI_ROLE', false, 'hybrid') as AIRole,
    AI_MODE: getEnvVar('AI_MODE', false, 'balanced') as AIMode,
    AI_BRAND_NAME: getEnvVar('AI_BRAND_NAME', false, 'LeadFlow'),
    AI_GOAL: getEnvVar('AI_GOAL', false, 'agendamento'),
    PROMPT_STYLE: getEnvVar('PROMPT_STYLE', false, 'standard') as PromptStyle,
    GOOGLE_SHEETS_ID: getEnvVar('GOOGLE_SHEETS_ID', false, ''),
    GOOGLE_SERVICE_ACCOUNT_JSON: getEnvVar('GOOGLE_SERVICE_ACCOUNT_JSON', false, '') 
      || getEnvVar('GOOGLE_SERVICE_ACCOUNT_PATH', false, ''),
    WHATSAPP_SESSION_PATH: getEnvVar('WHATSAPP_SESSION_PATH', false, './.wwebjs_auth'),
    BOT_NAME: getEnvVar('BOT_NAME', false, 'LeadFlow'),
    BUSINESS_HOURS_START: getEnvVar('BUSINESS_HOURS_START', false, '09:00'),
    BUSINESS_HOURS_END: getEnvVar('BUSINESS_HOURS_END', false, '18:00'),
    WORKING_DAYS: parseWorkingDays(process.env.WORKING_DAYS),
  };
}

export const config = loadConfig();
