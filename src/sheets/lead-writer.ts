import { appendRow, readRange, updateRange } from './sheets-client';
import { detectTabByName } from './sheet-detector';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════
// LEADS TAB WRITER
// Alimenta a aba LEADS — porta de entrada do funil
//
// Estrutura REAL da planilha (headers na linha 2):
//  A: (vazio/seq)
//  B: DATA
//  C: NOME
//  D: CARRO
//  E: TELEFONE
//  F: BUSCA (VENDA/COMPRA/TROCA/AVALIAÇÃO)
//  G: QUALIFICADO (SIM/NÃO)
//  H: AGENDOU (SIM/NÃO)
//  I: VENDEU (SIM/NÃO/.)
//  J: RESPONSAVEL
// ═══════════════════════════════════════════════════════════════

const LEADS_TAB_NAME = 'LEADS';

export interface LeadWriteData {
  date: string;           // DD/MM/YYYY
  customerName: string;
  vehicle: string;
  phone: string;
  busca: string;          // VENDA, COMPRA, TROCA, AVALIAÇÃO
  qualificado: string;    // SIM or NÃO
  agendou: string;        // SIM or NÃO
  vendeu: string;         // SIM, NÃO, or .
  responsible: string;    // "IA", "ANA", etc.
}

/**
 * Maps intention to BUSCA column value
 */
export function intentionToBusca(intention: string | null | undefined): string {
  if (!intention) return '';
  const map: Record<string, string> = {
    'vender': 'VENDA',
    'comprar': 'COMPRA',
    'trocar': 'TROCA',
    'avaliar': 'AVALIAÇÃO',
  };
  return map[intention.toLowerCase()] || intention.toUpperCase();
}

/**
 * Finds the actual LEADS tab name
 */
async function getLeadsTabName(): Promise<string | null> {
  return detectTabByName(LEADS_TAB_NAME);
}

/**
 * Writes a new lead row to the LEADS tab.
 * Called when a new conversation is created.
 *
 * Uses direct cell writing (updateRange) instead of append to avoid
 * Google Sheets table auto-detection shifting columns.
 *
 * Row layout: A(seq) | B(DATA) | C(NOME) | D(CARRO) | E(TELEFONE) | F(BUSCA) | G(QUALIFICADO) | H(AGENDOU) | I(VENDEU) | J(RESPONSAVEL)
 */
export async function writeLeadToSheet(data: LeadWriteData): Promise<number | null> {
  const tabName = await getLeadsTabName();

  if (!tabName) {
    logger.warn('LEADS tab not found in spreadsheet — skipping lead write');
    return null;
  }

  try {
    // Find the TRUE last used row by reading ALL columns (A:Z) to catch any data
    const allRows = await readRange(`'${tabName}'!A3:Z`);
    let lastUsedRow = 2; // Start after headers (row 2)
    for (let i = allRows.length - 1; i >= 0; i--) {
      const row = allRows[i];
      const hasData = row && row.some((cell: any) => cell && String(cell).trim() !== '');
      if (hasData) {
        lastUsedRow = i + 3; // +3: title row, header row, 0-index
        break;
      }
    }
    const nextRow = lastUsedRow + 1;
    logger.debug('LEADS: writing to row', { nextRow, totalRowsRead: allRows.length });

    const rowValues = [
      '',                                    // A: (seq/vazio)
      data.date,                             // B: DATA
      data.customerName || '',               // C: NOME
      data.vehicle || '',                    // D: CARRO
      data.phone,                            // E: TELEFONE
      data.busca || '',                      // F: BUSCA
      data.qualificado || '',                // G: QUALIFICADO
      data.agendou || '',                    // H: AGENDOU
      data.vendeu || '.',                    // I: VENDEU
      data.responsible || 'IA',              // J: RESPONSAVEL
    ];

    // Write directly to the specific row (avoids append auto-detection issues)
    await updateRange(`'${tabName}'!A${nextRow}:J${nextRow}`, [rowValues]);

    logger.info('Lead written to LEADS sheet', {
      tab: tabName,
      row: nextRow,
      phone: data.phone,
      name: data.customerName,
      busca: data.busca,
    });
    return nextRow;
  } catch (error: any) {
    logger.error('Failed to write lead to LEADS sheet', { error: error.message, phone: data.phone });
    return null;
  }
}

/**
 * Updates an existing lead in the LEADS tab.
 * Finds lead by phone number (column E) and updates relevant columns.
 */
export async function updateLeadInSheet(
  phone: string,
  updates: {
    customerName?: string;
    vehicle?: string;
    busca?: string;
    qualificado?: string;
    agendou?: string;
    vendeu?: string;
    responsible?: string;
  }
): Promise<boolean> {
  const tabName = await getLeadsTabName();

  if (!tabName) {
    logger.warn('LEADS tab not found — skipping lead update');
    return false;
  }

  try {
    // Read rows starting from row 3 (row 1 = title, row 2 = headers)
    const rows = await readRange(`'${tabName}'!A3:J`);
    const searchPhone = phone.replace(/\D/g, '');

    // Find the row with this phone number (column E = index 4)
    let targetRowIndex = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
      const rowPhone = (rows[i][4] || '').replace(/\D/g, '');
      if (rowPhone === searchPhone || rowPhone.endsWith(searchPhone) || searchPhone.endsWith(rowPhone)) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      logger.debug('Lead not found in LEADS sheet for update', { phone });
      return false;
    }

    const existingRow = rows[targetRowIndex];
    const sheetRowNum = targetRowIndex + 3; // +3: row 1 title, row 2 headers, 0-index

    const updatedRow = [
      existingRow[0] || '',                                    // A: (seq)
      existingRow[1] || '',                                    // B: DATA (don't change)
      updates.customerName || existingRow[2] || '',            // C: NOME
      updates.vehicle || existingRow[3] || '',                 // D: CARRO
      existingRow[4] || '',                                    // E: TELEFONE (don't change)
      updates.busca || existingRow[5] || '',                   // F: BUSCA
      updates.qualificado || existingRow[6] || '',             // G: QUALIFICADO
      updates.agendou || existingRow[7] || '',                 // H: AGENDOU
      updates.vendeu || existingRow[8] || '',                  // I: VENDEU
      updates.responsible || existingRow[9] || '',             // J: RESPONSAVEL
    ];

    await updateRange(`'${tabName}'!A${sheetRowNum}:J${sheetRowNum}`, [updatedRow]);

    logger.info('Lead updated in LEADS sheet', {
      tab: tabName,
      row: sheetRowNum,
      phone,
      updates: Object.keys(updates).filter(k => (updates as any)[k]),
    });
    return true;
  } catch (error: any) {
    logger.error('Failed to update lead in LEADS sheet', { error: error.message, phone });
    return false;
  }
}

/**
 * Finds a lead in the LEADS tab by phone number
 */
export async function findLeadInSheet(phone: string): Promise<number | null> {
  const tabName = await getLeadsTabName();
  if (!tabName) return null;

  try {
    const rows = await readRange(`'${tabName}'!A3:J`);
    const searchPhone = phone.replace(/\D/g, '');

    for (let i = rows.length - 1; i >= 0; i--) {
      const rowPhone = (rows[i][4] || '').replace(/\D/g, '');
      if (rowPhone === searchPhone || rowPhone.endsWith(searchPhone) || searchPhone.endsWith(rowPhone)) {
        return i + 3;
      }
    }
    return null;
  } catch (error: any) {
    logger.error('Failed to find lead in sheet', { error: error.message, phone });
    return null;
  }
}
