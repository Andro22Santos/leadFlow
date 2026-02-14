import { Router, Request, Response } from 'express';
import { listAppointments, getTodayAppointments } from '../conversations/repository';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /appointments
 * List all appointments
 */
router.get('/appointments', async (_req: Request, res: Response) => {
  try {
    const appointments = await listAppointments();
    return res.json({
      count: appointments.length,
      appointments,
    });
  } catch (error: any) {
    logger.error('Error listing appointments', { error: error.message });
    return res.status(500).json({ error: 'Failed to list appointments' });
  }
});

/**
 * GET /appointments/today
 * List today's appointments
 */
router.get('/appointments/today', async (_req: Request, res: Response) => {
  try {
    const appointments = await getTodayAppointments();
    return res.json({
      date: new Date().toISOString().split('T')[0],
      count: appointments.length,
      appointments,
    });
  } catch (error: any) {
    logger.error('Error listing today appointments', { error: error.message });
    return res.status(500).json({ error: 'Failed to list appointments' });
  }
});

export default router;
