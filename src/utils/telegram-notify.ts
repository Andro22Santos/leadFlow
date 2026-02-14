import { logger } from './logger';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

/**
 * Envia notificação via Telegram Bot API
 * Configurar no .env:
 *   TELEGRAM_BOT_TOKEN=<token do bot>
 *   TELEGRAM_CHAT_ID=<id do chat/grupo>
 */
export async function sendTelegramNotification(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    logger.debug('Telegram not configured, skipping notification');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const data = await response.text();
      logger.warn('Telegram notification failed', { status: response.status, data });
    } else {
      logger.debug('Telegram notification sent');
    }
  } catch (error: any) {
    logger.warn('Telegram notification error', { error: error.message });
  }
}

/**
 * Notifica transferência para humano
 */
export async function notifyTransfer(phone: string, customerName: string | null, reason?: string): Promise<void> {
  const name = customerName || 'Cliente';
  const msg = `🔄 <b>TRANSFERÊNCIA PARA HUMANO</b>\n\n👤 ${name}\n📱 ${phone}\n💬 ${reason || 'IA transferiu a conversa'}\n\n⚡ Acesse o sistema para responder.`;
  await sendTelegramNotification(msg);
}

/**
 * Notifica lead quente
 */
export async function notifyHotLead(phone: string, customerName: string | null, vehicle?: string): Promise<void> {
  const name = customerName || 'Cliente';
  const car = vehicle ? `\n🚗 ${vehicle}` : '';
  const msg = `🔥 <b>LEAD QUENTE</b>\n\n👤 ${name}\n📱 ${phone}${car}\n\n⚡ Alta probabilidade de agendamento!`;
  await sendTelegramNotification(msg);
}

/**
 * Notifica novo agendamento
 */
export async function notifyNewAppointment(
  phone: string,
  customerName: string,
  date: string,
  time: string,
  vehicle?: string
): Promise<void> {
  const car = vehicle ? `\n🚗 ${vehicle}` : '';
  const msg = `✅ <b>NOVO AGENDAMENTO</b>\n\n👤 ${customerName}\n📱 ${phone}${car}\n📅 ${date} às ${time}\n\n📋 Registrado na planilha.`;
  await sendTelegramNotification(msg);
}

/**
 * Notifica no-show
 */
export async function notifyNoShow(phone: string, customerName: string): Promise<void> {
  const msg = `⚠️ <b>NO-SHOW</b>\n\n👤 ${customerName}\n📱 ${phone}\n\n❌ Cliente não compareceu. Follow-up automático enviado.`;
  await sendTelegramNotification(msg);
}
