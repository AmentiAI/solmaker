import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

// GET /api/collaborations/invitations - Get all pending invitations for a wallet
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet_address');

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    // Get all pending invitations for this wallet
    const invitations = await sql`
      SELECT 
        cc.id,
        cc.collection_id,
        cc.wallet_address,
        cc.role,
        cc.invited_by,
        cc.status,
        cc.created_at,
        c.name as collection_name,
        c.description as collection_description,
        p.username as inviter_username
      FROM collection_collaborators cc
      INNER JOIN collections c ON c.id::text = cc.collection_id::text
      LEFT JOIN profiles p ON p.wallet_address = cc.invited_by
      WHERE LOWER(TRIM(cc.wallet_address)) = LOWER(${walletAddress.trim()})
        AND cc.status = 'pending'
      ORDER BY cc.created_at DESC
    `;

    return NextResponse.json({ 
      invitations: Array.isArray(invitations) ? invitations : [] 
    });
  } catch (error: any) {
    console.error('Error fetching invitations:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch invitations' },
      { status: 500 }
    );
  }
}

// PATCH /api/collaborations/invitations - Accept or decline an invitation
export async function PATCH(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { invitation_id, action, wallet_address } = body;

    if (!invitation_id || !action || !wallet_address) {
      return NextResponse.json({ 
        error: 'invitation_id, action, and wallet_address are required' 
      }, { status: 400 });
    }

    if (action !== 'accept' && action !== 'decline') {
      return NextResponse.json({ 
        error: 'action must be either "accept" or "decline"' 
      }, { status: 400 });
    }

    // Verify the invitation exists and belongs to this wallet
    const invitation = await sql`
      SELECT 
        id,
        collection_id,
        wallet_address,
        status
      FROM collection_collaborators
      WHERE id = ${invitation_id}
        AND LOWER(TRIM(wallet_address)) = LOWER(${wallet_address.trim()})
        AND status = 'pending'
    `;

    if (!Array.isArray(invitation) || invitation.length === 0) {
      return NextResponse.json({ 
        error: 'Invitation not found or already processed' 
      }, { status: 404 });
    }

    const newStatus = action === 'accept' ? 'accepted' : 'declined';

    // Update the invitation status
    const result = await sql`
      UPDATE collection_collaborators
      SET status = ${newStatus}
      WHERE id = ${invitation_id}
      RETURNING id, collection_id, wallet_address, role, status
    `;

    const updated = Array.isArray(result) ? result[0] : result;

    return NextResponse.json({ 
      message: `Invitation ${action}ed successfully`,
      invitation: updated
    });
  } catch (error: any) {
    console.error('Error updating invitation:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update invitation' },
      { status: 500 }
    );
  }
}

