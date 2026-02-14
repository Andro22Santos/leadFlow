import { getTakenSlots, isTimeSlotTaken } from '../sheets/availability-reader';
import { generateTimeSlots, isWithinBusinessHours, isWorkingDay } from '../utils/date-helpers';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Get available time slots for a given day
 */
export async function getAvailableSlots(date: Date): Promise<string[]> {
  // Check if it's a working day
  if (!isWorkingDay(date, config.WORKING_DAYS)) {
    logger.debug('Not a working day', { date: date.toISOString() });
    return [];
  }

  const day = date.getDate();
  const allSlots = generateTimeSlots(config.BUSINESS_HOURS_START, config.BUSINESS_HOURS_END, 30);

  try {
    const takenSlots = await getTakenSlots(day);
    
    const available = allSlots.filter(
      (slot) => !takenSlots.includes(slot)
    );

    logger.debug('Available slots calculated', {
      day,
      total: allSlots.length,
      taken: takenSlots.length,
      available: available.length,
    });

    return available;
  } catch (error: any) {
    logger.error('Failed to get available slots', { error: error.message });
    // Return all slots if we can't check (better than blocking)
    return allSlots;
  }
}

/**
 * Find the next N available slots starting from a specific date/time
 */
export async function findNextAvailableSlots(
  startDate: Date,
  count: number = 3
): Promise<Array<{ date: Date; time: string }>> {
  const results: Array<{ date: Date; time: string }> = [];
  const currentDate = new Date(startDate);
  let daysChecked = 0;
  const maxDaysToCheck = 14; // Check up to 2 weeks ahead

  while (results.length < count && daysChecked < maxDaysToCheck) {
    if (isWorkingDay(currentDate, config.WORKING_DAYS)) {
      const slots = await getAvailableSlots(currentDate);

      for (const slot of slots) {
        if (results.length >= count) break;

        // Skip past times for today
        if (currentDate.toDateString() === new Date().toDateString()) {
          const now = new Date();
          const [hours, minutes] = slot.split(':').map(Number);
          if (hours < now.getHours() || (hours === now.getHours() && minutes <= now.getMinutes())) {
            continue;
          }
        }

        results.push({
          date: new Date(currentDate),
          time: slot,
        });
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
    daysChecked++;
  }

  return results;
}
