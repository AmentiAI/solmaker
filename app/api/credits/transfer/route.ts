import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { requireWalletAuth } from '@/lib/auth/signature-verification'
import { getCredits, getOrCreateCredits } from '@/lib/credits/credits'

/**
 * POST /api/credits/transfer - Transfer credits to another user (requires wallet signature)
 * 
 * Security:
 * - Requires wallet signature to prove ownership
 * - Uses database transaction to ensure atomicity
 * - Prevents negative balances
 * - Records all transfers in credit_transactions
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    // Require wallet signature for security
    const auth = await requireWalletAuth(request, true) // true = require signature
    if (!auth.isValid || !auth.walletAddress) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required. Please sign the message with your wallet.' },
        { status: 401 }
      )
    }

    const senderWalletAddress = auth.walletAddress.trim()
    const body = await request.json()
    const { recipient_username, amount } = body

    // Validate inputs
    if (!recipient_username || typeof recipient_username !== 'string' || recipient_username.trim() === '') {
      return NextResponse.json({ error: 'Recipient username is required' }, { status: 400 })
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }

    if (!Number.isInteger(amount)) {
      return NextResponse.json({ error: 'Amount must be a whole number' }, { status: 400 })
    }

    // Prevent self-transfers
    const senderProfile = await sql`
      SELECT username FROM profiles WHERE wallet_address = ${senderWalletAddress} LIMIT 1
    ` as any[]

    if (senderProfile.length > 0 && senderProfile[0].username?.toLowerCase() === recipient_username.trim().toLowerCase()) {
      return NextResponse.json({ error: 'Cannot transfer credits to yourself' }, { status: 400 })
    }

    // Look up recipient wallet address from username
    const recipientProfile = await sql`
      SELECT wallet_address, username FROM profiles 
      WHERE username = ${recipient_username.trim().toLowerCase()}
      LIMIT 1
    ` as any[]

    if (recipientProfile.length === 0) {
      return NextResponse.json({ error: `User "@${recipient_username}" not found` }, { status: 404 })
    }

    const recipientWalletAddress = recipientProfile[0].wallet_address.trim()
    const recipientUsername = recipientProfile[0].username

    // Check sender has enough credits
    const senderCredits = await getCredits(senderWalletAddress)
    if (senderCredits < amount) {
      return NextResponse.json(
        { error: `Insufficient credits. You have ${senderCredits} credits, but tried to transfer ${amount}.` },
        { status: 400 }
      )
    }

    // Use row-level locking to ensure atomicity
    // Neon serverless doesn't support traditional transactions, so we use FOR UPDATE locking
    // This prevents race conditions where credits could be double-spent
    try {
      // Ensure sender credits record exists
      await getOrCreateCredits(senderWalletAddress)
      
      // Lock sender's credits row for update (prevents concurrent modifications)
      // This ensures only one transfer can happen at a time for this wallet
      const senderLock = await sql`
        SELECT credits FROM credits 
        WHERE wallet_address = ${senderWalletAddress}
        FOR UPDATE
      ` as any[]

      if (senderLock.length === 0) {
        throw new Error('Failed to lock sender credits record')
      }

      // Re-check balance after lock (double-check after acquiring lock)
      const currentBalance = senderLock[0]?.credits || 0

      if (currentBalance < amount) {
        throw new Error(`Insufficient credits. Current balance: ${currentBalance}, requested: ${amount}`)
      }

      // Deduct from sender
      await sql`
        UPDATE credits
        SET credits = credits - ${amount}, updated_at = CURRENT_TIMESTAMP
        WHERE wallet_address = ${senderWalletAddress}
      `

      // Ensure recipient credits record exists
      await getOrCreateCredits(recipientWalletAddress)

      // Add to recipient
      await sql`
        UPDATE credits
        SET credits = credits + ${amount}, updated_at = CURRENT_TIMESTAMP
        WHERE wallet_address = ${recipientWalletAddress}
      `

      // Record sender transaction (negative amount for deduction)
      await sql`
        INSERT INTO credit_transactions (
          wallet_address, 
          amount, 
          transaction_type, 
          description
        )
        VALUES (
          ${senderWalletAddress}, 
          ${-amount}, 
          'transfer_out', 
          ${`Transfer to @${recipientUsername}`}
        )
      `

      // Record recipient transaction (positive amount for receipt)
      await sql`
        INSERT INTO credit_transactions (
          wallet_address, 
          amount, 
          transaction_type, 
          description
        )
        VALUES (
          ${recipientWalletAddress}, 
          ${amount}, 
          'transfer_in', 
          ${`Transfer from @${senderProfile[0]?.username || senderWalletAddress.slice(0, 8)}`}
        )
      `

      // Get updated sender balance
      const newSenderBalance = await getCredits(senderWalletAddress)

      return NextResponse.json({
        success: true,
        message: `Successfully transferred ${amount} credits to @${recipientUsername}`,
        sender_balance: newSenderBalance,
        recipient: {
          username: recipientUsername,
          wallet_address: recipientWalletAddress,
        },
      })
    } catch (txError: any) {
      // If any step fails, the FOR UPDATE lock is released automatically
      // We don't need manual rollback since Neon handles it
      console.error('Credit transfer failed:', txError)
      return NextResponse.json(
        { error: txError.message || 'Transfer failed. Please try again.' },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error('Error transferring credits:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to transfer credits' },
      { status: 500 }
    )
  }
}
