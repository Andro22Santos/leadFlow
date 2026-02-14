import { Router } from 'express';
import { getPool } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

router.get('/stats', async (_req, res) => {
  try {
    const pool = getPool();

    // Total de leads (conversas)
    const totalLeads = await pool.query(`SELECT COUNT(*) as total FROM conversations`);

    // Leads ativos
    const activeLeads = await pool.query(`SELECT COUNT(*) as total FROM conversations WHERE status = 'active'`);

    // Leads por modo (IA vs humano)
    const byMode = await pool.query(`
      SELECT mode, COUNT(*) as total FROM conversations WHERE status = 'active' GROUP BY mode
    `);

    // Total de agendamentos
    const totalAppointments = await pool.query(`SELECT COUNT(*) as total FROM appointments`);

    // Agendamentos por status
    const appointmentsByStatus = await pool.query(`
      SELECT status, COUNT(*) as total FROM appointments GROUP BY status ORDER BY total DESC
    `);

    // Agendamentos hoje
    const todayAppointments = await pool.query(`
      SELECT COUNT(*) as total FROM appointments WHERE scheduled_date = CURRENT_DATE
    `);

    // Agendamentos esta semana
    const weekAppointments = await pool.query(`
      SELECT COUNT(*) as total FROM appointments 
      WHERE scheduled_date >= DATE_TRUNC('week', CURRENT_DATE) 
        AND scheduled_date < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'
    `);

    // Temperatura dos leads ativos
    const byTemperature = await pool.query(`
      SELECT COALESCE(lead_temperature, 'warm') as temperature, COUNT(*) as total 
      FROM conversations WHERE status = 'active' GROUP BY lead_temperature
    `);

    // Intenção dos leads
    const byIntention = await pool.query(`
      SELECT COALESCE(intention, 'indefinida') as intention, COUNT(*) as total 
      FROM conversations WHERE status = 'active' GROUP BY intention ORDER BY total DESC
    `);

    // Taxa de conversão (leads que geraram agendamento)
    const leadsWithAppointment = await pool.query(`
      SELECT COUNT(DISTINCT c.id) as total 
      FROM conversations c 
      INNER JOIN appointments a ON a.conversation_id = c.id
    `);

    const totalLeadsNum = parseInt(totalLeads.rows[0].total, 10);
    const leadsWithAptNum = parseInt(leadsWithAppointment.rows[0].total, 10);
    const conversionRate = totalLeadsNum > 0 ? ((leadsWithAptNum / totalLeadsNum) * 100).toFixed(1) : '0';

    // No-shows
    const noShows = await pool.query(`SELECT COUNT(*) as total FROM appointments WHERE status = 'no_show'`);

    // Total de mensagens
    const totalMessages = await pool.query(`SELECT COUNT(*) as total FROM messages`);

    // Mensagens por tipo
    const messagesBySender = await pool.query(`
      SELECT sender, COUNT(*) as total FROM messages GROUP BY sender
    `);

    res.json({
      leads: {
        total: parseInt(totalLeads.rows[0].total, 10),
        active: parseInt(activeLeads.rows[0].total, 10),
        byMode: byMode.rows.reduce((acc: any, r: any) => ({ ...acc, [r.mode]: parseInt(r.total, 10) }), {}),
        byTemperature: byTemperature.rows.reduce((acc: any, r: any) => ({ ...acc, [r.temperature]: parseInt(r.total, 10) }), {}),
        byIntention: byIntention.rows.reduce((acc: any, r: any) => ({ ...acc, [r.intention]: parseInt(r.total, 10) }), {}),
      },
      appointments: {
        total: parseInt(totalAppointments.rows[0].total, 10),
        today: parseInt(todayAppointments.rows[0].total, 10),
        thisWeek: parseInt(weekAppointments.rows[0].total, 10),
        byStatus: appointmentsByStatus.rows.reduce((acc: any, r: any) => ({ ...acc, [r.status]: parseInt(r.total, 10) }), {}),
        noShows: parseInt(noShows.rows[0].total, 10),
      },
      conversion: {
        rate: `${conversionRate}%`,
        leadsWithAppointment: leadsWithAptNum,
        totalLeads: totalLeadsNum,
      },
      messages: {
        total: parseInt(totalMessages.rows[0].total, 10),
        bySender: messagesBySender.rows.reduce((acc: any, r: any) => ({ ...acc, [r.sender]: parseInt(r.total, 10) }), {}),
      },
    });
  } catch (error: any) {
    logger.error('Stats error', { error: error.message });
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
