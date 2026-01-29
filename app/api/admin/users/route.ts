import { NextRequest, NextResponse } from 'next/server';

import { checkAuthorizationServer } from '@/lib/auth/access-control';
import { sql } from '@/lib/database';

// GET /api/admin/users - Get all users with their information
// OPTIMIZED: Uses bulk queries instead of N+1 queries for 10x faster loading
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

    // Run all queries in parallel for maximum speed
    const [
      allWallets,
      allProfiles,
      allCredits,
      creditStats,
      collectionCounts,
      pendingPayments,
      completedPayments,
      accountDates
    ] = await Promise.all([
      // 1. Get all unique wallet addresses
      sql`
        SELECT DISTINCT wallet_address FROM (
          SELECT wallet_address FROM profiles
          UNION
          SELECT wallet_address FROM credits WHERE credits > 0 OR updated_at IS NOT NULL
          UNION
          SELECT wallet_address FROM pending_payments 
            WHERE (status = 'completed' AND payment_txid IS NOT NULL)
               OR (status = 'pending' AND payment_txid IS NOT NULL)
          UNION
          SELECT wallet_address FROM credit_transactions
        ) AS all_wallets
        WHERE wallet_address IS NOT NULL AND wallet_address != ''
      ` as Promise<any[]>,

      // 2. Get all profiles at once
      sql`SELECT wallet_address, payment_address, username, display_name, bio, avatar_url, opt_in, created_at, updated_at FROM profiles` as Promise<any[]>,

      // 3. Get all credit balances at once
      sql`SELECT wallet_address, credits FROM credits` as Promise<any[]>,

      // 4. Get all credit transaction stats grouped by wallet
      sql`
        SELECT 
          wallet_address,
          COALESCE(SUM(CASE WHEN transaction_type = 'purchase' AND amount > 0 THEN amount ELSE 0 END), 0) as total_spent,
          COUNT(CASE WHEN transaction_type = 'purchase' AND amount > 0 THEN 1 END) as purchase_count,
          COALESCE(SUM(CASE WHEN transaction_type = 'usage' AND amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_used,
          COUNT(CASE WHEN transaction_type = 'usage' AND amount < 0 THEN 1 END) as usage_count,
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_earned
        FROM credit_transactions
        GROUP BY wallet_address
      ` as Promise<any[]>,

      // 5. Get all collection counts grouped by wallet
      sql`
        SELECT wallet_address, COUNT(*) as collection_count
        FROM collections
        WHERE wallet_address IS NOT NULL
        GROUP BY wallet_address
      ` as Promise<any[]>,

      // 6. Get all pending payments stats grouped by wallet
      sql`
        SELECT 
          wallet_address,
          COUNT(*) as pending_count,
          COALESCE(SUM(bitcoin_amount), 0) as pending_btc_total
        FROM pending_payments
        WHERE status = 'pending'
          AND (payment_txid IS NOT NULL OR expires_at > NOW())
        GROUP BY wallet_address
      ` as Promise<any[]>,

      // 7. Get all completed payments stats grouped by wallet
      sql`
        SELECT 
          wallet_address,
          COUNT(*) as completed_count,
          COALESCE(SUM(bitcoin_amount), 0) as completed_btc_total,
          COALESCE(SUM(credits_amount), 0) as completed_credits_total
        FROM pending_payments
        WHERE status = 'completed' AND payment_txid IS NOT NULL
        GROUP BY wallet_address
      ` as Promise<any[]>,

      // 8. Get earliest activity date for each wallet
      sql`
        SELECT wallet_address, MIN(created_at) as account_created
        FROM (
          SELECT wallet_address, created_at FROM profiles
          UNION ALL
          SELECT wallet_address, created_at FROM credit_transactions
          UNION ALL
          SELECT wallet_address, created_at FROM pending_payments
        ) AS all_dates
        WHERE wallet_address IS NOT NULL
        GROUP BY wallet_address
      ` as Promise<any[]>
    ]);

    // Build lookup maps for O(1) access
    const profileMap = new Map(allProfiles.map((p: any) => [p.wallet_address, p]));
    
    // Debug: Check payment_address for specific wallet
    const debugWallet = 'bc1pvp5axlxx0k2j5w4afurf70m5v5qplkr44lswl2z8z6zpy0sx32ts2f5r82'
    const debugProfile = allProfiles.find((p: any) => p.wallet_address === debugWallet)
    if (debugProfile) {
      console.log('[Admin API Debug] Profile payment_address:', {
        wallet: debugWallet,
        payment_address: debugProfile.payment_address,
        payment_address_type: typeof debugProfile.payment_address,
        payment_address_length: debugProfile.payment_address?.length,
        payment_address_truthy: !!debugProfile.payment_address,
        allKeys: Object.keys(debugProfile),
      })
    }
    const creditsMap = new Map(allCredits.map((c: any) => [c.wallet_address, c.credits]));
    const creditStatsMap = new Map(creditStats.map((s: any) => [s.wallet_address, s]));
    const collectionsMap = new Map(collectionCounts.map((c: any) => [c.wallet_address, c.collection_count]));
    const pendingMap = new Map(pendingPayments.map((p: any) => [p.wallet_address, p]));
    const completedMap = new Map(completedPayments.map((c: any) => [c.wallet_address, c]));
    const accountDateMap = new Map(accountDates.map((d: any) => [d.wallet_address, d.account_created]));

    // Build user objects from maps (no additional queries needed!)
    const users = allWallets.map((wallet: any) => {
      const walletAddr = wallet.wallet_address;
      const profile = profileMap.get(walletAddr);
      const stats = creditStatsMap.get(walletAddr);
      const pending = pendingMap.get(walletAddr);
      const completed = completedMap.get(walletAddr);

      return {
        wallet_address: walletAddr,
        profile: profile ? {
          username: profile.username,
          display_name: profile.display_name,
          bio: profile.bio,
          avatar_url: profile.avatar_url,
          payment_address: profile.payment_address || null,
          opt_in: profile.opt_in || false,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
        } : null,
        credits: {
          current: creditsMap.get(walletAddr) || 0,
          total_earned: parseFloat(stats?.total_earned || 0),
          total_used: parseFloat(stats?.total_used || 0),
          total_spent: parseFloat(stats?.total_spent || 0),
          purchase_count: parseInt(stats?.purchase_count || 0),
          usage_count: parseInt(stats?.usage_count || 0),
        },
        collections: {
          count: parseInt(collectionsMap.get(walletAddr) || 0),
        },
        payments: {
          pending: {
            count: parseInt(pending?.pending_count || 0),
            btc_total: parseFloat(pending?.pending_btc_total || 0),
          },
          completed: {
            count: parseInt(completed?.completed_count || 0),
            btc_total: parseFloat(completed?.completed_btc_total || 0),
            credits_total: parseFloat(completed?.completed_credits_total || 0),
          },
        },
        account_created: accountDateMap.get(walletAddr) || null,
      };
    });

    // Sort by total spent (descending)
    users.sort((a, b) => (b.credits.total_spent || 0) - (a.credits.total_spent || 0));

    return NextResponse.json({
      users,
      summary: {
        total_users: users.length,
        total_credits_in_circulation: users.reduce((sum, u) => sum + (u.credits.current || 0), 0),
        total_spent_all_users: users.reduce((sum, u) => sum + (u.credits.total_spent || 0), 0),
        total_collections: users.reduce((sum, u) => sum + u.collections.count, 0),
      }
    });

  } catch (error) {
    console.error('Error fetching admin users:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: 'Failed to fetch users',
      details: errorMessage 
    }, { status: 500 });
  }
}

