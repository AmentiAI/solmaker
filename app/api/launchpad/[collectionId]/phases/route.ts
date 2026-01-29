import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAuthorized } from '@/lib/auth/access-control'
import { requireWalletAuth } from '@/lib/auth/signature-verification'

/**
 * GET /api/launchpad/[collectionId]/phases - Get all phases for a collection
 * Requires wallet_address param and verifies ownership/collaborator access
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    // Authorization check for management endpoints
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }

    // Get collection owner
    const collectionResult = await sql`
      SELECT wallet_address FROM collections WHERE id = ${collectionId}
    ` as any[]
    const collection = collectionResult?.[0] || null

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    // Check if user is owner, collaborator, or admin
    const isAdmin = isAuthorized(walletAddress)
    const isOwner = walletAddress.trim() === collection.wallet_address
    let hasAccess = isOwner || isAdmin

    if (!hasAccess) {
      const collaboratorResult = await sql`
        SELECT role FROM collection_collaborators
        WHERE collection_id = ${collectionId}
          AND wallet_address = ${walletAddress.trim()}
          AND status = 'accepted'
      ` as any[]
      hasAccess = Array.isArray(collaboratorResult) && collaboratorResult.length > 0
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Not authorized to view phases' }, { status: 403 })
    }

    const phasesResult = await sql`
      SELECT 
        mp.*,
        w.name as whitelist_name,
        w.entries_count as whitelist_entries
      FROM mint_phases mp
      LEFT JOIN mint_phase_whitelists w ON mp.whitelist_id = w.id
      WHERE mp.collection_id = ${collectionId}
      ORDER BY mp.phase_order ASC
    `
    const phases = Array.isArray(phasesResult) ? phasesResult : []

    return NextResponse.json({ success: true, phases })
  } catch (error: any) {
    console.error('Error fetching phases:', error)
    const errorMessage = error?.message || String(error)
    const errorCode = error?.code || 'UNKNOWN'
    
    return NextResponse.json({ 
      error: 'Failed to fetch phases',
      details: errorMessage,
      errorCode: errorCode,
      hint: errorMessage.includes('does not exist') ? 'Database column or table missing. Run database migration scripts.' : null
    }, { status: 500 })
  }
}

/**
 * POST /api/launchpad/[collectionId]/phases - Create a new phase
 * SECURITY: Requires wallet signature verification
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
    
    // SECURITY: Require signature verification
    const auth = await requireWalletAuth(request, true)
    if (!auth.isValid || !auth.walletAddress) {
      return NextResponse.json({ 
        error: auth.error || 'Authentication required',
        details: 'Please sign the request with your wallet to verify ownership'
      }, { status: 401 })
    }
    
    const wallet_address = auth.walletAddress
    const body = await request.clone().json()
    const {
      phase_name,
      start_time,
      end_time,
      mint_price_sats = 0,
      min_fee_rate = 1,
      max_fee_rate = 500,
      suggested_fee_rate = 10,
      max_per_wallet,
      max_per_transaction = 1,
      phase_allocation,
      whitelist_only = false,
      whitelist_id,
      end_on_allocation = true,
      description,
    } = body

    if (!phase_name || !start_time) {
      return NextResponse.json({ error: 'Phase name and start time required' }, { status: 400 })
    }

    // Validate numeric fields are integers
    const priceInSats = Math.floor(Number(mint_price_sats))
    const maxPerWallet = max_per_wallet ? Math.floor(Number(max_per_wallet)) : null
    const phaseAllocation = phase_allocation ? Math.floor(Number(phase_allocation)) : null

    // Verify collection exists and get owner
    const collectionResult = await sql`
      SELECT wallet_address FROM collections WHERE id = ${collectionId}
    ` as any[]
    const collection = collectionResult?.[0] || null

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    // Check if user is owner or collaborator with editor role
    const isOwner = wallet_address.trim() === collection.wallet_address
    let isAuthorized = isOwner

    if (!isOwner) {
      const collaboratorResult = await sql`
        SELECT role
        FROM collection_collaborators
        WHERE collection_id = ${collectionId}
          AND wallet_address = ${wallet_address.trim()}
          AND status = 'accepted'
          AND role IN ('owner', 'editor')
      ` as any[]

      isAuthorized = Array.isArray(collaboratorResult) && collaboratorResult.length > 0
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Get next phase order
    const orderResult = await sql`
      SELECT COALESCE(MAX(phase_order), -1) + 1 as next_order 
      FROM mint_phases WHERE collection_id = ${collectionId}
    `
    const nextOrder = Array.isArray(orderResult) ? (orderResult[0] as any)?.next_order || 0 : 0

    // Create phase
    const phaseResult = await sql`
      INSERT INTO mint_phases (
        collection_id,
        phase_name,
        phase_order,
        start_time,
        end_time,
        mint_price_sats,
        min_fee_rate,
        max_fee_rate,
        suggested_fee_rate,
        max_per_wallet,
        max_per_transaction,
        phase_allocation,
        whitelist_only,
        whitelist_id,
        end_on_allocation,
        description
      ) VALUES (
        ${collectionId},
        ${phase_name},
        ${nextOrder},
        ${start_time},
        ${end_time || null},
        ${priceInSats},
        ${min_fee_rate},
        ${max_fee_rate},
        ${suggested_fee_rate},
        ${maxPerWallet},
        ${max_per_transaction},
        ${phaseAllocation},
        ${whitelist_only},
        ${whitelist_id || null},
        ${end_on_allocation},
        ${description || null}
      )
      RETURNING *
    `

    const phase = Array.isArray(phaseResult) ? phaseResult[0] : null

    return NextResponse.json({ success: true, phase })
  } catch (error) {
    console.error('Error creating phase:', error)
    return NextResponse.json({ error: 'Failed to create phase' }, { status: 500 })
  }
}

/**
 * PATCH /api/launchpad/[collectionId]/phases - Update a phase
 * SECURITY: Requires wallet signature verification
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
    
    // SECURITY: Require signature verification
    const auth = await requireWalletAuth(request, true)
    if (!auth.isValid || !auth.walletAddress) {
      return NextResponse.json({ 
        error: auth.error || 'Authentication required',
        details: 'Please sign the request with your wallet to verify ownership'
      }, { status: 401 })
    }
    
    const wallet_address = auth.walletAddress
    const body = await request.clone().json()
    const {
      phase_id,
      phase_name,
      start_time,
      end_time,
      mint_price_sats,
      min_fee_rate,
      max_fee_rate,
      suggested_fee_rate,
      max_per_wallet,
      max_per_transaction,
      phase_allocation,
      whitelist_only,
      whitelist_id,
      end_on_allocation,
      description,
      is_active,
      is_completed,
    } = body

    if (!phase_id) {
      return NextResponse.json({ error: 'phase_id required' }, { status: 400 })
    }

    // Verify collection exists and get owner
    const collectionResult = await sql`
      SELECT wallet_address FROM collections WHERE id = ${collectionId}
    ` as any[]
    const collection = collectionResult?.[0] || null

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    // Check if user is owner or collaborator with editor role
    const isOwner = wallet_address.trim() === collection.wallet_address
    let isAuthorized = isOwner

    if (!isOwner) {
      const collaboratorResult = await sql`
        SELECT role
        FROM collection_collaborators
        WHERE collection_id = ${collectionId}
          AND wallet_address = ${wallet_address.trim()}
          AND status = 'accepted'
          AND role IN ('owner', 'editor')
      ` as any[]

      isAuthorized = Array.isArray(collaboratorResult) && collaboratorResult.length > 0
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // If activating this phase, deactivate others first
    if (is_active === true) {
      await sql`
        UPDATE mint_phases SET is_active = false WHERE collection_id = ${collectionId}
      `
    }

    // Update phase - use COALESCE with null coalescing to handle undefined values
    // Convert undefined to null so PostgreSQL can infer types correctly
    // For whitelist_id and phase_allocation, handle them separately since we want to allow explicit null setting
    const hasWhitelistId = whitelist_id !== undefined
    const hasPhaseAllocation = phase_allocation !== undefined
    
    if (hasWhitelistId && hasPhaseAllocation) {
      // Both whitelist_id and phase_allocation are explicitly provided
      await sql`
        UPDATE mint_phases SET
          phase_name = COALESCE(${phase_name ?? null}, phase_name),
          start_time = COALESCE(${start_time ?? null}, start_time),
          end_time = COALESCE(${end_time ?? null}, end_time),
          mint_price_sats = COALESCE(${mint_price_sats ?? null}, mint_price_sats),
          min_fee_rate = COALESCE(${min_fee_rate ?? null}, min_fee_rate),
          max_fee_rate = COALESCE(${max_fee_rate ?? null}, max_fee_rate),
          suggested_fee_rate = COALESCE(${suggested_fee_rate ?? null}, suggested_fee_rate),
          max_per_wallet = COALESCE(${max_per_wallet ?? null}, max_per_wallet),
          max_per_transaction = COALESCE(${max_per_transaction ?? null}, max_per_transaction),
          phase_allocation = ${phase_allocation},
          whitelist_only = COALESCE(${whitelist_only ?? null}, whitelist_only),
          whitelist_id = ${whitelist_id},
          end_on_allocation = COALESCE(${end_on_allocation ?? null}, end_on_allocation),
          description = COALESCE(${description ?? null}, description),
          is_active = COALESCE(${is_active ?? null}, is_active),
          is_completed = COALESCE(${is_completed ?? null}, is_completed),
          updated_at = NOW()
        WHERE id = ${phase_id} AND collection_id = ${collectionId}
      `
    } else if (hasWhitelistId) {
      // Only whitelist_id is explicitly provided
      await sql`
        UPDATE mint_phases SET
          phase_name = COALESCE(${phase_name ?? null}, phase_name),
          start_time = COALESCE(${start_time ?? null}, start_time),
          end_time = COALESCE(${end_time ?? null}, end_time),
          mint_price_sats = COALESCE(${mint_price_sats ?? null}, mint_price_sats),
          min_fee_rate = COALESCE(${min_fee_rate ?? null}, min_fee_rate),
          max_fee_rate = COALESCE(${max_fee_rate ?? null}, max_fee_rate),
          suggested_fee_rate = COALESCE(${suggested_fee_rate ?? null}, suggested_fee_rate),
          max_per_wallet = COALESCE(${max_per_wallet ?? null}, max_per_wallet),
          max_per_transaction = COALESCE(${max_per_transaction ?? null}, max_per_transaction),
          phase_allocation = COALESCE(${phase_allocation ?? null}, phase_allocation),
          whitelist_only = COALESCE(${whitelist_only ?? null}, whitelist_only),
          whitelist_id = ${whitelist_id},
          end_on_allocation = COALESCE(${end_on_allocation ?? null}, end_on_allocation),
          description = COALESCE(${description ?? null}, description),
          is_active = COALESCE(${is_active ?? null}, is_active),
          is_completed = COALESCE(${is_completed ?? null}, is_completed),
          updated_at = NOW()
        WHERE id = ${phase_id} AND collection_id = ${collectionId}
      `
    } else if (hasPhaseAllocation) {
      // Only phase_allocation is explicitly provided
      await sql`
        UPDATE mint_phases SET
          phase_name = COALESCE(${phase_name ?? null}, phase_name),
          start_time = COALESCE(${start_time ?? null}, start_time),
          end_time = COALESCE(${end_time ?? null}, end_time),
          mint_price_sats = COALESCE(${mint_price_sats ?? null}, mint_price_sats),
          min_fee_rate = COALESCE(${min_fee_rate ?? null}, min_fee_rate),
          max_fee_rate = COALESCE(${max_fee_rate ?? null}, max_fee_rate),
          suggested_fee_rate = COALESCE(${suggested_fee_rate ?? null}, suggested_fee_rate),
          max_per_wallet = COALESCE(${max_per_wallet ?? null}, max_per_wallet),
          max_per_transaction = COALESCE(${max_per_transaction ?? null}, max_per_transaction),
          phase_allocation = ${phase_allocation},
          whitelist_only = COALESCE(${whitelist_only ?? null}, whitelist_only),
          end_on_allocation = COALESCE(${end_on_allocation ?? null}, end_on_allocation),
          description = COALESCE(${description ?? null}, description),
          is_active = COALESCE(${is_active ?? null}, is_active),
          is_completed = COALESCE(${is_completed ?? null}, is_completed),
          updated_at = NOW()
        WHERE id = ${phase_id} AND collection_id = ${collectionId}
      `
    } else {
      // Neither whitelist_id nor phase_allocation provided, don't update them
      await sql`
        UPDATE mint_phases SET
          phase_name = COALESCE(${phase_name ?? null}, phase_name),
          start_time = COALESCE(${start_time ?? null}, start_time),
          end_time = COALESCE(${end_time ?? null}, end_time),
          mint_price_sats = COALESCE(${mint_price_sats ?? null}, mint_price_sats),
          min_fee_rate = COALESCE(${min_fee_rate ?? null}, min_fee_rate),
          max_fee_rate = COALESCE(${max_fee_rate ?? null}, max_fee_rate),
          suggested_fee_rate = COALESCE(${suggested_fee_rate ?? null}, suggested_fee_rate),
          max_per_wallet = COALESCE(${max_per_wallet ?? null}, max_per_wallet),
          max_per_transaction = COALESCE(${max_per_transaction ?? null}, max_per_transaction),
          phase_allocation = COALESCE(${phase_allocation ?? null}, phase_allocation),
          whitelist_only = COALESCE(${whitelist_only ?? null}, whitelist_only),
          end_on_allocation = COALESCE(${end_on_allocation ?? null}, end_on_allocation),
          description = COALESCE(${description ?? null}, description),
          is_active = COALESCE(${is_active ?? null}, is_active),
          is_completed = COALESCE(${is_completed ?? null}, is_completed),
          updated_at = NOW()
        WHERE id = ${phase_id} AND collection_id = ${collectionId}
      `
    }

    // Update collection launch status based on phase status
    if (is_active === true) {
      // Activating a phase - set collection to active
      await sql`
        UPDATE collections SET
          launch_status = 'active',
          launched_at = COALESCE(launched_at, NOW())
        WHERE id = ${collectionId}
      `
    } else if (is_completed === true) {
      // Check if all phases are completed
      const phasesCheck = await sql`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN is_completed = true THEN 1 ELSE 0 END) as completed
        FROM mint_phases
        WHERE collection_id = ${collectionId}
      `
      const stats = Array.isArray(phasesCheck) ? phasesCheck[0] as { total: number; completed: number } : null

      if (stats && stats.total > 0 && stats.total === stats.completed) {
        // All phases completed - mark collection as completed
        await sql`
          UPDATE collections SET
            launch_status = 'completed',
            mint_ended_at = NOW()
          WHERE id = ${collectionId}
        `
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating phase:', error)
    return NextResponse.json({ error: 'Failed to update phase' }, { status: 500 })
  }
}

/**
 * DELETE /api/launchpad/[collectionId]/phases - Delete a phase
 * SECURITY: Requires wallet signature verification
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
    
    // SECURITY: Require signature verification
    const auth = await requireWalletAuth(request, true)
    if (!auth.isValid || !auth.walletAddress) {
      return NextResponse.json({ 
        error: auth.error || 'Authentication required',
        details: 'Please sign the request with your wallet to verify ownership'
      }, { status: 401 })
    }
    
    const walletAddress = auth.walletAddress
    const { searchParams } = new URL(request.url)
    const phaseId = searchParams.get('phase_id')

    if (!phaseId) {
      return NextResponse.json({ error: 'phase_id required' }, { status: 400 })
    }

    // Verify ownership
    const collectionResult = await sql`
      SELECT wallet_address FROM collections WHERE id = ${collectionId}
    `
    const collection = Array.isArray(collectionResult) ? collectionResult[0] as { wallet_address: string } : null

    if (!collection || collection.wallet_address !== walletAddress) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Delete phase
    await sql`
      DELETE FROM mint_phases WHERE id = ${phaseId} AND collection_id = ${collectionId}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting phase:', error)
    return NextResponse.json({ error: 'Failed to delete phase' }, { status: 500 })
  }
}

