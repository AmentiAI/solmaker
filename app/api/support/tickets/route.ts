import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { ensureSupportTables } from '@/lib/support/init'

// GET /api/support/tickets - Get all tickets for a user (or all tickets for admin)
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
    const isAdmin = searchParams.get('admin') === 'true'

    if (!walletAddress && !isAdmin) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    // Rate limiting
    if (walletAddress) {
      const rateLimitKey = `get_tickets:${walletAddress}`
      const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMITS.GET_TICKETS)
      
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait a moment.' },
          { status: 429 }
        )
      }
    }

    // Check admin authorization
    let isAuthorized = false
    if (isAdmin && walletAddress) {
      isAuthorized = await checkAuthorizationServer(walletAddress, sql)
      if (!isAuthorized) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        )
      }
    }

    let tickets
    try {
      if (isAuthorized) {
        // Admin: Get all tickets
        tickets = await sql`
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
      } else {
        // User: Get only their tickets
        tickets = await sql`
          SELECT 
            t.id,
            t.subject,
            t.status,
            t.created_at,
            t.updated_at,
            COUNT(m.id) as message_count
          FROM support_tickets t
          LEFT JOIN support_ticket_messages m ON t.id = m.ticket_id
          WHERE t.wallet_address = ${walletAddress}
          GROUP BY t.id, t.subject, t.status, t.created_at, t.updated_at
          ORDER BY t.updated_at DESC
        `
      }
    } catch (dbError: any) {
      console.error('Database error fetching tickets:', dbError)
      // Check if it's a table doesn't exist error - try to initialize
      if (dbError?.message?.includes('does not exist') || dbError?.code === '42P01') {
        const initialized = await ensureSupportTables()
        if (initialized) {
          // Retry the query after initialization
          try {
            if (isAuthorized) {
              tickets = await sql`
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
            } else {
              tickets = await sql`
                SELECT 
                  t.id,
                  t.subject,
                  t.status,
                  t.created_at,
                  t.updated_at,
                  COUNT(m.id) as message_count
                FROM support_tickets t
                LEFT JOIN support_ticket_messages m ON t.id = m.ticket_id
                WHERE t.wallet_address = ${walletAddress}
                GROUP BY t.id, t.subject, t.status, t.created_at, t.updated_at
                ORDER BY t.updated_at DESC
              `
            }
          } catch (retryError) {
            return NextResponse.json(
              { error: 'Support system not initialized. Please contact support.' },
              { status: 503 }
            )
          }
        } else {
          return NextResponse.json(
            { error: 'Support system not initialized. Please contact support.' },
            { status: 503 }
          )
        }
      } else {
        throw dbError // Re-throw to be caught by outer catch
      }
    }

    return NextResponse.json({
      tickets: tickets.map((t: any) => ({
        id: t.id,
        wallet_address: t.wallet_address || undefined,
        subject: t.subject,
        status: t.status,
        created_at: t.created_at,
        updated_at: t.updated_at,
        message_count: Number(t.message_count) || 0,
      })),
    })
  } catch (error: any) {
    console.error('Error fetching tickets:', error)
    const errorMessage = error?.message || 'Failed to fetch tickets'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

// POST /api/support/tickets - Create a new ticket
export async function POST(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    // Ensure support tables exist
    await ensureSupportTables()

    const body = await request.json()
    const { wallet_address, subject, message } = body

    if (!wallet_address || !subject || !message) {
      return NextResponse.json(
        { error: 'Wallet address, subject, and message are required' },
        { status: 400 }
      )
    }

    // Rate limiting
    const rateLimitKey = `create_ticket:${wallet_address}`
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMITS.CREATE_TICKET)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: `Too many tickets created. You can create ${RATE_LIMITS.CREATE_TICKET.maxRequests} tickets per hour. Please wait before creating another ticket.`,
          resetTime: rateLimit.resetTime,
        },
        { status: 429 }
      )
    }

    const ticketId = `ticket-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    // Create ticket and initial message
    // Note: Neon serverless doesn't support transactions, so we execute sequentially
    // If the first fails, the second won't execute due to error handling
    try {
      // Create ticket
      await sql`
        INSERT INTO support_tickets (id, wallet_address, subject, status, created_at, updated_at)
        VALUES (${ticketId}, ${wallet_address}, ${subject.trim()}, 'open', NOW(), NOW())
      `

      // Create initial message
      await sql`
        INSERT INTO support_ticket_messages (id, ticket_id, message, sender_type, sender_wallet_address, created_at)
        VALUES (${messageId}, ${ticketId}, ${message.trim()}, 'user', ${wallet_address}, NOW())
      `
    } catch (dbError: any) {
      // If ticket creation succeeded but message creation failed, try to clean up
      try {
        await sql`DELETE FROM support_tickets WHERE id = ${ticketId}`
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw dbError
    }

    // Fetch the created ticket
    const [ticket] = await sql`
      SELECT 
        id,
        subject,
        status,
        created_at,
        updated_at
      FROM support_tickets
      WHERE id = ${ticketId}
    `

    return NextResponse.json({
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
      },
    })
  } catch (error) {
    console.error('Error creating ticket:', error)
    return NextResponse.json(
      { error: 'Failed to create ticket' },
      { status: 500 }
    )
  }
}


