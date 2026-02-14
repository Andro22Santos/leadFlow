export type ConversationStatus = 'active' | 'closed';
export type ConversationMode = 'ai' | 'human';
export type MessageSender = 'customer' | 'bot' | 'agent';
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'no_show' | 'rescheduled';
export type LeadTemperature = 'hot' | 'warm' | 'cold';
export type ClientIntention = 'vender' | 'comprar' | 'trocar' | 'avaliar' | null;

export interface Conversation {
  id: string;
  phone_number: string;
  status: ConversationStatus;
  mode: ConversationMode;
  assigned_to: string;
  customer_name: string | null;
  vehicle: string | null;
  city: string | null;
  intention: ClientIntention;
  lead_temperature: LeadTemperature;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: MessageSender;
  content: string;
  created_at: Date;
}

export interface Appointment {
  id: string;
  conversation_id: string | null;
  customer_name: string;
  phone_number: string;
  vehicle: string | null;
  city: string;
  scheduled_date: Date;
  scheduled_time: string;
  status: AppointmentStatus;
  created_by: string;
  sheets_row_id: number | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Context passed to the AI provider for generating responses
 */
export interface ConversationContext {
  conversation: Conversation;
  recentMessages: Message[];
  pendingAppointment?: Partial<Appointment>;
  availableSlots?: string[];
  previousAppointments?: Appointment[];
  leadTemperature?: LeadTemperature;
}

/**
 * Response from the AI provider
 */
export interface AIResponse {
  message: string;
  action?: 'schedule' | 'transfer' | 'follow_up' | 'close' | 'none';
  extractedData?: {
    customerName?: string;
    vehicle?: string;
    city?: string;
    intention?: string;
    desiredDate?: string;
    desiredTime?: string;
  };
  leadTemperature?: LeadTemperature;
  confidence: number;
}
