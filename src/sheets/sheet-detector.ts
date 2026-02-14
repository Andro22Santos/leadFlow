import { getSheetTabs } from './sheets-client';
import { getSheetTabName } from '../utils/date-helpers';
import { logger } from '../utils/logger';

// Cache tab names to avoid repeated API calls (refresh every 5 min)
let tabCache: { tabs: string[]; timestamp: number } | null = null;
const TAB_CACHE_TTL = 5 * 60 * 1000;

async function getCachedTabs(): Promise<string[]> {
  const now = Date.now();
  if (tabCache && (now - tabCache.timestamp) < TAB_CACHE_TTL) {
    return tabCache.tabs;
  }
  const tabs = await getSheetTabs();
  tabCache = { tabs, timestamp: now };
  return tabs;
}

/**
 * Detects or creates the sheet tab for the current month.
 * Tab name format: "FEVEREIRO 2026"
 */
export async function detectCurrentMonthTab(): Promise<string> {
  const expectedTabName = getSheetTabName();
  
  try {
    const tabs = await getCachedTabs();
    
    // Look for exact match
    const found = tabs.find(
      (tab) => tab.toUpperCase().trim() === expectedTabName.toUpperCase().trim()
    );

    if (found) {
      logger.info('Sheet tab found for current month', { tab: found });
      return found;
    }

    // Try partial match (some sheets might have slightly different naming)
    const partialMatch = tabs.find((tab) => {
      const upper = tab.toUpperCase().trim();
      return upper.includes(expectedTabName.split(' ')[0]); // Match month name
    });

    if (partialMatch) {
      logger.info('Sheet tab partial match found', { tab: partialMatch, expected: expectedTabName });
      return partialMatch;
    }

    // If no tab found, use the last tab (most recent month)
    logger.warn('No tab found for current month, using last available tab', {
      expected: expectedTabName,
      available: tabs,
    });
    
    // Filter out non-month tabs (like "PROSPECÇÃO", "Página12")
    const monthTabs = tabs.filter((tab) => {
      return /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]+\s+\d{4}$/.test(tab.trim());
    });

    if (monthTabs.length > 0) {
      return monthTabs[monthTabs.length - 1];
    }

    // Fallback to first tab
    return tabs[0] || expectedTabName;
  } catch (error: any) {
    logger.error('Failed to detect sheet tab', { error: error.message });
    return expectedTabName;
  }
}

/**
 * Detects a specific tab by name (case-insensitive, partial match)
 * Used to find tabs like "LEADS", "PROSPECÇÃO", "Controle de venda", etc.
 */
export async function detectTabByName(targetName: string): Promise<string | null> {
  try {
    const tabs = await getCachedTabs();

    // Exact match (case-insensitive)
    const exact = tabs.find(
      (tab) => tab.toUpperCase().trim() === targetName.toUpperCase().trim()
    );
    if (exact) return exact;

    // Contains match (case-insensitive)
    const partial = tabs.find(
      (tab) => tab.toUpperCase().trim().includes(targetName.toUpperCase().trim())
    );
    if (partial) return partial;

    logger.warn('Tab not found', { targetName, available: tabs });
    return null;
  } catch (error: any) {
    logger.error('Failed to detect tab', { error: error.message, targetName });
    return null;
  }
}

/**
 * List all available tabs (for diagnostics)
 */
export async function listAllTabs(): Promise<string[]> {
  return getCachedTabs();
}
