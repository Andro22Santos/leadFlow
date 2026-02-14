-- ═══════════════════════════════════════════════════════
-- LeadFlow V1 - Database Schema
-- ═══════════════════════════════════════════════════════

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
  intention VARCHAR(20) CHECK (intention IN ('vender', 'comprar', 'trocar', 'avaliar')),
  lead_temperature VARCHAR(10) DEFAULT 'warm' CHECK (lead_temperature IN ('hot', 'warm', 'cold')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
