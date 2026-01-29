import { NextRequest, NextResponse } from 'next/server'
import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { sql } from '@/lib/database'
import { put } from '@vercel/blob'

/**
 * GET /api/admin/preset-previews - Get all preset previews
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const url = new URL(request.url)
    const walletAddress = url.searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }

    const authResult = await checkAuthorizationServer(request, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    const results = await sql`
      SELECT 
        id,
        preset_id,
        image_url,
        prompt,
        created_at,
        updated_at
      FROM preset_previews
      ORDER BY preset_id ASC
    ` as any[]

    const previews = Array.isArray(results) ? results.map((row: any) => ({
      id: row.id,
      preset_id: row.preset_id,
      image_url: row.image_url,
      prompt: row.prompt,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })) : []

    return NextResponse.json({ previews })
  } catch (error: any) {
    console.error('[Admin Preset Previews API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch preset previews', details: error?.message },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/admin/preset-previews - Update prompt for a preset preview
 */
export async function PUT(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const url = new URL(request.url)
    const walletAddress = url.searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }

    const authResult = await checkAuthorizationServer(request, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    const body = await request.json()
    const { preset_id, prompt } = body

    if (!preset_id) {
      return NextResponse.json({ error: 'preset_id is required' }, { status: 400 })
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'prompt is required and must be a non-empty string' }, { status: 400 })
    }

    const result = await sql`
      UPDATE preset_previews
      SET prompt = ${prompt.trim()},
          updated_at = CURRENT_TIMESTAMP
      WHERE preset_id = ${preset_id}
      RETURNING id, preset_id, image_url, prompt, created_at, updated_at
    ` as any[]

    if (!result || result.length === 0) {
      return NextResponse.json({ error: 'Preset preview not found' }, { status: 404 })
    }

    return NextResponse.json({
      preview: {
        id: result[0].id,
        preset_id: result[0].preset_id,
        image_url: result[0].image_url,
        prompt: result[0].prompt,
        created_at: result[0].created_at,
        updated_at: result[0].updated_at,
      },
    })
  } catch (error: any) {
    console.error('[Admin Preset Previews API] Update Error:', error)
    return NextResponse.json(
      { error: 'Failed to update preset preview', details: error?.message },
      { status: 500 }
    )
  }
}


