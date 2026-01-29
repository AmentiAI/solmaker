import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * Cron job to update mint phase status based on time
 * Only activates phases when their start_time arrives
 * Deactivates phases when end_time passes (but does NOT mark as completed)
 * Completion must be done manually by the user
 * Runs every 5 minutes
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const now = new Date().toISOString()
    console.log(`[Phase Status Cron] Running at ${now}`)

    // Deactivate phases that are past their end_time (but don't mark as completed)
    // Completion must be done manually by the user
    const deactivatedResult = await sql`
      UPDATE mint_phases
      SET is_active = false, updated_at = NOW()
      WHERE end_time IS NOT NULL
        AND end_time < NOW()
        AND is_active = true
        AND is_completed = false
      RETURNING id, phase_name, collection_id
    ` as any[]

    const deactivatedPhases = Array.isArray(deactivatedResult) ? deactivatedResult : []
    
    if (deactivatedPhases.length > 0) {
      console.log(`[Phase Status Cron] Deactivated ${deactivatedPhases.length} phase(s) (past end_time but not marked completed):`)
      deactivatedPhases.forEach((phase: any) => {
        console.log(`  - Phase ${phase.id} (${phase.phase_name}) for collection ${phase.collection_id}`)
      })
    }

    // Mark phases as active if start_time has arrived and they're not already active or completed
    // Only activate if there's no other active phase for the same collection
    const activeResult = await sql`
      WITH phases_to_activate AS (
        SELECT 
          mp.id,
          mp.collection_id,
          mp.phase_name,
          ROW_NUMBER() OVER (PARTITION BY mp.collection_id ORDER BY mp.start_time ASC) as rn
        FROM mint_phases mp
        WHERE mp.start_time <= NOW()
          AND (mp.end_time IS NULL OR mp.end_time > NOW())
          AND mp.is_completed = false
          AND mp.is_active = false
          AND NOT EXISTS (
            SELECT 1 FROM mint_phases mp2
            WHERE mp2.collection_id = mp.collection_id
              AND mp2.is_active = true
          )
      )
      UPDATE mint_phases
      SET is_active = true, updated_at = NOW()
      FROM phases_to_activate
      WHERE mint_phases.id = phases_to_activate.id
        AND phases_to_activate.rn = 1
      RETURNING mint_phases.id, mint_phases.phase_name, mint_phases.collection_id
    ` as any[]

    const activatedPhases = Array.isArray(activeResult) ? activeResult : []
    
    if (activatedPhases.length > 0) {
      console.log(`[Phase Status Cron] Activated ${activatedPhases.length} phase(s):`)
      activatedPhases.forEach((phase: any) => {
        console.log(`  - Phase ${phase.id} (${phase.phase_name}) for collection ${phase.collection_id}`)
      })
    }

    // Check for fully minted collections and close their phases
    // If a collection is at 100% minted and has phases with end_time > NOW(), close those phases
    // Use generated_ordinals.is_minted as source of truth (not mint_inscriptions)
    const fullyMintedResult = await sql`
      WITH collection_mint_counts AS (
        SELECT 
          c.id as collection_id,
          c.name as collection_name,
          (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as total_supply,
          COALESCE(c.cap_supply, (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id)) as max_supply,
          (
            SELECT COUNT(*) 
            FROM generated_ordinals 
            WHERE collection_id = c.id 
              AND is_minted = true
          ) as minted_count
        FROM collections c
        WHERE COALESCE(c.collection_status, 'draft') IN ('launchpad', 'launchpad_live')
          AND c.launched_at IS NOT NULL
      )
      SELECT 
        cmc.collection_id,
        cmc.collection_name,
        cmc.minted_count,
        cmc.max_supply,
        mp.id as phase_id,
        mp.phase_name,
        mp.end_time
      FROM collection_mint_counts cmc
      INNER JOIN mint_phases mp ON mp.collection_id = cmc.collection_id
      WHERE cmc.minted_count >= cmc.max_supply
        AND mp.end_time IS NOT NULL
        AND mp.end_time > NOW()
        AND mp.is_completed = false
    ` as any[]

    const fullyMintedCollections = Array.isArray(fullyMintedResult) ? fullyMintedResult : []
    const collectionsToUpdate = new Set<string>()
    
    if (fullyMintedCollections.length > 0) {
      console.log(`[Phase Status Cron] Found ${fullyMintedCollections.length} phase(s) for fully minted collections that need to be closed:`)
      
      // Group by collection to update phases and collection status
      const phasesByCollection = new Map<string, any[]>()
      fullyMintedCollections.forEach((item: any) => {
        if (!phasesByCollection.has(item.collection_id)) {
          phasesByCollection.set(item.collection_id, [])
        }
        phasesByCollection.get(item.collection_id)!.push(item)
        collectionsToUpdate.add(item.collection_id)
      })

      // Update phases: set end_time to NOW() for all phases that are still open
      for (const [collectionId, phases] of phasesByCollection.entries()) {
        const phaseIds = phases.map((p: any) => p.phase_id)
        
        const updatedPhases = await sql`
          UPDATE mint_phases
          SET end_time = NOW(),
              is_active = false,
              is_completed = true,
              updated_at = NOW()
          WHERE id = ANY(${phaseIds})
            AND end_time > NOW()
            AND is_completed = false
          RETURNING id, phase_name, collection_id
        ` as any[]

        if (updatedPhases.length > 0) {
          console.log(`  - Collection ${collectionId}: Closed ${updatedPhases.length} phase(s):`)
          updatedPhases.forEach((phase: any) => {
            console.log(`    * Phase ${phase.id} (${phase.phase_name})`)
          })
        }
      }

      // Update collection launch_status to 'completed' for fully minted collections
      // This matches the behavior when manually ending a mint in launchpad settings
      if (collectionsToUpdate.size > 0) {
        const collectionIds = Array.from(collectionsToUpdate)
        const statusUpdateResult = await sql`
          UPDATE collections
          SET launch_status = 'completed',
              mint_ended_at = COALESCE(mint_ended_at, NOW()),
              updated_at = NOW()
          WHERE id = ANY(${collectionIds})
            AND launch_status != 'completed'
          RETURNING id, name
        ` as any[]

        const updatedCollections = Array.isArray(statusUpdateResult) ? statusUpdateResult : []
        if (updatedCollections.length > 0) {
          console.log(`[Phase Status Cron] Updated ${updatedCollections.length} collection(s) to 'completed' launch_status:`)
          updatedCollections.forEach((coll: any) => {
            console.log(`  - Collection ${coll.id} (${coll.name})`)
          })
        }
      }
    }

    return NextResponse.json({
      message: 'Phase status update completed',
      activated: activatedPhases.length,
      deactivated: deactivatedPhases.length,
      fully_minted_phases_closed: fullyMintedCollections.length,
      collections_marked_minted: collectionsToUpdate.size,
      timestamp: now,
    })
  } catch (error: any) {
    console.error('[Phase Status Cron] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update phase status', details: error?.message },
      { status: 500 }
    )
  }
}

