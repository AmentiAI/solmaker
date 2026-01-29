import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { ensureSupportTables } from '@/lib/support/init'

// PATCH /api/support/admin/tickets/[id]/status - Update ticket status (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!sql) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    // Ensure support tables exist
    await ensureSupportTables()

    const { id } = await params
    const body = await request.json()
    const { wallet_address, status } = body

    if (!wallet_address) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    if (!status || !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return NextResponse.json(
        { error: 'Valid status is required (open, in_progress, resolved, closed)' },
        { status: 400 }
      )
    }

    // Check admin authorization
    const isAuthorized = await checkAuthorizationServer(wallet_address, sql)
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Update ticket status
    await sql`
      UPDATE support_tickets
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
    `

    // Fetch updated ticket
    const [ticket] = await sql`
      SELECT 
        id,
        wallet_address,
        subject,
        status,
        created_at,
        updated_at
      FROM support_tickets
      WHERE id = ${id}
    `

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ticket: {
        id: ticket.id,
        wallet_address: ticket.wallet_address,
        subject: ticket.subject,
        status: ticket.status,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
      },
    })
  } catch (error) {
    console.error('Error updating ticket status:', error)
    return NextResponse.json(
      { error: 'Failed to update ticket status' },
      { status: 500 }
    )
  }
}




