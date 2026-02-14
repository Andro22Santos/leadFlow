import { getPool } from '../config/database';
import { logger } from '../utils/logger';
import {
  Conversation,
  Message,
  Appointment,
  ConversationMode,
  ConversationStatus,
} from './models';

// ─── Conversations ───────────────────────────────────────────────

export async function findConversationByPhone(phone: string): Promise<Conversation | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM conversations WHERE phone_number = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );
  return result.rows[0] || null;
}

export async function createConversation(phone: string): Promise<Conversation> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO conversations (phone_number, status, mode, assigned_to)
     VALUES ($1, 'active', 'ai', 'LeadFlow')
     RETURNING *`,
    [phone]
  );
  logger.info('New conversation created', { phone });
  return result.rows[0];
}

export async function updateConversationMode(
  conversationId: string,
  mode: ConversationMode,
  assignedTo?: string
): Promise<Conversation> {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE conversations SET mode = $1, assigned_to = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
    [mode, assignedTo || (mode === 'ai' ? 'LeadFlow' : null), conversationId]
  );
  logger.info('Conversation mode updated', { conversationId, mode, assignedTo });
  return result.rows[0];
}

export async function updateConversationData(
  conversationId: string,
  data: {
    customer_name?: string;
    vehicle?: string;
    city?: string;
    intention?: string;
    lead_temperature?: string;
  }
): Promise<void> {
  const pool = getPool();
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.customer_name) {
    updates.push(`customer_name = $${paramIndex++}`);
    values.push(data.customer_name);
  }
  if (data.vehicle) {
    updates.push(`vehicle = $${paramIndex++}`);
    values.push(data.vehicle);
  }
  if (data.city) {
    updates.push(`city = $${paramIndex++}`);
    values.push(data.city);
  }
  if (data.intention) {
    updates.push(`intention = $${paramIndex++}`);
    values.push(data.intention);
  }
  if (data.lead_temperature) {
    updates.push(`lead_temperature = $${paramIndex++}`);
    values.push(data.lead_temperature);
  }

  if (updates.length === 0) return;

  updates.push(`updated_at = NOW()`);
  values.push(conversationId);

  await pool.query(
    `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
}

export async function getAppointmentsByPhone(phone: string): Promise<Appointment[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM appointments WHERE phone_number = $1 ORDER BY scheduled_date DESC`,
    [phone]
  );
  return result.rows;
}

export async function closeConversation(conversationId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE conversations SET status = 'closed', updated_at = NOW() WHERE id = $1`,
    [conversationId]
  );
  logger.info('Conversation closed', { conversationId });
}

export async function listActiveConversations(): Promise<Conversation[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM conversations WHERE status = 'active' ORDER BY updated_at DESC`
  );
  return result.rows;
}

export async function getConversationsByPhone(phone: string): Promise<Conversation[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM conversations WHERE phone_number = $1 ORDER BY created_at DESC`,
    [phone]
  );
  return result.rows;
}

// ─── Messages ────────────────────────────────────────────────────

export async function addMessage(
  conversationId: string,
  sender: 'customer' | 'bot' | 'agent',
  content: string
): Promise<Message> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO messages (conversation_id, sender, content) VALUES ($1, $2, $3) RETURNING *`,
    [conversationId, sender, content]
  );
  return result.rows[0];
}

export async function getRecentMessages(
  conversationId: string,
  limit: number = 20
): Promise<Message[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows.reverse(); // Return in chronological order
}

// ─── Appointments ────────────────────────────────────────────────

export async function createAppointment(data: {
  conversation_id?: string;
  customer_name: string;
  phone_number: string;
  vehicle?: string;
  city?: string;
  scheduled_date: Date;
  scheduled_time: string;
  created_by: string;
}): Promise<Appointment> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO appointments (conversation_id, customer_name, phone_number, vehicle, city, scheduled_date, scheduled_time, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.conversation_id || null,
      data.customer_name,
      data.phone_number,
      data.vehicle || null,
      data.city || 'Minha cidade',
      data.scheduled_date,
      data.scheduled_time,
      data.created_by,
    ]
  );
  logger.info('Appointment created', {
    customer: data.customer_name,
    date: data.scheduled_date,
    time: data.scheduled_time,
  });
  return result.rows[0];
}

export async function updateAppointmentSheetRow(
  appointmentId: string,
  sheetRowId: number
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE appointments SET sheets_row_id = $1, updated_at = NOW() WHERE id = $2`,
    [sheetRowId, appointmentId]
  );
}

export async function listAppointments(date?: Date): Promise<Appointment[]> {
  const pool = getPool();
  if (date) {
    const result = await pool.query(
      `SELECT * FROM appointments WHERE scheduled_date = $1 ORDER BY scheduled_time ASC`,
      [date]
    );
    return result.rows;
  }
  const result = await pool.query(
    `SELECT * FROM appointments ORDER BY scheduled_date DESC, scheduled_time ASC LIMIT 50`
  );
  return result.rows;
}

export async function getTodayAppointments(): Promise<Appointment[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM appointments WHERE scheduled_date = CURRENT_DATE ORDER BY scheduled_time ASC`
  );
  return result.rows;
}
