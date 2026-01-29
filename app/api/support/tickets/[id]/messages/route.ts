import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { ensureSupportTables } from '@/lib/support/init'

// GET /api/support/tickets/[id]/messages - Get all messages for a ticket
export async function GET(
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
    const searchParams = request.nextUrl.searchParams
    const walletAddress = searchParams.get('wallet_address')
    const isAdmin = searchParams.get('admin') === 'true'

    if (!walletAddress && !isAdmin) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    // Check if ticket exists and user has access
    const tickets = await sql`
      SELECT wallet_address FROM support_tickets WHERE id = ${id}
    ` as any[]
    const ticket = tickets[0]

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      )
    }

    // Check authorization
    if (!isAdmin) {
      if (ticket.wallet_address !== walletAddress) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        )
      }
    } else if (walletAddress) {
      const isAuthorized = await checkAuthorizationServer(walletAddress, sql)
      if (!isAuthorized) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        )
      }
    }

    // Get messages
    const messages = await sql`
      SELECT 
        id,
        message,
        sender_type,
        sender_wallet_address,
        created_at
      FROM support_ticket_messages
      WHERE ticket_id = ${id}
      ORDER BY created_at ASC
    ` as any[]

    return NextResponse.json({
      messages: messages.map((m: any) => ({
        id: m.id,
        message: m.message,
        sender_type: m.sender_type,
        sender_wallet_address: m.sender_wallet_address,
        created_at: m.created_at,
      })),
    })
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}

// POST /api/support/tickets/[id]/messages - Send a message to a ticket
export async function POST(
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
    const { wallet_address, message, is_admin } = body

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Check if ticket exists
    const tickets = await sql`
      SELECT wallet_address, status FROM support_tickets WHERE id = ${id}
    ` as any[]
    const ticket = tickets[0]

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      )
    }

    // Determine if this is an admin message
    let isAdminMessage = false
    if (is_admin && wallet_address) {
      isAdminMessage = await checkAuthorizationServer(wallet_address, sql)
      if (!isAdminMessage) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        )
      }
    }

    // Check authorization for user messages
    if (!isAdminMessage) {
      if (!wallet_address) {
        return NextResponse.json(
          { error: 'Wallet address is required' },
          { status: 400 }
        )
      }
      if (ticket.wallet_address !== wallet_address) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        )
      }

      // Rate limiting for user messages
      const rateLimitKey = `send_message:${wallet_address}:${id}`
      const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMITS.SEND_MESSAGE)

      if (!rateLimit.allowed) {
        return NextResponse.json(
          { 
            error: `Too many messages. You can send ${RATE_LIMITS.SEND_MESSAGE.maxRequests} messages per minute. Please wait a moment.`,
            resetTime: rateLimit.resetTime,
          },
          { status: 429 }
        )
      }
    }

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    // Create message and update ticket timestamp
    // Note: Neon serverless doesn't support transactions, so we execute sequentially
    try {
      await sql`
        INSERT INTO support_ticket_messages (id, ticket_id, message, sender_type, sender_wallet_address, created_at)
        VALUES (${messageId}, ${id}, ${message.trim()}, ${isAdminMessage ? 'admin' : 'user'}, ${wallet_address || null}, NOW())
      `

      // Update ticket status if it was resolved/closed and user is responding
      if (!isAdminMessage && ticket.status !== 'open' && ticket.status !== 'in_progress') {
        await sql`
          UPDATE support_tickets
          SET status = 'open', updated_at = NOW()
          WHERE id = ${id}
        `
      } else {
        // Just update the timestamp
        await sql`
          UPDATE support_tickets
          SET updated_at = NOW()
          WHERE id = ${id}
        `
      }
    } catch (dbError: any) {
      // If message creation succeeded but update failed, try to clean up
      try {
        await sql`DELETE FROM support_ticket_messages WHERE id = ${messageId}`
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw dbError
    }

    // Fetch the created message
    const messages = await sql`
      SELECT 
        id,
        message,
        sender_type,
        sender_wallet_address,
        created_at
      FROM support_ticket_messages
      WHERE id = ${messageId}
    ` as any[]
    const newMessage = messages[0]

    return NextResponse.json({
      message: {
        id: newMessage.id,
        message: newMessage.message,
        sender_type: newMessage.sender_type,
        sender_wallet_address: newMessage.sender_wallet_address,
        created_at: newMessage.created_at,
      },
    })
  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}




