import { neon } from '@neondatabase/serverless'

// Get database URL from environment variables
const getDatabaseUrl = () => {
  // Try different environment variable names
  return process.env.NEON_DATABASE || 
         process.env.DATABASE_URL || 
         process.env.NEXT_PUBLIC_NEON_DATABASE ||
         ''
}

const databaseUrl = getDatabaseUrl()

// Only initialize database connection on server side
let sql: ReturnType<typeof neon> | null = null

if (typeof window === 'undefined') {
  // Server-side only
  if (databaseUrl) {
    sql = neon(databaseUrl)
  } else {
    // Only log error on server side, not in client bundles
    console.error('No database connection string found. Please set NEON_DATABASE environment variable.')
  }
}
// On client side, sql will remain null (which is expected)

// Initialize database tables
export async function initializeDatabase() {
  if (!sql) {
    console.error('Database connection not available')
    return
  }
  
  try {
    // Create collections table
    await sql`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT FALSE,
        trait_selections JSONB NOT NULL
      )
    `

    // Create ordinals table
    await sql`
      CREATE TABLE IF NOT EXISTS ordinals (
        id TEXT PRIMARY KEY,
        number INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        metadata_url TEXT,
        traits JSONB NOT NULL,
        prompt TEXT,
        rarity_score INTEGER,
        rarity_tier TEXT,
        collection_id TEXT REFERENCES collections(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

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

    console.log('Database tables initialized successfully')
  } catch (error) {
    console.error('Error initializing database:', error)
    throw error
  }
}

export { sql }
