const DIAS_SEMANA: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

const MESES: Record<number, string> = {
  0: 'JANEIRO',
  1: 'FEVEREIRO',
  2: 'MARÇO',
  3: 'ABRIL',
  4: 'MAIO',
  5: 'JUNHO',
  6: 'JULHO',
  7: 'AGOSTO',
  8: 'SETEMBRO',
  9: 'OUTUBRO',
  10: 'NOVEMBRO',
  11: 'DEZEMBRO',
};

/**
 * Returns the day of the week in Portuguese (e.g., "Segunda", "Terça")
 */
export function getDiaSemana(date: Date): string {
  return DIAS_SEMANA[date.getDay()];
}

/**
 * Returns the month name in Portuguese uppercase (e.g., "JANEIRO", "FEVEREIRO")
 */
export function getMesNome(date: Date): string {
  return MESES[date.getMonth()];
}

/**
 * Returns the sheet tab name for the current month (e.g., "FEVEREIRO 2026")
 */
export function getSheetTabName(date?: Date): string {
  const d = date || new Date();
  return `${getMesNome(d)} ${d.getFullYear()}`;
}

/**
 * Formats a date as DD (day of month)
 */
export function formatDay(date: Date): number {
  return date.getDate();
}

/**
 * Formats time as HH:MM
 */
export function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Parses a time string like "14:30" into hours and minutes
 */
export function parseTime(timeStr: string): { hours: number; minutes: number } {
  const parts = timeStr.split(':');
  return {
    hours: parseInt(parts[0], 10),
    minutes: parseInt(parts[1] || '0', 10),
  };
}

/**
 * Checks if a given time is within business hours
 */
export function isWithinBusinessHours(
  timeStr: string,
  startStr: string,
  endStr: string
): boolean {
  const time = parseTime(timeStr);
  const start = parseTime(startStr);
  const end = parseTime(endStr);

  const timeMinutes = time.hours * 60 + time.minutes;
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;

  return timeMinutes >= startMinutes && timeMinutes < endMinutes;
}

/**
 * Checks if a given day of the week is a working day
 */
export function isWorkingDay(date: Date, workingDays: number[]): boolean {
  return workingDays.includes(date.getDay());
}

/**
 * Generates time slots between start and end with given interval in minutes
 */
export function generateTimeSlots(startStr: string, endStr: string, intervalMinutes: number = 30): string[] {
  const start = parseTime(startStr);
  const end = parseTime(endStr);
  const slots: string[] = [];

  let current = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;

  while (current < endMinutes) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(formatTime(h, m));
    current += intervalMinutes;
  }

  return slots;
}

/**
 * Parses a date string in various formats and returns a Date object.
 * Supports: "hoje", "amanha", "amanhã", "05/02", "5/2", "05/02/2026",
 * "segunda", "terça", "quarta", "quinta", "sexta", "sabado"
 */
export function parseDateBR(dateStr: string, referenceYear?: number): Date | null {
  const year = referenceYear || new Date().getFullYear();
  const lower = dateStr.toLowerCase().trim();
  const today = new Date();

  // Relative dates
  if (lower === 'hoje' || lower.includes('hoje')) {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  if (lower === 'amanha' || lower === 'amanhã' || lower.includes('amanh')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
  }

  if (lower.includes('depois de amanh') || lower.includes('depois de amanh')) {
    const afterTomorrow = new Date(today);
    afterTomorrow.setDate(afterTomorrow.getDate() + 2);
    return new Date(afterTomorrow.getFullYear(), afterTomorrow.getMonth(), afterTomorrow.getDate());
  }

  // Day of week names
  const dayNames: Record<string, number> = {
    'domingo': 0, 'dom': 0,
    'segunda': 1, 'seg': 1,
    'terca': 2, 'terça': 2, 'ter': 2,
    'quarta': 3, 'qua': 3,
    'quinta': 4, 'qui': 4,
    'sexta': 5, 'sex': 5,
    'sabado': 6, 'sábado': 6, 'sab': 6,
  };

  for (const [name, dayOfWeek] of Object.entries(dayNames)) {
    if (lower.includes(name)) {
      const result = new Date(today);
      const currentDay = today.getDay();
      let daysAhead = dayOfWeek - currentDay;
      if (daysAhead <= 0) daysAhead += 7; // Next week
      result.setDate(result.getDate() + daysAhead);
      return new Date(result.getFullYear(), result.getMonth(), result.getDate());
    }
  }

  // Try DD/MM or DD/MM/YYYY
  const slashMatch = dateStr.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    const y = slashMatch[3] ? parseInt(slashMatch[3], 10) : year;
    return new Date(y, month, day);
  }

  // Try just a day number (e.g., "dia 15", "15")
  const dayMatch = lower.match(/(?:dia\s+)?(\d{1,2})/);
  if (dayMatch) {
    const day = parseInt(dayMatch[1], 10);
    if (day >= 1 && day <= 31) {
      let month = today.getMonth();
      // If the day already passed this month, assume next month
      if (day < today.getDate()) {
        month += 1;
      }
      return new Date(year, month, day);
    }
  }

  return null;
}
