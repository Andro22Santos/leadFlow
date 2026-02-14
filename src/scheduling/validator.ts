import { isTimeSlotTaken } from '../sheets/availability-reader';
import { isWithinBusinessHours, isWorkingDay } from '../utils/date-helpers';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates whether an appointment can be made for a given date and time
 */
export async function validateAppointment(
  date: Date,
  time: string
): Promise<ValidationResult> {
  // Check if it's a working day
  if (!isWorkingDay(date, config.WORKING_DAYS)) {
    return {
      valid: false,
      reason: 'Esse dia não é um dia útil. Podemos agendar em outro dia?',
    };
  }

  // Check if date is not in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  if (checkDate < today) {
    return {
      valid: false,
      reason: 'Essa data já passou. Qual outra data seria melhor?',
    };
  }

  // Check if within business hours
  if (!isWithinBusinessHours(time, config.BUSINESS_HOURS_START, config.BUSINESS_HOURS_END)) {
    return {
      valid: false,
      reason: `Nosso horário de atendimento é das ${config.BUSINESS_HOURS_START} às ${config.BUSINESS_HOURS_END}. Podemos agendar dentro desse horário?`,
    };
  }

  // Check for time conflicts in the sheet
  const day = date.getDate();
  try {
    const taken = await isTimeSlotTaken(day, time);
    if (taken) {
      return {
        valid: false,
        reason: `Esse horário já está ocupado. Vou verificar outros horários disponíveis para você.`,
      };
    }
  } catch (error: any) {
    logger.warn('Could not validate sheet availability', { error: error.message });
    // Continue anyway - don't block scheduling on sheet errors
  }

  return { valid: true };
}
