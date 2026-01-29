import { NextRequest, NextResponse } from 'next/server';
import { checkAuthorizationServer } from '@/lib/auth/access-control';
import { clearCreditCostsCache } from '@/lib/credits/credit-costs';
import { sql } from '@/lib/database';

// GET /api/admin/credit-costs - Get all credit costs
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    // Check authorization
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get('wallet_address');

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }

    const authResult = await checkAuthorizationServer(request, sql);
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 });
    }

    const costs = await sql`
      SELECT 
        id,
        action_type,
        cost_per_unit,
        unit_name,
        description,
        updated_at,
        updated_by
      FROM credit_costs
      ORDER BY action_type
    ` as any[];

    return NextResponse.json({
      costs: Array.isArray(costs) ? costs : [],
    });
  } catch (error: any) {
    console.error('Error fetching credit costs:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch credit costs' },
      { status: 500 }
    );
  }
}

// POST /api/admin/credit-costs - Update credit costs
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { wallet_address, costs } = body;

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }

    const authResult = await checkAuthorizationServer(request, sql);
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 });
    }

    if (!Array.isArray(costs)) {
      return NextResponse.json({ error: 'Costs must be an array' }, { status: 400 });
    }

    // Update each cost
    const updates = await Promise.all(
      costs.map(async (cost: any) => {
        if (!cost.action_type || typeof cost.cost_per_unit !== 'number' || cost.cost_per_unit < 0) {
          throw new Error(`Invalid cost data for ${cost.action_type}`);
        }

        await sql`
          INSERT INTO credit_costs (action_type, cost_per_unit, unit_name, description, updated_by)
          VALUES (${cost.action_type}, ${cost.cost_per_unit}, ${cost.unit_name || 'unit'}, ${cost.description || null}, ${wallet_address})
          ON CONFLICT (action_type) 
          DO UPDATE SET 
            cost_per_unit = EXCLUDED.cost_per_unit,
            unit_name = EXCLUDED.unit_name,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = EXCLUDED.updated_by
        `;
      })
    );

    // Clear cache to ensure new values are used immediately
    clearCreditCostsCache();

    // Fetch updated costs
    const updatedCosts = await sql`
      SELECT 
        id,
        action_type,
        cost_per_unit,
        unit_name,
        description,
        updated_at,
        updated_by
      FROM credit_costs
      ORDER BY action_type
    ` as any[];

    return NextResponse.json({
      success: true,
      message: `Updated ${costs.length} credit cost(s)`,
      costs: Array.isArray(updatedCosts) ? updatedCosts : [],
    });
  } catch (error: any) {
    console.error('Error updating credit costs:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update credit costs' },
      { status: 500 }
    );
  }
}

