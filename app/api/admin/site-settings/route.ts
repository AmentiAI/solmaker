import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, isAuthorized } from '@/lib/auth/access-control'
import { sql } from '@/lib/database'

// Ensure site_settings table exists
async function ensureTableExists() {
  if (!sql) return

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS site_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        setting_key VARCHAR(255) NOT NULL UNIQUE,
        setting_value JSONB NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings(setting_key)
    `

    // Insert default settings if they don't exist
    await sql`
      INSERT INTO site_settings (setting_key, setting_value, description)
      VALUES ('show_credit_purchase', ${JSON.stringify(true)}, 'Whether to show credit purchase functionality across the site')
      ON CONFLICT (setting_key) DO NOTHING
    `

    // Seed Solana network defaults from env vars
    const defaultDevnetRpc = process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com'
    const defaultMainnetRpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
    
    await sql`
      INSERT INTO site_settings (setting_key, setting_value, description)
      VALUES 
        ('solana_network', ${JSON.stringify('devnet')}, 'Active Solana network (devnet or mainnet-beta)'),
        ('solana_rpc_devnet', ${JSON.stringify(defaultDevnetRpc)}, 'Solana devnet RPC endpoint'),
        ('solana_rpc_mainnet', ${JSON.stringify(defaultMainnetRpc)}, 'Solana mainnet RPC endpoint')
      ON CONFLICT (setting_key) DO NOTHING
    `
    
    console.log('[Site Settings] Ensured table exists')
  } catch (error) {
    console.error('[Site Settings] Error ensuring table exists:', error)
  }
}

// GET - Get all site settings or a specific setting
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')
    const settingKey = searchParams.get('key')

    // For public access (no wallet_address), only allow getting specific settings
    if (!walletAddress) {
      if (!settingKey) {
        return NextResponse.json({ error: 'Setting key is required for public access' }, { status: 400 })
      }
      
      await ensureTableExists()
      
      const result = await sql`
        SELECT setting_value
        FROM site_settings
        WHERE setting_key = ${settingKey}
      ` as any[]
      
      if (Array.isArray(result) && result.length > 0) {
        const value = result[0].setting_value
        // Parse JSONB value (it might be a string or already parsed)
        const parsedValue = typeof value === 'string' ? JSON.parse(value) : value
        return NextResponse.json({ 
          key: settingKey,
          value: parsedValue 
        })
      }
      
      return NextResponse.json({ error: 'Setting not found' }, { status: 404 })
    }

    // Admin access - get all settings
    if (!isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    await ensureTableExists()

    if (settingKey) {
      const result = await sql`
        SELECT setting_key, setting_value, description, updated_at
        FROM site_settings
        WHERE setting_key = ${settingKey}
      ` as any[]
      
      if (Array.isArray(result) && result.length > 0) {
        const setting = result[0]
        const value = typeof setting.setting_value === 'string' 
          ? JSON.parse(setting.setting_value) 
          : setting.setting_value
        return NextResponse.json({
          key: setting.setting_key,
          value,
          description: setting.description,
          updated_at: setting.updated_at
        })
      }
      
      return NextResponse.json({ error: 'Setting not found' }, { status: 404 })
    }

    // Get all settings
    const result = await sql`
      SELECT setting_key, setting_value, description, updated_at
      FROM site_settings
      ORDER BY setting_key
    ` as any[]

    const settings = Array.isArray(result) ? result.map((s: any) => {
      let value = s.setting_value
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value)
        } catch {
          // Not valid JSON - keep as plain string
        }
      }
      return {
        key: s.setting_key,
        value,
        description: s.description,
        updated_at: s.updated_at
      }
    }) : []

    return NextResponse.json({ settings })
  } catch (error: any) {
    console.error('[Site Settings API] Error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch settings',
      details: error?.message 
    }, { status: 500 })
  }
}

// PUT - Update a site setting (admin only)
export async function PUT(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address, key, value } = body

    if (!wallet_address || !isAdmin(wallet_address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!key) {
      return NextResponse.json({ error: 'Setting key is required' }, { status: 400 })
    }

    await ensureTableExists()

    // Update or insert the setting
    // Pass JSON.stringify(value) directly - Neon driver handles JSONB conversion
    const jsonValue = JSON.stringify(value)
    const result = await sql`
      INSERT INTO site_settings (setting_key, setting_value, updated_at)
      VALUES (${key}, ${jsonValue}, CURRENT_TIMESTAMP)
      ON CONFLICT (setting_key) 
      DO UPDATE SET 
        setting_value = EXCLUDED.setting_value,
        updated_at = CURRENT_TIMESTAMP
      RETURNING setting_key, setting_value, updated_at
    ` as any[]

    if (Array.isArray(result) && result.length > 0) {
      const setting = result[0]
      let parsedValue = setting.setting_value
      if (typeof parsedValue === 'string') {
        try {
          parsedValue = JSON.parse(parsedValue)
        } catch {
          // Not valid JSON - keep as plain string
        }
      }
      
      return NextResponse.json({
        success: true,
        key: setting.setting_key,
        value: parsedValue,
        updated_at: setting.updated_at
      })
    }

    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 })
  } catch (error: any) {
    console.error('[Site Settings API] Error updating setting:', error)
    return NextResponse.json({ 
      error: 'Failed to update setting',
      details: error?.message 
    }, { status: 500 })
  }
}

