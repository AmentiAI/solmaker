import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

// GET /api/profile/username/[username] - Get profile by username
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const rows = await sql`
      SELECT 
        wallet_address,
        username,
        display_name,
        bio,
        avatar_url,
        created_at,
        updated_at
      FROM profiles 
      WHERE username = ${username.toLowerCase()}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ profile: null }, { status: 404 });
    }

    const profile = rows[0];
    return NextResponse.json({
      profile: {
        walletAddress: profile.wallet_address,
        username: profile.username,
        displayName: profile.display_name,
        bio: profile.bio,
        avatarUrl: profile.avatar_url,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      }
    });
  } catch (error) {
    console.error('Error fetching profile by username:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

