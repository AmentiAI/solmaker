#!/usr/bin/env node

/**
 * Comprehensive database index creation script
 * Creates indexes for all commonly queried columns to improve performance
 */

const { Client } = require('pg');

// Database connection configuration (same as setup-database.js)
const DATABASE_URL = process.env.NEON_DATABASE || 
                     process.env.DATABASE_URL || 
                     'postgresql://neondb_owner:npg_Fuz8VsTtkwC5@ep-sparkling-cherry-adpxcdzr-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const indexes = [
  // ============================================
  // COLLECTIONS TABLE
  // ============================================
  {
    name: 'idx_collections_wallet_address',
    query: `CREATE INDEX IF NOT EXISTS idx_collections_wallet_address ON collections (wallet_address)`,
    purpose: 'Collections filtered by wallet_address'
  },
  {
    name: 'idx_collections_wallet_created',
    query: `CREATE INDEX IF NOT EXISTS idx_collections_wallet_created ON collections (wallet_address, created_at DESC)`,
    purpose: 'Collections by wallet with ordering'
  },
  {
    name: 'idx_collections_is_active',
    query: `CREATE INDEX IF NOT EXISTS idx_collections_is_active ON collections (is_active) WHERE is_active = true`,
    purpose: 'Active collections lookup'
  },

  // ============================================
  // PROFILES TABLE
  // ============================================
  {
    name: 'idx_profiles_wallet_address',
    query: `CREATE INDEX IF NOT EXISTS idx_profiles_wallet_address ON profiles (wallet_address)`,
    purpose: 'Profile lookup by wallet'
  },
  {
    name: 'idx_profiles_username',
    query: `CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username)`,
    purpose: 'Profile lookup by username'
  },
  {
    name: 'idx_profiles_username_lower',
    query: `CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON profiles (LOWER(username))`,
    purpose: 'Case-insensitive username lookup'
  },

  // ============================================
  // CREDITS TABLE
  // ============================================
  {
    name: 'idx_credits_wallet_address',
    query: `CREATE INDEX IF NOT EXISTS idx_credits_wallet_address ON credits (wallet_address)`,
    purpose: 'Credits lookup by wallet'
  },
  {
    name: 'idx_credits_wallet_updated',
    query: `CREATE INDEX IF NOT EXISTS idx_credits_wallet_updated ON credits (wallet_address, updated_at DESC)`,
    purpose: 'Credits with update time ordering'
  },

  // ============================================
  // COLLECTION COLLABORATORS TABLE
  // ============================================
  {
    name: 'idx_collaborators_wallet',
    query: `CREATE INDEX IF NOT EXISTS idx_collaborators_wallet ON collection_collaborators (wallet_address)`,
    purpose: 'Collaborator lookup by wallet'
  },
  {
    name: 'idx_collaborators_collection_wallet',
    query: `CREATE INDEX IF NOT EXISTS idx_collaborators_collection_wallet ON collection_collaborators (collection_id, wallet_address)`,
    purpose: 'Collaborator check for specific collection'
  },
  {
    name: 'idx_collaborators_status',
    query: `CREATE INDEX IF NOT EXISTS idx_collaborators_status ON collection_collaborators (wallet_address, status)`,
    purpose: 'Collaborators by status'
  },

  // ============================================
  // SUPPORT TICKETS TABLE
  // ============================================
  {
    name: 'idx_support_tickets_wallet',
    query: `CREATE INDEX IF NOT EXISTS idx_support_tickets_wallet ON support_tickets (wallet_address)`,
    purpose: 'Tickets by wallet address'
  },
  {
    name: 'idx_support_tickets_status',
    query: `CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status, created_at DESC)`,
    purpose: 'Tickets by status with ordering'
  },
  {
    name: 'idx_support_tickets_wallet_created',
    query: `CREATE INDEX IF NOT EXISTS idx_support_tickets_wallet_created ON support_tickets (wallet_address, created_at DESC)`,
    purpose: 'User tickets with ordering'
  },

  // ============================================
  // SUPPORT TICKET MESSAGES TABLE
  // ============================================
  {
    name: 'idx_ticket_messages_ticket_created',
    query: `CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created ON support_ticket_messages (ticket_id, created_at ASC)`,
    purpose: 'Messages ordered by time'
  },

  // ============================================
  // LAYERS TABLE
  // ============================================
  {
    name: 'idx_layers_collection_order',
    query: `CREATE INDEX IF NOT EXISTS idx_layers_collection_order ON layers (collection_id, display_order ASC)`,
    purpose: 'Layers ordered by display_order'
  },

  // ============================================
  // TRAITS TABLE
  // ============================================
  {
    name: 'idx_traits_layer_id',
    query: `CREATE INDEX IF NOT EXISTS idx_traits_layer_id ON traits (layer_id)`,
    purpose: 'Traits by layer'
  },
  {
    name: 'idx_traits_layer_display_order',
    query: `CREATE INDEX IF NOT EXISTS idx_traits_layer_display_order ON traits (layer_id, display_order ASC)`,
    purpose: 'Traits ordered within layer'
  },

  // ============================================
  // GENERATED ORDINALS TABLE (additional indexes)
  // ============================================
  {
    name: 'idx_ordinals_collection_created',
    query: `CREATE INDEX IF NOT EXISTS idx_ordinals_collection_created ON generated_ordinals (collection_id, created_at DESC)`,
    purpose: 'Ordinals by collection, newest first'
  },
  {
    name: 'idx_ordinals_collection_number',
    query: `CREATE INDEX IF NOT EXISTS idx_ordinals_collection_number ON generated_ordinals (collection_id, ordinal_number ASC)`,
    purpose: 'Ordinals by number within collection'
  },
  {
    name: 'idx_ordinals_collection_minted',
    query: `CREATE INDEX IF NOT EXISTS idx_ordinals_collection_minted ON generated_ordinals (collection_id, is_minted) WHERE is_minted IS FALSE OR is_minted IS NULL`,
    purpose: 'Unminted ordinals per collection'
  },
  {
    name: 'idx_ordinals_hash_lookup',
    query: `CREATE INDEX IF NOT EXISTS idx_ordinals_hash_lookup ON generated_ordinals (collection_id, trait_combination_hash)`,
    purpose: 'Duplicate detection by hash'
  },
  {
    name: 'idx_ordinals_collection_id_only',
    query: `CREATE INDEX IF NOT EXISTS idx_ordinals_collection_id_only ON generated_ordinals (collection_id)`,
    purpose: 'Fast count queries by collection'
  },

  // ============================================
  // GENERATION JOBS TABLE (additional indexes)
  // ============================================
  {
    name: 'idx_jobs_pending_created',
    query: `CREATE INDEX IF NOT EXISTS idx_jobs_pending_created ON generation_jobs (status, created_at ASC) WHERE status = 'pending'`,
    purpose: 'Pending jobs queue'
  },
  {
    name: 'idx_jobs_collection_status',
    query: `CREATE INDEX IF NOT EXISTS idx_jobs_collection_status ON generation_jobs (collection_id, status)`,
    purpose: 'Jobs by collection and status'
  },
  {
    name: 'idx_jobs_processing',
    query: `CREATE INDEX IF NOT EXISTS idx_jobs_processing ON generation_jobs (status, started_at) WHERE status = \'processing\'`,
    purpose: 'Processing jobs for timeout check'
  },

  // ============================================
  // CREDIT TRANSACTIONS TABLE
  // ============================================
  {
    name: 'idx_credit_transactions_wallet',
    query: `CREATE INDEX IF NOT EXISTS idx_credit_transactions_wallet ON credit_transactions (wallet_address, created_at DESC)`,
    purpose: 'Transaction history by wallet'
  },
  {
    name: 'idx_credit_transactions_type',
    query: `CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions (transaction_type, created_at DESC)`,
    purpose: 'Transactions by type'
  },

  // ============================================
  // FRONT PAGE THUMBNAILS TABLE
  // ============================================
  {
    name: 'idx_thumbnails_position',
    query: `CREATE INDEX IF NOT EXISTS idx_thumbnails_position ON front_page_thumbnails (position)`,
    purpose: 'Thumbnails by position'
  },

  // ============================================
  // ADMIN VISITS TABLE
  // ============================================
  {
    name: 'idx_admin_visits_wallet_visited',
    query: `CREATE INDEX IF NOT EXISTS idx_admin_visits_wallet_visited ON admin_visits (wallet_address, visited_at DESC)`,
    purpose: 'Admin visit history'
  },
];

