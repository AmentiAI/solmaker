import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { ensureSupportTables } from '@/lib/support/init'

// GET /api/support/admin/tickets - Get all tickets (admin only)
export async function GET(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    // Ensure support tables exist
    await ensureSupportTables()

    const searchParams = request.nextUrl.searchParams
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    // Check admin authorization
    const isAuthorized = await checkAuthorizationServer(walletAddress, sql)
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Get all tickets with message counts
    const tickets = await sql`
      SELECT 
        t.id,
        t.wallet_address,
        t.subject,
        t.status,
        t.created_at,
        t.updated_at,
        COUNT(m.id) as message_count
      FROM support_tickets t
      LEFT JOIN support_ticket_messages m ON t.id = m.ticket_id
      GROUP BY t.id, t.wallet_address, t.subject, t.status, t.created_at, t.updated_at
      ORDER BY t.updated_at DESC
    `

    return NextResponse.json({
      tickets: tickets.map((t: any) => ({
        id: t.id,
        wallet_address: t.wallet_address,
        subject: t.subject,
        status: t.status,
        created_at: t.created_at,
        updated_at: t.updated_at,
        message_count: Number(t.message_count) || 0,
      })),
    })
  } catch (error) {
    console.error('Error fetching admin tickets:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tickets' },
      { status: 500 }
    )
  }
}




