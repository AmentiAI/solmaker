import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database';


export async function POST(request: NextRequest) {
  if (!sql) {
    // Silently fail if database is not available
    return NextResponse.json({ success: false, error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { wallet_address, user_agent } = await request.json()

    // Get IP address from request headers
    const ipAddress = 
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') ||
      null

    // Log the visit
    await sql`
      INSERT INTO admin_visits (wallet_address, user_agent, ip_address, visited_at)
      VALUES (${wallet_address || null}, ${user_agent || null}, ${ipAddress || null}, NOW())
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error tracking admin visit:', error)
    // Don't fail the request if tracking fails
    return NextResponse.json({ success: false, error: 'Failed to track visit' }, { status: 500 })
  }
}

