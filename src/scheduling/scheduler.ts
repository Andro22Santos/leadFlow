import { validateAppointment } from './validator';
import { getAvailableSlots, findNextAvailableSlots } from './availability';
import { writeAppointmentToSheet, AppointmentWriteData } from '../sheets/appointment-writer';
import { createAppointment, updateAppointmentSheetRow } from '../conversations/repository';
import { logger } from '../utils/logger';
import { getDiaSemana, formatDay } from '../utils/date-helpers';
import { notifyNewAppointment } from '../utils/telegram-notify';

export interface ScheduleRequest {
  conversationId: string;
  customerName: string;
  phone: string;
  vehicle?: string;
  city?: string;
  intention?: string;
  leadTemperature?: string;
  date: Date;
  time: string;
  createdBy: string;
}

export interface ScheduleResult {
  success: boolean;
  message: string;
  appointment?: any;
  suggestedSlots?: Array<{ date: Date; time: string }>;
}

/**
 * Attempts to schedule an appointment.
 * Validates, writes to sheet, and saves to database.
 */
export async function scheduleAppointment(request: ScheduleRequest): Promise<ScheduleResult> {
  logger.info('Scheduling appointment', {
    customer: request.customerName,
    date: request.date.toISOString(),
    time: request.time,
  });

  // Validate the appointment
  const validation = await validateAppointment(request.date, request.time);

  if (!validation.valid) {
    // Find alternative slots
    const suggestedSlots = await findNextAvailableSlots(request.date, 3);

    return {
      success: false,
      message: validation.reason || 'Horário não disponível.',
      suggestedSlots,
    };
  }

  try {
    // Write to Google Sheet — maximize data
    const originDetail = request.intention
      ? `LEAD (${request.intention.toUpperCase()})`
      : 'LEAD';

    const sheetData: AppointmentWriteData = {
      day: formatDay(request.date),
      scheduledDate: request.date,
      time: request.time,
      preVendas: request.createdBy,
      clientName: request.customerName,
      car: request.vehicle || '',
      phone: request.phone,
      city: request.city || 'Minha cidade',
      origin: originDetail,
    };

    let sheetRowId: number | undefined;
    try {
      sheetRowId = await writeAppointmentToSheet(sheetData);
    } catch (sheetError: any) {
      logger.warn('Failed to write to sheet, continuing with DB only', {
        error: sheetError.message,
      });
    }

    // Save to database
    const appointment = await createAppointment({
      conversation_id: request.conversationId,
      customer_name: request.customerName,
      phone_number: request.phone,
      vehicle: request.vehicle,
      city: request.city,
      scheduled_date: request.date,
      scheduled_time: request.time,
      created_by: request.createdBy,
    });

    if (sheetRowId) {
      await updateAppointmentSheetRow(appointment.id, sheetRowId);
    }

    const dayName = getDiaSemana(request.date);
    const dayNum = formatDay(request.date);

    // Notify via Telegram
    notifyNewAppointment(
      request.phone,
      request.customerName,
      `${dayName}, dia ${dayNum}`,
      request.time,
      request.vehicle,
    ).catch(() => {});

    return {
      success: true,
      message: `Agendamento confirmado! ${dayName}, dia ${dayNum}, às ${request.time}. Te esperamos na loja! 😊`,
      appointment,
    };
  } catch (error: any) {
    logger.error('Failed to schedule appointment', { error: error.message });
    return {
      success: false,
      message: 'Desculpe, tive um problema ao agendar. Vou transferir para um atendente.',
    };
  }
}
