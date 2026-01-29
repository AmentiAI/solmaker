import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// Cron job to update SOL price every 30 minutes
// (File path kept as update-btc-price for now to avoid breaking vercel.json cron config)

export async function GET() {
  try {
    const priceResponse = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true',
      {
        next: { revalidate: 0 },
        headers: {
          'Accept': 'application/json',
        }
      }
    )

    if (!priceResponse.ok) {
      throw new Error(`CoinGecko API error: ${priceResponse.status}`)
    }

    const priceData = await priceResponse.json()
    const solPrice = priceData.solana?.usd || 0
    const solChange24h = priceData.solana?.usd_24h_change || 0

    if (sql) {
      await sql`
        INSERT INTO site_settings (setting_key, setting_value, description, updated_at)
        VALUES (
          'sol_market_data',
          ${JSON.stringify({
            price_usd: solPrice,
            change_24h: solChange24h,
            updated_at: new Date().toISOString()
          })}::jsonb,
          'Solana market data - price and 24h change',
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_at = CURRENT_TIMESTAMP
      `
    }

    console.log(`[SOL Price Cron] Updated: $${solPrice.toLocaleString()} (${solChange24h >= 0 ? '+' : ''}${solChange24h.toFixed(2)}%)`)

    return NextResponse.json({
      success: true,
      data: {
        price_usd: solPrice,
        change_24h: solChange24h,
        updated_at: new Date().toISOString()
      }
    })
  } catch (error: any) {
    console.error('[SOL Price Cron] Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

export async function POST() {
  return GET()
}
