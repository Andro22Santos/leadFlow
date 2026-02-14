import { getPool } from '../config/database';
import { sendWhatsAppMessage } from '../whatsapp/client';
import { addMessage, closeConversation } from '../conversations/repository';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const FOLLOW_UP_2H_MS = 2 * 60 * 60 * 1000;    // 2 horas
const FOLLOW_UP_24H_MS = 24 * 60 * 60 * 1000;   // 24 horas
const CONVERSATION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

let followUpInterval: NodeJS.Timeout | null = null;

/**
 * Inicia o scheduler de follow-up
 * Roda a cada 30 minutos verificando conversas que precisam de acompanhamento
 */
export function startFollowUpScheduler(): void {
  logger.info('Follow-up scheduler started (runs every 30 min)');

  // Roda imediatamente e depois a cada 30 min
  runFollowUpCycle();
  followUpInterval = setInterval(runFollowUpCycle, 30 * 60 * 1000);
}

export function stopFollowUpScheduler(): void {
  if (followUpInterval) {
    clearInterval(followUpInterval);
    followUpInterval = null;
    logger.info('Follow-up scheduler stopped');
  }
}

async function runFollowUpCycle(): Promise<void> {
  try {
    await processFollowUps();
    await processNoShows();
    await processConversationTimeouts();
  } catch (error: any) {
    logger.error('Follow-up cycle error', { error: error.message });
  }
}

/**
 * Envia follow-up para leads que não responderam
 */
async function processFollowUps(): Promise<void> {
  const pool = getPool();

  // Buscar conversas ativas em modo IA onde a última mensagem foi do bot e passou tempo
  const result = await pool.query(`
    SELECT c.id, c.phone_number, c.customer_name, c.lead_temperature,
      (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.sender = 'bot') as last_bot_msg,
      (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.sender = 'customer') as last_customer_msg,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender = 'bot' AND m.content LIKE '%follow-up%') as followup_count
    FROM conversations c
    WHERE c.status = 'active' AND c.mode = 'ai'
    ORDER BY c.updated_at ASC
  `);

  const now = Date.now();

  for (const conv of result.rows) {
    const lastBotMsg = conv.last_bot_msg ? new Date(conv.last_bot_msg).getTime() : 0;
    const lastCustomerMsg = conv.last_customer_msg ? new Date(conv.last_customer_msg).getTime() : 0;
    const followUpCount = parseInt(conv.followup_count || '0', 10);

    // Se o cliente respondeu depois do bot, não precisa de follow-up
    if (lastCustomerMsg > lastBotMsg) continue;

    // Se já mandou 2 follow-ups, não mandar mais
    if (followUpCount >= 2) continue;

    const timeSinceLastBot = now - lastBotMsg;

    // Follow-up de 2h (primeiro)
    if (timeSinceLastBot >= FOLLOW_UP_2H_MS && timeSinceLastBot < FOLLOW_UP_24H_MS && followUpCount === 0) {
      const name = conv.customer_name ? `, ${conv.customer_name}` : '';
      const msg = `Oi${name}! 😊 Só passando pra saber se ainda tem interesse. Posso te ajudar com alguma dúvida? [follow-up]`;

      await sendFollowUp(conv.id, conv.phone_number, msg);
      logger.info('Follow-up 2h sent', { phone: conv.phone_number });
    }

    // Follow-up de 24h (último)
    if (timeSinceLastBot >= FOLLOW_UP_24H_MS && followUpCount <= 1) {
      const name = conv.customer_name ? `, ${conv.customer_name}` : '';
      const msg = `Oi${name}! Caso mude de ideia, estou por aqui 😊 É só me chamar! [follow-up]`;

      await sendFollowUp(conv.id, conv.phone_number, msg);
      logger.info('Follow-up 24h sent (last attempt)', { phone: conv.phone_number });
    }
  }
}

/**
 * Envia mensagem de reagendamento para no-shows
 */
async function processNoShows(): Promise<void> {
  const pool = getPool();

  // Buscar agendamentos de ontem/hoje com status 'scheduled' que não foram confirmados
  const result = await pool.query(`
    SELECT a.id, a.phone_number, a.customer_name, a.scheduled_date, a.scheduled_time, a.conversation_id
    FROM appointments a
    WHERE a.status = 'scheduled'
      AND a.scheduled_date < CURRENT_DATE
      AND a.scheduled_date >= CURRENT_DATE - INTERVAL '2 days'
      AND NOT EXISTS (
        SELECT 1 FROM messages m
        WHERE m.conversation_id = a.conversation_id
          AND m.content LIKE '%reagendamento%'
          AND m.sender = 'bot'
          AND m.created_at > a.scheduled_date
      )
  `);

  for (const apt of result.rows) {
    // Marcar como no-show
    await pool.query(`UPDATE appointments SET status = 'no_show', updated_at = NOW() WHERE id = $1`, [apt.id]);

    // Enviar mensagem de reagendamento
    if (apt.conversation_id) {
      const name = apt.customer_name ? `, ${apt.customer_name}` : '';
      const msg = `Oi${name}! Vi que você não conseguiu vir 😊 sem problema! Quer que eu te encaixe em outro horário? É rápido e sem compromisso! [reagendamento]`;

      await sendFollowUp(apt.conversation_id, apt.phone_number, msg);
      logger.info('No-show reagendamento sent', { phone: apt.phone_number });
    }
  }
}

/**
 * Fecha conversas sem atividade há 7 dias
 */
async function processConversationTimeouts(): Promise<void> {
  const pool = getPool();

  const result = await pool.query(`
    SELECT c.id, c.phone_number
    FROM conversations c
    WHERE c.status = 'active'
      AND c.updated_at < NOW() - INTERVAL '7 days'
  `);

  for (const conv of result.rows) {
    await closeConversation(conv.id);
    logger.info('Conversation timed out (7 days)', { phone: conv.phone_number });
  }

  if (result.rows.length > 0) {
    logger.info(`Closed ${result.rows.length} timed-out conversations`);
  }
}

/**
 * Helper: envia follow-up e salva no banco
 */
async function sendFollowUp(conversationId: string, phone: string, message: string): Promise<void> {
  try {
    await addMessage(conversationId, 'bot', message);
    await sendWhatsAppMessage(phone, message.replace(' [follow-up]', '').replace(' [reagendamento]', ''));
  } catch (error: any) {
    logger.warn('Failed to send follow-up', { phone, error: error.message });
  }
}
