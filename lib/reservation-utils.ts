/**
 * Simplified reservation system for ordinal locking
 * Handles reservation creation, validation, expiry, and cleanup
 */

import { sql } from '@/lib/database'
import { MAX_PER_TRANSACTION } from './minting-constants'

export interface ReservationResult {
  reservation_id: string
  ordinal_id: string
  expires_at: string
}

/**
 * Release expired reservations (called before any reservation operation)
 * This ensures we don't hold onto stale reservations
 */
export async function releaseExpiredReservations(): Promise<number> {
  if (!sql) return 0

  const result = await sql`
    UPDATE ordinal_reservations 
    SET status = 'expired'
    WHERE status = 'reserved' 
      AND expires_at < NOW()
  ` as any[]

  return Array.isArray(result) ? result.length : 0
}

/**
 * Reserve ordinals for minting
 * Returns array of reservations with ordinal details
 */
export async function reserveOrdinals(
  collectionId: string,
  walletAddress: string,
  phaseId: string | null,
  quantity: number,
  expiryMinutes: number = 2, // Default 2 minutes as requested
  specificOrdinalIds?: string[] // For choices mint - reserve specific ordinals
): Promise<{ reservations: ReservationResult[], ordinals: any[] }> {
  if (!sql) {
    throw new Error('Database connection not available')
  }

  if (quantity < 1 || quantity > MAX_PER_TRANSACTION) {
    throw new Error(`Quantity must be between 1 and ${MAX_PER_TRANSACTION}`)
  }

  // Always release expired reservations first
  await releaseExpiredReservations()

  const reservations: ReservationResult[] = []
  const ordinals: any[] = []

  // If specific ordinal IDs provided (choices mint), use those; otherwise select randomly
  for (let i = 0; i < quantity; i++) {
    let ordinal: any = null
    
    if (specificOrdinalIds && specificOrdinalIds[i]) {
      // Reserve specific ordinal (choices mint)
      // Only select fields needed for reservation, exclude prompt and traits
      const ordinalResult = await sql`
        SELECT 
          go.id,
          go.collection_id,
          go.ordinal_number,
          go.image_url,
          go.thumbnail_url,
          go.compressed_image_url,
          go.compressed_size_kb,
          go.file_size_bytes,
          go.is_minted,
          go.created_at
        FROM generated_ordinals go
        WHERE go.id = ${specificOrdinalIds[i]}
          AND go.collection_id = ${collectionId}
          AND go.is_minted = false
          AND NOT EXISTS (
            SELECT 1 FROM ordinal_reservations r 
            WHERE r.ordinal_id = go.id 
              AND r.status = 'reserved'
              AND r.expires_at > NOW()
          )
        FOR UPDATE SKIP LOCKED
      ` as any[]
      ordinal = ordinalResult?.[0] || null
    } else {
      // Random selection (hidden mint)
      // OPTIMIZATION: Use index idx_generated_ordinals_collection_minted for fast lookup
      // FOR UPDATE SKIP LOCKED prevents race conditions and deadlocks
      // Only select fields needed for reservation, exclude prompt and traits
      const ordinalResult = await sql`
        SELECT 
          go.id,
          go.collection_id,
          go.ordinal_number,
          go.image_url,
          go.thumbnail_url,
          go.compressed_image_url,
          go.compressed_size_kb,
          go.file_size_bytes,
          go.is_minted,
          go.created_at
        FROM generated_ordinals go
        WHERE go.collection_id = ${collectionId}
          AND go.is_minted = false
          AND NOT EXISTS (
            SELECT 1 FROM ordinal_reservations r 
            WHERE r.ordinal_id = go.id 
              AND r.status = 'reserved'
              AND r.expires_at > NOW()
          )
        ORDER BY RANDOM()
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      ` as any[]
      ordinal = ordinalResult?.[0] || null
    }

    if (!ordinal) {
      // If we can't reserve all requested, cancel the ones we did reserve
      if (reservations.length > 0) {
        await cancelReservations(reservations.map(r => r.reservation_id))
      }
      throw new Error(`Only ${i} ordinal(s) available, requested ${quantity}`)
    }

    // Create reservation with specified expiry
    // Use PostgreSQL's make_interval() function with positional parameters
    // make_interval(years, months, weeks, days, hours, mins, secs)
    // We only need minutes, so all other parameters are 0
    const intervalMinutes = Number(expiryMinutes)
    if (isNaN(intervalMinutes) || intervalMinutes < 0) {
      throw new Error(`Invalid expiry minutes: ${expiryMinutes}`)
    }
    
    const reservationResult = await sql`
      INSERT INTO ordinal_reservations (
        collection_id,
        ordinal_id,
        phase_id,
        reserved_by,
        expires_at
      ) VALUES (
        ${collectionId},
        ${ordinal.id},
        ${phaseId || null},
        ${walletAddress},
        NOW() + make_interval(0, 0, 0, 0, 0, ${intervalMinutes}, 0)
      )
      RETURNING id, ordinal_id, expires_at
    ` as any[]
    const reservation = reservationResult?.[0] || null

    if (!reservation) {
      throw new Error('Failed to create reservation')
    }

    reservations.push({
      reservation_id: reservation.id,
      ordinal_id: reservation.ordinal_id,
      expires_at: reservation.expires_at,
    })
    ordinals.push(ordinal)
  }

  return { reservations, ordinals }
}

