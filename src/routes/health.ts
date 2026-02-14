import { Router, Request, Response } from 'express';
import { getWhatsAppStatus } from '../whatsapp/client';
import { listAllTabs, detectTabByName } from '../sheets/sheet-detector';
import { readRange } from '../sheets/sheets-client';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  const whatsappStatus = getWhatsAppStatus();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'LeadFlow',
    version: '1.0.0',
    whatsapp: whatsappStatus,
  });
});

/**
 * GET /sheets/tabs — Lists all spreadsheet tabs (diagnostics)
 */
router.get('/sheets/tabs', async (_req: Request, res: Response) => {
  try {
    const tabs = await listAllTabs();
    const leadsTab = await detectTabByName('LEADS');
    const agendamentoTab = await detectTabByName('Agendamento');
    const prospeccaoTab = await detectTabByName('PROSPECÇÃO');
    const controleTab = await detectTabByName('Controle de venda');

    res.json({
      totalTabs: tabs.length,
      allTabs: tabs,
      detected: {
        leads: leadsTab || 'NÃO ENCONTRADA',
        agendamento: agendamentoTab || 'NÃO ENCONTRADA',
        prospeccao: prospeccaoTab || 'NÃO ENCONTRADA',
        controleVenda: controleTab || 'NÃO ENCONTRADA',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /sheets/headers/:tab — Read header row from a specific tab
 */
router.get('/sheets/headers/:tab', async (req: Request, res: Response) => {
  try {
    const tabName = decodeURIComponent(req.params.tab);
    const rows = await readRange(`'${tabName}'!A1:Z3`);
    res.json({
      tab: tabName,
      headers: rows[0] || [],
      sampleRow1: rows[1] || [],
      sampleRow2: rows[2] || [],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /sheets/data/:tab — Read all data from a specific tab (last N rows)
 */
router.get('/sheets/data/:tab', async (req: Request, res: Response) => {
  try {
    const tabName = decodeURIComponent(req.params.tab);
    const limit = parseInt(req.query.limit as string) || 10;
    const rows = await readRange(`'${tabName}'!A1:Z`);
    const total = rows.length;
    const lastRows = rows.slice(Math.max(0, total - limit));
    res.json({
      tab: tabName,
      totalRows: total,
      showing: `last ${lastRows.length} rows`,
      headers: rows[0] || [],
      rows: lastRows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
