import { Pool } from 'pg';
import { config } from './env';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err: Error) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });
  }
  return pool;
}

export async function initDatabase(): Promise<void> {
  const db = getPool();
  try {
    await db.query('SELECT NOW()');
    logger.info('Database connection established');
  } catch (error: any) {
    logger.error('Failed to connect to database', { error: error.message });
    throw error;
  }
}

export async function runMigrations(): Promise<void> {
  const db = getPool();

  const migrationSQL = `
    -- Create conversations table
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone_number VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
      mode VARCHAR(10) NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai', 'human')),
      assigned_to VARCHAR(100) DEFAULT 'LeadFlow',
      customer_name VARCHAR(200),
      vehicle VARCHAR(200),
      city VARCHAR(200),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Index for quick phone lookup
    CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

    -- Create messages table
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender VARCHAR(10) NOT NULL CHECK (sender IN ('customer', 'bot', 'agent')),
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

    -- Create appointments table
    CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
      customer_name VARCHAR(200) NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      vehicle VARCHAR(200),
      city VARCHAR(200) DEFAULT 'Minha cidade',
      scheduled_date DATE NOT NULL,
      scheduled_time TIME NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled' 
        CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'no_show', 'rescheduled')),
      created_by VARCHAR(100) NOT NULL DEFAULT 'LeadFlow',
      sheets_row_id INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(phone_number);
  `;

  // Migration V1.1: add intention and lead_temperature columns
  const migrationV11 = `
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'intention') THEN
        ALTER TABLE conversations ADD COLUMN intention VARCHAR(20) CHECK (intention IN ('vender', 'comprar', 'trocar', 'avaliar'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'lead_temperature') THEN
        ALTER TABLE conversations ADD COLUMN lead_temperature VARCHAR(10) DEFAULT 'warm' CHECK (lead_temperature IN ('hot', 'warm', 'cold'));
      END IF;
    END $$;
  `;

  try {
    await db.query(migrationSQL);
    await db.query(migrationV11);
    logger.info('Database migrations completed successfully');
  } catch (error: any) {
    logger.error('Failed to run migrations', { error: error.message });
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection closed');
  }
}
