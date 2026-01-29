import { sql } from '@/lib/database'

// Initialize support tables if they don't exist
export async function ensureSupportTables(): Promise<boolean> {
  if (!sql) return false
  
  try {
    // Create support tickets table
    await sql`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        subject TEXT,
        status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Create support ticket messages table
    await sql`
      CREATE TABLE IF NOT EXISTS support_ticket_messages (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
        sender_wallet_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Create indexes for better performance
    await sql`
      CREATE INDEX IF NOT EXISTS idx_tickets_wallet_address ON support_tickets(wallet_address)
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status)
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_messages_ticket_id ON support_ticket_messages(ticket_id)
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON support_ticket_messages(created_at)
    `
    
    return true
  } catch (error) {
    console.error('Error ensuring support tables:', error)
    return false
  }
}










