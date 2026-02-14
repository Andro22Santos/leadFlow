import {
  findConversationByPhone,
  createConversation,
  addMessage,
  getRecentMessages,
  updateConversationMode,
  updateConversationData,
  closeConversation,
  getAppointmentsByPhone,
} from './repository';
import { generateAIResponse } from '../ai/ai-service';
import { scheduleAppointment, ScheduleResult } from '../scheduling/scheduler';
import { getAvailableSlots } from '../scheduling/availability';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { Conversation, ConversationContext, AIResponse } from './models';
import { parseDateBR } from '../utils/date-helpers';
import { notifyTransfer, notifyHotLead, notifyNewAppointment } from '../utils/telegram-notify';
import { writeLeadToSheet, updateLeadInSheet, intentionToBusca } from '../sheets/lead-writer';

// Rate limiting: prevent sending too many messages
const lastMessageTime: Map<string, number> = new Map();
const MIN_MESSAGE_INTERVAL_MS = 2000; // 2 seconds minimum between messages

/**
 * Main entry point for processing incoming messages.
 * Handles the full flow: context retrieval, AI response, scheduling, etc.
 */
export async function processIncomingMessage(
  phone: string,
  messageText: string,
  forceBypassHours: boolean = false
): Promise<string | null> {
  // Rate limiting check
  const now = Date.now();
  const lastTime = lastMessageTime.get(phone) || 0;
  if (now - lastTime < MIN_MESSAGE_INTERVAL_MS) {
    logger.debug('Rate limited message', { phone });
    return null;
  }
  lastMessageTime.set(phone, now);

  logger.info('Processing incoming message', { phone, messageLength: messageText.length });

  // Business hours check — save message but respond with off-hours notice
  if (!forceBypassHours && !isWithinBusinessHours()) {
    let conversation = await findConversationByPhone(phone);
    let isNewOffHoursLead = false;
    if (!conversation) {
      conversation = await createConversation(phone);
      isNewOffHoursLead = true;
    }
    await addMessage(conversation.id, 'customer', messageText);

    // ─── LEADS TAB: Register off-hours lead too ─────────
    if (isNewOffHoursLead) {
      const nowDate = new Date();
      const dateStr = `${nowDate.getDate().toString().padStart(2, '0')}/${(nowDate.getMonth() + 1).toString().padStart(2, '0')}/${nowDate.getFullYear()}`;
      writeLeadToSheet({
        date: dateStr,
        customerName: '',
        phone,
        vehicle: '',
        busca: '',
        qualificado: '',
        agendou: '',
        vendeu: '.',
        responsible: config.BOT_NAME,
      }).catch((err) => logger.warn('Failed to write off-hours lead', { error: err.message }));
    }

    const offHoursMsg = `Olá! 😊 Obrigado por entrar em contato com a ${config.AI_BRAND_NAME}. Nosso horário de atendimento é de ${config.BUSINESS_HOURS_START} às ${config.BUSINESS_HOURS_END}, de segunda a sábado. Retornaremos assim que possível!`;
    await addMessage(conversation.id, 'bot', offHoursMsg);
    logger.info('Off-hours message sent', { phone });
    return offHoursMsg;
  }

  // Find or create conversation
  let conversation = await findConversationByPhone(phone);
  let isNewLead = false;
  if (!conversation) {
    conversation = await createConversation(phone);
    isNewLead = true;

    // ─── LEADS TAB: Register new lead ──────────────────────
    const nowDate = new Date();
    const dateStr = `${nowDate.getDate().toString().padStart(2, '0')}/${(nowDate.getMonth() + 1).toString().padStart(2, '0')}/${nowDate.getFullYear()}`;
    writeLeadToSheet({
      date: dateStr,
      customerName: '',
      phone,
      vehicle: '',
      busca: '',
      qualificado: '',
      agendou: '',
      vendeu: '.',
      responsible: config.BOT_NAME,
    }).catch((err) => logger.warn('Failed to write new lead to LEADS sheet', { error: err.message }));
  }

  // If in human mode, don't auto-respond
  if (conversation.mode === 'human') {
    await addMessage(conversation.id, 'customer', messageText);
    logger.info('Message saved for human mode conversation', { phone });
    return null;
  }

  // Save customer message
  await addMessage(conversation.id, 'customer', messageText);

  // Get recent messages for context
  const recentMessages = await getRecentMessages(conversation.id, 15);

  // Get available slots for next working day
  const today = new Date();
  let availableSlots: string[] = [];
  try {
    // Try today first, then next days
    const todaySlots = await getAvailableSlots(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowSlots = await getAvailableSlots(tomorrow);

    // If tomorrow has no slots (weekend), try next working day
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    const dayAfterSlots = await getAvailableSlots(dayAfter);

    availableSlots = [...todaySlots.slice(0, 3), ...tomorrowSlots.slice(0, 3), ...dayAfterSlots.slice(0, 3)];
    // Deduplicate and limit
    availableSlots = [...new Set(availableSlots)].slice(0, 8);
  } catch (error) {
    logger.warn('Could not fetch available slots for context');
  }

  // Get previous appointments for this lead (memory)
  let previousAppointments;
  try {
    previousAppointments = await getAppointmentsByPhone(phone);
  } catch (error) {
    logger.warn('Could not fetch previous appointments');
  }

  // Build enriched conversation context
  const context: ConversationContext = {
    conversation,
    recentMessages,
    availableSlots,
    previousAppointments,
    leadTemperature: conversation.lead_temperature || 'warm',
  };

  // Generate AI response
  const aiResponse = await generateAIResponse(context);

  // Process extracted data — update conversation with all new fields
  if (aiResponse.extractedData) {
    const data = aiResponse.extractedData;
    await updateConversationData(conversation.id, {
      customer_name: data.customerName || undefined,
      vehicle: data.vehicle || undefined,
      city: data.city || undefined,
      intention: data.intention || undefined,
      lead_temperature: aiResponse.leadTemperature || undefined,
    });

    // Refresh in-memory conversation data
    if (data.customerName) conversation.customer_name = data.customerName;
    if (data.vehicle) conversation.vehicle = data.vehicle;
    if (data.city) conversation.city = data.city;
    if (data.intention) (conversation as any).intention = data.intention;
    if (aiResponse.leadTemperature) conversation.lead_temperature = aiResponse.leadTemperature;
  }

  // Log lead temperature + notify on hot
  if (aiResponse.leadTemperature) {
    logger.debug('Lead temperature', { phone, temperature: aiResponse.leadTemperature });
    if (aiResponse.leadTemperature === 'hot' && conversation.lead_temperature !== 'hot') {
      notifyHotLead(phone, conversation.customer_name, conversation.vehicle || undefined).catch(() => {});
    }
  }

  // Handle actions
  let finalMessage = aiResponse.message;

  switch (aiResponse.action) {
    case 'schedule':
      finalMessage = await handleScheduleAction(conversation, aiResponse);
      break;

    case 'transfer':
      await handleTransferAction(conversation);
      notifyTransfer(conversation.phone_number, conversation.customer_name).catch(() => {});
      finalMessage = aiResponse.message;
      break;

    case 'close':
      await closeConversation(conversation.id);
      break;

    case 'follow_up':
      logger.info('Follow-up triggered', { phone, temperature: aiResponse.leadTemperature });
      break;

    case 'none':
    default:
      break;
  }

  // ─── LEADS TAB: Single consolidated update after ALL processing ──────
  // Wait for action handling to complete, then do ONE update with all data
  try {
    const leadUpdate: Record<string, string | undefined> = {};

    // Always update available data
    if (conversation.customer_name) leadUpdate.customerName = conversation.customer_name;
    if (conversation.vehicle) leadUpdate.vehicle = conversation.vehicle;
    if ((conversation as any).intention) leadUpdate.busca = intentionToBusca((conversation as any).intention);

    // Qualificado = SIM when we have name + vehicle
    if (conversation.customer_name && conversation.vehicle) {
      leadUpdate.qualificado = 'SIM';
    }

    // Update based on action result
    if (aiResponse.action === 'schedule' && (finalMessage.includes('confirmado') || finalMessage.includes('Agendamento'))) {
      leadUpdate.agendou = 'SIM';
      leadUpdate.qualificado = 'SIM';
    }

    if (aiResponse.action === 'transfer') {
      leadUpdate.responsible = 'HUMANO';
    }

    if (aiResponse.action === 'close') {
      if (!leadUpdate.qualificado) leadUpdate.qualificado = 'NÃO';
    }

    // Only update if there's something to update
    if (Object.keys(leadUpdate).length > 0) {
      await updateLeadInSheet(phone, leadUpdate);
    }
  } catch (err: any) {
    logger.warn('Failed to update LEADS sheet', { error: err.message, phone });
  }

  // Save bot response
  await addMessage(conversation.id, 'bot', finalMessage);

  return finalMessage;
}

/**
 * Handles scheduling action from AI response
 * CRITICAL: Only schedules if minimum data is collected (name + vehicle + confirmed date/time)
 */
async function handleScheduleAction(
  conversation: Conversation,
  aiResponse: AIResponse
): Promise<string> {
  const data = aiResponse.extractedData;

  // GUARD: Reject scheduling if customer name is missing
  if (!conversation.customer_name && !data?.customerName) {
    logger.warn('Schedule blocked: missing customer name', { phone: conversation.phone_number });
    return aiResponse.message; // AI message will continue the conversation naturally
  }

  // GUARD: Reject scheduling if vehicle is missing
  if (!conversation.vehicle && !data?.vehicle) {
    logger.warn('Schedule blocked: missing vehicle info', { phone: conversation.phone_number });
    return aiResponse.message;
  }

  if (!data?.desiredDate || !data?.desiredTime) {
    logger.warn('Schedule blocked: missing date/time', { phone: conversation.phone_number });
    return aiResponse.message; // AI will continue asking for details
  }

  // Parse date
  const scheduledDate = parseDateBR(data.desiredDate);
  if (!scheduledDate) {
    return 'Não consegui entender a data. Pode me dizer novamente? Por exemplo: 15/02 ou 20/02.';
  }

  // Attempt to schedule — pass maximum data
  const result: ScheduleResult = await scheduleAppointment({
    conversationId: conversation.id,
    customerName: conversation.customer_name || 'Cliente',
    phone: conversation.phone_number,
    vehicle: conversation.vehicle || undefined,
    city: conversation.city || undefined,
    intention: (conversation as any).intention || undefined,
    leadTemperature: conversation.lead_temperature || undefined,
    date: scheduledDate,
    time: data.desiredTime,
    createdBy: config.BOT_NAME,
  });

  if (result.success) {
    return result.message;
  }

  // If scheduling failed, provide alternatives
  if (result.suggestedSlots && result.suggestedSlots.length > 0) {
    const suggestions = result.suggestedSlots
      .slice(0, 3)
      .map((s) => {
        const d = new Date(s.date);
        return `${d.getDate()}/${d.getMonth() + 1} às ${s.time}`;
      })
      .join('\n• ');

    return `${result.message}\n\nTenho esses horários disponíveis:\n• ${suggestions}\n\nQual prefere?`;
  }

  return result.message;
}

/**
 * Handles transfer to human agent
 */
async function handleTransferAction(conversation: Conversation): Promise<void> {
  await updateConversationMode(conversation.id, 'human');
  logger.info('Conversation transferred to human', {
    conversationId: conversation.id,
    phone: conversation.phone_number,
  });
}

/**
 * Manually send a message from a human agent
 */
export async function sendHumanMessage(
  phone: string,
  message: string,
  agentName: string
): Promise<void> {
  const conversation = await findConversationByPhone(phone);
  if (!conversation) {
    throw new Error('No active conversation found for this phone number');
  }

  await addMessage(conversation.id, 'agent', message);

  if (conversation.mode !== 'human') {
    await updateConversationMode(conversation.id, 'human', agentName);
  }
}

/**
 * Return conversation to AI mode
 */
export async function returnToAI(phone: string): Promise<void> {
  const conversation = await findConversationByPhone(phone);
  if (!conversation) {
    throw new Error('No active conversation found for this phone number');
  }

  await updateConversationMode(conversation.id, 'ai', config.BOT_NAME);
  logger.info('Conversation returned to AI mode', { phone });
}

// ─── Business Hours ──────────────────────────────────────────

function isWithinBusinessHours(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0=Sun ... 6=Sat

  // Check working day
  if (!config.WORKING_DAYS.includes(day)) {
    return false;
  }

  // Check time
  const [startH, startM] = config.BUSINESS_HOURS_START.split(':').map(Number);
  const [endH, endM] = config.BUSINESS_HOURS_END.split(':').map(Number);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}
