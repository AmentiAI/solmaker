import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// Public API to get SOL market data for header display
// Data is populated by the cron job that runs every 30 minutes

export async function GET() {
  try {
    if (!sql) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'Database not available'
      })
    }

    // Try to get cached data from site_settings
    const result = await sql`
      SELECT setting_value, updated_at
      FROM site_settings
      WHERE setting_key = 'sol_market_data'
    ` as any[]

    if (Array.isArray(result) && result.length > 0) {
      const data = result[0].setting_value
      const updatedAt = result[0].updated_at

      return NextResponse.json({
        success: true,
        data: typeof data === 'string' ? JSON.parse(data) : data,
        cached: true,
        updated_at: updatedAt
      })
    }

    // Fallback: try to fetch SOL price directly from CoinGecko
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true',
        { next: { revalidate: 300 } }
      )
      if (response.ok) {
        const data = await response.json()
        if (data.solana) {
          return NextResponse.json({
            success: true,
            data: {
              price_usd: data.solana.usd || 0,
              change_24h: data.solana.usd_24h_change || 0,
              updated_at: new Date().toISOString(),
            },
            cached: false
          })
        }
      }
    } catch {
      // Fallback failed, return null
    }

    return NextResponse.json({
      success: true,
      data: null,
      message: 'Market data not yet available'
    })
  } catch (error: any) {
    console.error('[Market Data API] Error:', error)
    return NextResponse.json({
      success: true,
      data: null,
      error: error.message
    })
  }
}
