import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isAuthorized } from '@/lib/auth/access-control'
import { requireWalletAuth } from '@/lib/auth/signature-verification'

/**
 * GET /api/launchpad/[collectionId]/whitelists - Get all whitelists for a collection
 * Optional query param: whitelist_id - if provided, returns entries for that whitelist
 * Requires wallet_address param for authorization
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
    const whitelistId = searchParams.get('whitelist_id')
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
      return NextResponse.json({ error: 'Not authorized to view whitelists' }, { status: 403 })
    }

    // If whitelist_id is provided, return entries for that whitelist
    if (whitelistId) {
      const entriesResult = await sql`
        SELECT wallet_address
        FROM whitelist_entries
        WHERE whitelist_id = ${whitelistId}
        ORDER BY added_at ASC
      `
      const entries = Array.isArray(entriesResult) ? entriesResult : []
      return NextResponse.json({ 
        success: true, 
        entries: entries.map((e: any) => e.wallet_address) 
      })
    }

    // Otherwise, return all whitelists
    const whitelistsResult = await sql`
      SELECT 
        w.*,
        (SELECT COUNT(*) FROM whitelist_entries WHERE whitelist_id = w.id) as entries_count
      FROM mint_phase_whitelists w
      WHERE w.collection_id = ${collectionId}
      ORDER BY w.created_at DESC
    `
    const whitelists = Array.isArray(whitelistsResult) ? whitelistsResult : []

    return NextResponse.json({ success: true, whitelists })
  } catch (error) {
    console.error('Error fetching whitelists:', error)
    return NextResponse.json({ error: 'Failed to fetch whitelists' }, { status: 500 })
  }
}

/**
 * POST /api/launchpad/[collectionId]/whitelists - Create a new whitelist
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
      name,
      description,
      max_entries,
      entries, // Array of { wallet_address, allocation?, notes? }
    } = body

    if (!name) {
      return NextResponse.json({ error: 'Whitelist name required' }, { status: 400 })
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

    // Create whitelist
    const whitelistResult = await sql`
      INSERT INTO mint_phase_whitelists (
        collection_id,
        name,
        description,
        max_entries,
        created_by
      ) VALUES (
        ${collectionId},
        ${name},
        ${description || null},
        ${max_entries || null},
        ${wallet_address}
      )
      RETURNING *
    `
    const whitelist = Array.isArray(whitelistResult) ? whitelistResult[0] : null

    if (!whitelist) {
      throw new Error('Failed to create whitelist')
    }

    // Add entries if provided
    if (entries && Array.isArray(entries) && entries.length > 0) {
      for (const entry of entries) {
        if (entry.wallet_address) {
          await sql`
            INSERT INTO whitelist_entries (
              whitelist_id,
              wallet_address,
              allocation,
              notes,
              added_by
            ) VALUES (
              ${whitelist.id},
              ${entry.wallet_address.trim()},
              ${entry.allocation || 1},
              ${entry.notes || null},
              ${wallet_address}
            )
            ON CONFLICT (whitelist_id, wallet_address) DO UPDATE SET
              allocation = EXCLUDED.allocation,
              notes = EXCLUDED.notes
          `
        }
      }

      // Update entries count
      const updateResult = await sql`
        UPDATE mint_phase_whitelists
        SET entries_count = (SELECT COUNT(*) FROM whitelist_entries WHERE whitelist_id = ${whitelist.id})
        WHERE id = ${whitelist.id}
        RETURNING *
      `
      const updatedWhitelist = Array.isArray(updateResult) ? updateResult[0] : whitelist
      return NextResponse.json({ success: true, whitelist: updatedWhitelist })
    }

    return NextResponse.json({ success: true, whitelist })
  } catch (error) {
    console.error('Error creating whitelist:', error)
    return NextResponse.json({ error: 'Failed to create whitelist' }, { status: 500 })
  }
}

/**
 * PATCH /api/launchpad/[collectionId]/whitelists - Update a whitelist or add entries
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
      whitelist_id,
      name,
      description,
      max_entries,
      add_entries, // Array of entries to add
      remove_entries, // Array of wallet addresses to remove
    } = body

    if (!whitelist_id) {
      return NextResponse.json({ error: 'whitelist_id required' }, { status: 400 })
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

    // Update whitelist metadata
    if (name || description !== undefined || max_entries !== undefined) {
      await sql`
        UPDATE mint_phase_whitelists SET
          name = COALESCE(${name}, name),
          description = COALESCE(${description}, description),
          max_entries = COALESCE(${max_entries}, max_entries),
          updated_at = NOW()
        WHERE id = ${whitelist_id} AND collection_id = ${collectionId}
      `
    }

    // Add entries
    if (add_entries && Array.isArray(add_entries)) {
      for (const entry of add_entries) {
        if (entry.wallet_address) {
          await sql`
            INSERT INTO whitelist_entries (
              whitelist_id,
              wallet_address,
              allocation,
              notes,
              added_by
            ) VALUES (
              ${whitelist_id},
              ${entry.wallet_address.trim()},
              ${entry.allocation || 1},
              ${entry.notes || null},
              ${wallet_address}
            )
            ON CONFLICT (whitelist_id, wallet_address) DO UPDATE SET
              allocation = EXCLUDED.allocation,
              notes = EXCLUDED.notes
          `
        }
      }
    }

    // Remove entries
    if (remove_entries && Array.isArray(remove_entries)) {
      for (const walletAddr of remove_entries) {
        await sql`
          DELETE FROM whitelist_entries 
          WHERE whitelist_id = ${whitelist_id} AND wallet_address = ${walletAddr}
        `
      }
    }

    // Update entries count
    await sql`
      UPDATE mint_phase_whitelists 
      SET entries_count = (SELECT COUNT(*) FROM whitelist_entries WHERE whitelist_id = ${whitelist_id})
      WHERE id = ${whitelist_id}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating whitelist:', error)
    return NextResponse.json({ error: 'Failed to update whitelist' }, { status: 500 })
  }
}

/**
 * DELETE /api/launchpad/[collectionId]/whitelists - Delete a whitelist
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
    const whitelistId = searchParams.get('whitelist_id')

    if (!whitelistId) {
      return NextResponse.json({ error: 'whitelist_id required' }, { status: 400 })
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
    const isOwner = walletAddress.trim() === collection.wallet_address
    let isAuthorized = isOwner

    if (!isOwner) {
      const collaboratorResult = await sql`
        SELECT role
        FROM collection_collaborators
        WHERE collection_id = ${collectionId}
          AND wallet_address = ${walletAddress.trim()}
          AND status = 'accepted'
          AND role IN ('owner', 'editor')
      ` as any[]

      isAuthorized = Array.isArray(collaboratorResult) && collaboratorResult.length > 0
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Remove whitelist from any phases using it
    await sql`
      UPDATE mint_phases SET whitelist_id = NULL WHERE whitelist_id = ${whitelistId}
    `

    // Delete whitelist (entries will cascade delete)
    await sql`
      DELETE FROM mint_phase_whitelists WHERE id = ${whitelistId} AND collection_id = ${collectionId}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting whitelist:', error)
    return NextResponse.json({ error: 'Failed to delete whitelist' }, { status: 500 })
  }
}