/**
 * Validate that reservations exist and are still valid
 * Returns true if all ordinals have valid reservations
 */
export async function validateReservations(
  ordinalIds: string[],
  walletAddress: string,
  phaseId: string | null,
  collectionId: string
): Promise<{ valid: boolean; error?: string; reservations?: any[] }> {
  if (!sql) {
    return { valid: false, error: 'Database connection not available' }
  }

  // Release expired reservations first
  await releaseExpiredReservations()

  // Check if user has valid reservations for ALL ordinals
  const reservationsResult = await sql`
    SELECT * FROM ordinal_reservations
    WHERE collection_id = ${collectionId}
      AND ordinal_id = ANY(${ordinalIds})
      AND reserved_by = ${walletAddress}
      AND status = 'reserved'
      AND expires_at > NOW()
    ORDER BY reserved_at DESC
  ` as any[]

  // Group reservations by ordinal_id
  const reservationsByOrdinal = new Map()
  reservationsResult.forEach((r: any) => {
    if (!reservationsByOrdinal.has(r.ordinal_id)) {
      reservationsByOrdinal.set(r.ordinal_id, r)
    }
  })

  // Verify all ordinals have valid reservations
  for (const ordinalId of ordinalIds) {
    const reservation = reservationsByOrdinal.get(ordinalId)
    if (!reservation) {
      return {
        valid: false,
        error: `Reservation expired or not found for ordinal. Please click "Mint Now" again to reserve a new ordinal.`,
      }
    }

    // Verify the reservation matches the phase (if phase_id provided)
    if (phaseId && reservation.phase_id !== phaseId) {
      return {
        valid: false,
        error: 'Reservation does not match the selected phase. Please click "Mint Now" again.',
      }
    }
  }

  return {
    valid: true,
    reservations: Array.from(reservationsByOrdinal.values()),
  }
}

/**
 * Cancel specific reservations (cleanup on error)
 */
export async function cancelReservations(reservationIds: string[]): Promise<void> {
  if (!sql || reservationIds.length === 0) return

  await sql`
    UPDATE ordinal_reservations 
    SET status = 'cancelled'
    WHERE id = ANY(${reservationIds})
      AND status = 'reserved'
  `
}

/**
 * Complete a reservation (mark as completed after successful mint)
 */
export async function completeReservation(
  reservationId: string,
  walletAddress: string,
  mintAddress?: string
): Promise<void> {
  if (!sql) return

  await sql`
    UPDATE ordinal_reservations SET
      status = 'completed',
      mint_address = ${mintAddress || null},
      completed_at = NOW()
    WHERE id = ${reservationId}
      AND reserved_by = ${walletAddress}
      AND status = 'reserved'
  `
}

/**
 * Get all expired reservations that need to be released
 * Used by cron jobs
 */
export async function getExpiredReservations(limit: number = 100): Promise<any[]> {
  if (!sql) return []

  const result = await sql`
    SELECT id, collection_id, ordinal_id, reserved_by
    FROM ordinal_reservations
    WHERE status = 'reserved'
      AND expires_at < NOW()
    LIMIT ${limit}
  ` as any[]

  return Array.isArray(result) ? result : []
}

/**
 * Release expired reservations (for cron jobs)
 * Returns count of released reservations
 */
export async function releaseExpiredReservationsBatch(limit: number = 100): Promise<number> {
  if (!sql) return 0

  const result = await sql`
    UPDATE ordinal_reservations
    SET status = 'expired'
    WHERE status = 'reserved'
      AND expires_at < NOW()
      AND expires_at > NOW() - INTERVAL '5 minutes' -- Only expire recent ones
    RETURNING id
  ` as any[]

  return Array.isArray(result) ? result.length : 0
}