async function createIndexes() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 Connecting to Neon database...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    console.log('🔧 Creating database indexes for improved query performance...\n');
    
    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const index of indexes) {
      try {
        await client.query(index.query);
        console.log(`✅ ${index.name}`);
        console.log(`   Purpose: ${index.purpose}\n`);
        created++;
      } catch (error) {
        if (error.message && error.message.includes('already exists')) {
          console.log(`⏭️  ${index.name} (already exists)`);
          skipped++;
        } else if (error.message && error.message.includes('does not exist')) {
          console.log(`⚠️  ${index.name} - Table does not exist, skipping`);
          skipped++;
        } else {
          console.error(`❌ ${index.name}: ${error.message}`);
          errors++;
        }
      }
    }

    // Run ANALYZE on key tables
    console.log('\n📊 Updating table statistics...');
    const tables = [
      'collections',
      'profiles', 
      'credits',
      'collection_collaborators',
      'support_tickets',
      'support_ticket_messages',
      'layers',
      'traits',
      'generated_ordinals',
      'generation_jobs',
      'credit_transactions',
      'front_page_thumbnails',
      'admin_visits'
    ];

    for (const table of tables) {
      try {
        await client.query(`ANALYZE ${table}`);
        console.log(`   ✅ Analyzed ${table}`);
      } catch (error) {
        // Table might not exist
        console.log(`   ⚠️  Could not analyze ${table}`);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`📈 Index creation complete!`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors:  ${errors}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createIndexes();
