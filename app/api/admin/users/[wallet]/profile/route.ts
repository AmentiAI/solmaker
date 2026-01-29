import { NextRequest, NextResponse } from 'next/server'
import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { sql } from '@/lib/database'

// PATCH /api/admin/users/[wallet]/profile - Update user profile fields (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { wallet } = await params
    const walletAddress = decodeURIComponent(wallet)
    const body = await request.json()
    const { admin_wallet_address, username, opt_in } = body

    if (!admin_wallet_address) {
      return NextResponse.json({ error: 'Admin wallet address required' }, { status: 401 })
    }

    // Check admin authorization
    const authResult = await checkAuthorizationServer(admin_wallet_address, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    // Build update fields
    const updates: string[] = []
    const values: any[] = []

    if (username !== undefined) {
      const trimmedUsername = username?.trim()
      if (trimmedUsername) {
        // Validate username format
        const usernameRegex = /^[a-zA-Z0-9_-]{3,50}$/
        if (!usernameRegex.test(trimmedUsername)) {
          return NextResponse.json({ 
            error: 'Username must be 3-50 characters and contain only letters, numbers, underscores, and hyphens' 
          }, { status: 400 })
        }

        // Check if username is already taken by another wallet
        const existingUsername = await sql`
          SELECT wallet_address FROM profiles 
          WHERE username = ${trimmedUsername.toLowerCase()} 
          AND wallet_address != ${walletAddress}
          LIMIT 1
        ` as any[]

        if (existingUsername.length > 0) {
          return NextResponse.json({ 
            error: 'Username is already taken' 
          }, { status: 400 })
        }

        updates.push('username')
        values.push(trimmedUsername.toLowerCase())
      }
    }

    if (opt_in !== undefined) {
      updates.push('opt_in')
      values.push(Boolean(opt_in))
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Ensure profile exists
    await sql`
      INSERT INTO profiles (wallet_address, username, opt_in, created_at, updated_at)
      VALUES (${walletAddress}, ${walletAddress.substring(0, 8)}, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (wallet_address) DO NOTHING
    `

    // Build dynamic update query
    const setClauses: any[] = []
    
    if (updates.includes('username')) {
      const usernameIndex = updates.indexOf('username')
      setClauses.push(sql`username = ${values[usernameIndex]}`)
    }
    
    if (updates.includes('opt_in')) {
      const optInIndex = updates.indexOf('opt_in')
      setClauses.push(sql`opt_in = ${values[optInIndex]}`)
    }
    
    // Always update updated_at
    setClauses.push(sql`updated_at = CURRENT_TIMESTAMP`)
    
    // Build the SET clause by combining all clauses
    let setClause = setClauses[0]
    for (let i = 1; i < setClauses.length; i++) {
      setClause = sql`${setClause}, ${setClauses[i]}`
    }

    // Update profile
    await sql`
      UPDATE profiles
      SET ${setClause}
      WHERE wallet_address = ${walletAddress}
    `

    return NextResponse.json({ 
      success: true, 
      message: 'Profile updated successfully',
      updated_fields: updates
    })
  } catch (error: any) {
    console.error('[Admin Profile Update] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update profile' },
      { status: 500 }
    )
  }
}
