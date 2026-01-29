import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { MAX_PER_TRANSACTION } from '@/lib/minting-constants'
import { calculateWhitelistRemaining, calculatePublicPhaseRemaining, validateMintQuantity } from '@/lib/minting-utils'
import { reserveOrdinals } from '@/lib/reservation-utils'

/**
 * POST /api/launchpad/[collectionId]/reserve - Reserve an ordinal for minting
 * This prevents duplicate mints when multiple users try to mint simultaneously
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    
    // Validate UUID format to prevent database errors from invalid IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!collectionId || !uuidRegex.test(collectionId)) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }
    
    const body = await request.json()
    const { wallet_address, phase_id, quantity = 1, ordinal_id } = body

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
    }

    // Validate quantity against global MAX_PER_TRANSACTION limit
    if (quantity < 1 || quantity > MAX_PER_TRANSACTION) {
      return NextResponse.json({ error: `Quantity must be between 1 and ${MAX_PER_TRANSACTION}` }, { status: 400 })
    }

    // First, release any expired reservations
    await sql`
      UPDATE ordinal_reservations 
      SET status = 'expired'
      WHERE status = 'reserved' 
      AND expires_at < NOW()
    `

    // Get collection and check if minting is active
    // Collection must be launched (launched_at IS NOT NULL and collection_status = 'launchpad_live')
    const collectionResult = await sql`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
        -- Use is_minted flag as source of truth (not transaction count)
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id AND is_minted = true) as minted_count
      FROM collections c
      WHERE c.id = ${collectionId}
        AND COALESCE(c.collection_status, 'draft') = 'launchpad_live'
        AND c.launched_at IS NOT NULL
    ` as any[]
    const collection = collectionResult?.[0] || null

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found or not launched' }, { status: 404 })
    }

    // Check if we've reached the cap_supply (if set)
    const totalSupply = parseInt(collection.total_supply || '0', 10)
    const mintedCount = parseInt(collection.minted_count || '0', 10)
    const capSupply = collection.cap_supply !== null && collection.cap_supply !== undefined 
      ? parseInt(String(collection.cap_supply), 10) 
      : null
    
    // Use cap_supply if set, otherwise use total_supply
    const maxSupply = capSupply !== null ? capSupply : totalSupply
    
    // Check if we can mint the requested quantity
    if (mintedCount + quantity > maxSupply) {
      const remaining = Math.max(0, maxSupply - mintedCount)
      return NextResponse.json({ 
        error: `Cannot mint ${quantity} ordinal(s). Only ${remaining} remaining (${mintedCount}/${maxSupply} minted).` 
      }, { status: 400 })
    }

    // Check phase eligibility if phase_id provided
    if (phase_id) {
      const phaseResult = await sql`
        SELECT * FROM mint_phases WHERE id = ${phase_id} AND collection_id = ${collectionId}
      ` as any[]
      const phase = phaseResult?.[0] || null

      if (!phase) {
        return NextResponse.json({ error: 'Phase not found' }, { status: 404 })
      }

      // Check phase time window dynamically (don't rely on is_active flag)
      const now = new Date()
      const startTime = new Date(phase.start_time)
      const endTime = phase.end_time ? new Date(phase.end_time) : null

      // Check if phase has started
      if (startTime > now) {
        return NextResponse.json({ error: 'Phase has not started yet' }, { status: 400 })
      }

      // Check if phase has ended
      if (endTime && endTime < now) {
        return NextResponse.json({ error: 'Phase has ended' }, { status: 400 })
      }

      // Check if phase is marked as completed (but still respect time window)
      if (phase.is_completed && endTime && endTime < now) {
        return NextResponse.json({ error: 'Phase is completed' }, { status: 400 })
      }

      // Check whitelist if required
      if (phase.whitelist_only && phase.whitelist_id) {
        // First verify user is on whitelist
        const whitelistResult = await sql`
          SELECT * FROM whitelist_entries 
          WHERE whitelist_id = ${phase.whitelist_id} 
          AND wallet_address = ${wallet_address}
        ` as any[]
        const whitelistEntry = whitelistResult?.[0] || null

        if (!whitelistEntry) {
          return NextResponse.json({ error: 'Not on whitelist for this phase' }, { status: 403 })
        }

        // Use shared utility to calculate remaining - use phase's max_per_wallet, not whitelist allocation
        const remainingResult = await calculateWhitelistRemaining(
          wallet_address,
          collectionId,
          phase_id,
          phase.whitelist_id,
          phase.max_per_wallet
        )

        if (!remainingResult) {
          return NextResponse.json({ error: 'Unable to calculate remaining allocation' }, { status: 500 })
        }

        // Validate quantity against remaining (including this reservation)
        if (quantity > remainingResult.remaining) {
          return NextResponse.json({ 
            error: `Cannot reserve ${quantity} ordinal(s). You have ${remainingResult.mintedCount} pending/completed mint(s) and max is ${remainingResult.maxAllowed ?? 'unlimited'}` 
          }, { status: 400 })
        }
      } else if (phase.max_per_wallet) {
        // Public phase with max_per_wallet - use shared utility
        const remainingResult = await calculatePublicPhaseRemaining(
          wallet_address,
          collectionId,
          phase_id,
          phase.max_per_wallet
        )

        if (!remainingResult) {
          return NextResponse.json({ error: 'Unable to calculate remaining mints' }, { status: 500 })
        }

        // Validate quantity against remaining (including this reservation)
        if (quantity > remainingResult.remaining) {
          return NextResponse.json({ 
            error: `Cannot reserve ${quantity} ordinal(s). You have ${remainingResult.mintedCount} pending/completed mint(s) and max is ${remainingResult.maxAllowed}` 
          }, { status: 400 })
        }
      }

      // Check phase allocation
      if (phase.phase_allocation && phase.phase_minted >= phase.phase_allocation) {
        return NextResponse.json({ error: 'Phase allocation exhausted' }, { status: 400 })
      }
    }

    // Reserve ordinals using simplified utility (2 minute expiry as requested)
    // For choices mint, pass specific ordinal_id(s)
    const specificOrdinalIds = ordinal_id ? [ordinal_id] : undefined
    const { reservations, ordinals } = await reserveOrdinals(
      collectionId,
      wallet_address,
      phase_id || null,
      quantity,
      2, // 2 minutes expiry
      specificOrdinalIds
    )

    // For backwards compatibility, return single objects if quantity=1
    if (quantity === 1) {
      return NextResponse.json({
        success: true,
        reservation: {
          id: reservations[0].reservation_id,
          ordinal_id: reservations[0].ordinal_id,
          expires_at: reservations[0].expires_at,
        },
        ordinal: ordinals[0],
        message: 'Ordinal reserved for 2 minutes',
      })
    }

    // For batch, return arrays
    return NextResponse.json({
      success: true,
      reservations: reservations.map(r => ({
        id: r.reservation_id,
        ordinal_id: r.ordinal_id,
        expires_at: r.expires_at,
      })),
      ordinals,
      quantity: ordinals.length,
      message: `${ordinals.length} ordinals reserved for 2 minutes`,
    })
  } catch (error) {
    console.error('Error reserving ordinal:', error)
    return NextResponse.json({ error: 'Failed to reserve ordinal' }, { status: 500 })
  }
}

/**
 * DELETE /api/launchpad/[collectionId]/reserve - Cancel a reservation
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    
    // Validate UUID format to prevent database errors from invalid IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!collectionId || !uuidRegex.test(collectionId)) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }
    
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')
    const reservationId = searchParams.get('reservation_id')
    const ordinalId = searchParams.get('ordinal_id')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
    }

    if (reservationId) {
      // Cancel specific reservation
      await sql`
        UPDATE ordinal_reservations 
        SET status = 'cancelled'
        WHERE id = ${reservationId}
        AND reserved_by = ${walletAddress}
        AND status = 'reserved'
      `
    } else if (ordinalId) {
      // Cancel reservation for specific ordinal
      await sql`
        UPDATE ordinal_reservations 
        SET status = 'cancelled'
        WHERE collection_id = ${collectionId}
        AND ordinal_id = ${ordinalId}
        AND reserved_by = ${walletAddress}
        AND status = 'reserved'
      `
    } else {
      // Cancel all reservations for this wallet/collection
      await sql`
        UPDATE ordinal_reservations 
        SET status = 'cancelled'
        WHERE collection_id = ${collectionId}
        AND reserved_by = ${walletAddress}
        AND status = 'reserved'
      `
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error cancelling reservation:', error)
    return NextResponse.json({ error: 'Failed to cancel reservation' }, { status: 500 })
  }
}

/**
 * PATCH /api/launchpad/[collectionId]/reserve - Complete a reservation (after successful mint)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    
    // Validate UUID format to prevent database errors from invalid IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!collectionId || !uuidRegex.test(collectionId)) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }
    
    const body = await request.json()
    const { wallet_address, reservation_id, inscription_id } = body

    if (!wallet_address || !reservation_id) {
      return NextResponse.json({ error: 'Wallet address and reservation_id required' }, { status: 400 })
    }

    // Complete the reservation using simplified utility
    const { completeReservation } = await import('@/lib/reservation-utils')
    await completeReservation(reservation_id, wallet_address, inscription_id || undefined)

    // Get the reservation to find the ordinal and phase
    const reservationResult = await sql`
      SELECT * FROM ordinal_reservations WHERE id = ${reservation_id}
    ` as any[]
    const reservation = reservationResult?.[0] || null

    if (reservation) {
      // Mark ordinal as minted
      await sql`
        UPDATE generated_ordinals SET is_minted = true WHERE id = ${reservation.ordinal_id}
      `

      // Update collection minted count
      await sql`
        UPDATE collections SET total_minted = total_minted + 1 WHERE id = ${collectionId}
      `

      // Update wallet mints for phase (for tracking purposes)
      // NOTE: phase_minted and whitelist_entries.minted_count are updated on reveal broadcast,
      // not here, to match the query logic that counts only revealed mints
      if (reservation.phase_id) {
        // Update wallet mints for phase (used for analytics, not enforcement)
        await sql`
          INSERT INTO phase_wallet_mints (phase_id, wallet_address, mint_count, last_mint_at)
          VALUES (${reservation.phase_id}, ${wallet_address}, 1, NOW())
          ON CONFLICT (phase_id, wallet_address) DO UPDATE SET
            mint_count = phase_wallet_mints.mint_count + 1,
            last_mint_at = NOW()
        `
        
        // NOTE: phase_minted is updated in /api/mint/reveal when reveal is broadcast
        // NOTE: whitelist_entries.minted_count is updated in /api/mint/reveal when reveal is broadcast
        // This ensures consistency with the query logic that counts only revealed mints
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error completing reservation:', error)
    return NextResponse.json({ error: 'Failed to complete reservation' }, { status: 500 })
  }
}
