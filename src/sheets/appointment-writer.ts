import { readRange, updateRange } from './sheets-client';
import { detectCurrentMonthTab } from './sheet-detector';
import { getDiaSemana } from '../utils/date-helpers';
import { logger } from '../utils/logger';

export interface AppointmentWriteData {
  day: number;
  scheduledDate: Date;
  time: string;
  preVendas: string;
  clientName: string;
  car: string;
  phone: string;
  city: string;
  origin: string;
}

/**
 * Writes a new appointment row to the Google Sheet.
 * Uses direct row writing (updateRange) to avoid column shifting from auto-detection.
 *
 * Colunas da planilha (ordem exata):
 * A: DIA | B: DIA DA SEMANA | C: HORA | D: PRÉ VENDAS | E: CLIENTE | F: CARRO | G: TELEFONE | H: CIDADE | I: ORIGEM | J: COMPARECEU
 *
 * Returns the row number where it was inserted
 */
export async function writeAppointmentToSheet(data: AppointmentWriteData): Promise<number> {
  const tabName = await detectCurrentMonthTab();

  const dayOfWeek = getDiaSemana(data.scheduledDate);

  // Build row values matching the column order
  const rowValues = [
    data.day,                          // A: DIA
    dayOfWeek,                         // B: DIA DA SEMANA
    data.time,                         // C: HORA
    data.preVendas || '',              // D: PRÉ VENDAS
    data.clientName || '',             // E: CLIENTE
    data.car || '',                    // F: CARRO
    data.phone || '',                  // G: TELEFONE
    data.city || '',                   // H: CIDADE
    data.origin || 'LEAD',            // I: ORIGEM
    '',                                // J: COMPARECEU (preenchido depois)
  ];

  try {
    // Find TRUE last used row by checking all columns A:J
    const allRows = await readRange(`'${tabName}'!A2:J`);
    let lastUsedRow = 1; // Row 1 is header
    for (let i = allRows.length - 1; i >= 0; i--) {
      const row = allRows[i];
      const hasData = row && row.some((cell: any) => cell && String(cell).trim() !== '');
      if (hasData) {
        lastUsedRow = i + 2; // +2: header row, 0-index
        break;
      }
    }
    const nextRow = lastUsedRow + 1;

    // Write directly to the specific row
    await updateRange(`'${tabName}'!A${nextRow}:J${nextRow}`, [rowValues]);

    logger.info('Appointment written to sheet', {
      tab: tabName,
      row: nextRow,
      client: data.clientName,
      day: data.day,
      time: data.time,
      preVendas: data.preVendas,
      origin: data.origin,
      car: data.car,
      city: data.city,
    });
    return nextRow;
  } catch (error: any) {
    logger.error('Failed to write appointment to sheet', { error: error.message, data });
    throw error;
  }
}
