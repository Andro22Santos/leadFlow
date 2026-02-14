import { google, sheets_v4 } from 'googleapis';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

let sheetsClient: sheets_v4.Sheets | null = null;

/**
 * Initialize and return the Google Sheets client
 */
export function getSheetsClient(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient;

  try {
    let auth;
    const jsonPath = config.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (jsonPath && fs.existsSync(jsonPath)) {
      // Load from file path
      const credentials = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } else if (jsonPath) {
      // Try parsing as inline JSON
      try {
        const credentials = JSON.parse(jsonPath);
        auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
      } catch {
        throw new Error(
          'GOOGLE_SERVICE_ACCOUNT_JSON must be a valid file path or JSON string'
        );
      }
    } else {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');
    }

    sheetsClient = google.sheets({ version: 'v4', auth });
    logger.info('Google Sheets client initialized');
    return sheetsClient;
  } catch (error: any) {
    logger.error('Failed to initialize Google Sheets client', { error: error.message });
    throw error;
  }
}

/**
 * Get all sheet tab names from the spreadsheet
 */
export async function getSheetTabs(): Promise<string[]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId: config.GOOGLE_SHEETS_ID,
  });

  return (response.data.sheets || []).map(
    (s) => s.properties?.title || ''
  );
}

/**
 * Read values from a range in the sheet
 */
export async function readRange(range: string): Promise<any[][]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.GOOGLE_SHEETS_ID,
    range,
  });
  return response.data.values || [];
}

/**
 * Append a row to the sheet
 * @param tabName - Tab name in the spreadsheet
 * @param values - Array of cell values
 * @param columnRange - Column range (default 'A:J'). Use 'A:Z' for wider tabs.
 */
export async function appendRow(tabName: string, values: any[], columnRange: string = 'A:J'): Promise<number> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: config.GOOGLE_SHEETS_ID,
    range: `'${tabName}'!${columnRange}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [values],
    },
  });

  // Extract the row number from the updated range
  const updatedRange = response.data.updates?.updatedRange || '';
  const rowMatch = updatedRange.match(/(\d+)$/);
  const rowNumber = rowMatch ? parseInt(rowMatch[1], 10) : 0;

  logger.info('Row appended to sheet', { tab: tabName, row: rowNumber });
  return rowNumber;
}

/**
 * Update a range of cells in the sheet (multiple cells in a row)
 */
export async function updateRange(range: string, values: any[][]): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.GOOGLE_SHEETS_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values,
    },
  });
}

/**
 * Update a specific cell in the sheet
 */
export async function updateCell(range: string, value: any): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.GOOGLE_SHEETS_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[value]],
    },
  });
}
