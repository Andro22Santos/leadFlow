import { readRange } from './sheets-client';
import { detectCurrentMonthTab } from './sheet-detector';
import { logger } from '../utils/logger';

/**
 * Column mapping for the spreadsheet (0-indexed)
 * Based on the actual spreadsheet structure:
 * A: DIA (day number)
 * B: DIA DA SEMANA
 * C: HORA
 * D: PRÉ VENDAS
 * E: CLIENTE
 * F: CARRO
 * G: TELEFONE
 * H: CIDADE
 * I: ORIGEM
 * J: COMPARECEU
 */
export const COLUMN_MAP = {
  DIA: 0,
  DIA_SEMANA: 1,
  HORA: 2,
  PRE_VENDAS: 3,
  CLIENTE: 4,
  CARRO: 5,
  TELEFONE: 6,
  CIDADE: 7,
  ORIGEM: 8,
  COMPARECEU: 9,
};

export interface SheetRow {
  day: number;
  dayOfWeek: string;
  time: string;
  preVendas: string;
  client: string;
  car: string;
  phone: string;
  city: string;
  origin: string;
  attended: string;
  rowIndex: number;
}

/**
 * Reads all appointments from the current month's sheet
 */
export async function readMonthAppointments(): Promise<SheetRow[]> {
  const tabName = await detectCurrentMonthTab();
  
  try {
    const rows = await readRange(`'${tabName}'!A2:J`); // Skip header
    
    return rows
      .map((row, index) => ({
        day: parseInt(row[COLUMN_MAP.DIA] || '0', 10),
        dayOfWeek: row[COLUMN_MAP.DIA_SEMANA] || '',
        time: row[COLUMN_MAP.HORA] || '',
        preVendas: row[COLUMN_MAP.PRE_VENDAS] || '',
        client: row[COLUMN_MAP.CLIENTE] || '',
        car: row[COLUMN_MAP.CARRO] || '',
        phone: row[COLUMN_MAP.TELEFONE] || '',
        city: row[COLUMN_MAP.CIDADE] || '',
        origin: row[COLUMN_MAP.ORIGEM] || '',
        attended: row[COLUMN_MAP.COMPARECEU] || '',
        rowIndex: index + 2, // +2 because we start from row 2 (1 for header, 1 for 0-index)
      }))
      .filter((row) => row.day > 0); // Filter empty rows
  } catch (error: any) {
    logger.error('Failed to read sheet appointments', { error: error.message });
    return [];
  }
}

/**
 * Checks if a specific day and time are already taken
 */
export async function isTimeSlotTaken(day: number, time: string): Promise<boolean> {
  const appointments = await readMonthAppointments();
  
  const normalizedTime = normalizeTime(time);
  
  return appointments.some(
    (apt) => apt.day === day && normalizeTime(apt.time) === normalizedTime
  );
}

/**
 * Get all taken time slots for a specific day
 */
export async function getTakenSlots(day: number): Promise<string[]> {
  const appointments = await readMonthAppointments();
  
  return appointments
    .filter((apt) => apt.day === day && apt.time)
    .map((apt) => normalizeTime(apt.time));
}

/**
 * Normalize time format (e.g., "9:00" -> "09:00", "14:30" -> "14:30")
 */
function normalizeTime(time: string): string {
  if (!time) return '';
  const parts = time.replace(/\s/g, '').split(':');
  const hours = parts[0].padStart(2, '0');
  const minutes = (parts[1] || '00').padStart(2, '0');
  return `${hours}:${minutes}`;
}
