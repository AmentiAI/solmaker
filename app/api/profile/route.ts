import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

// GET /api/profile - Get profile by wallet address
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ 
      error: 'Database connection not available',
      details: 'SQL connection is null or undefined'
    }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet_address');

    if (!walletAddress) {
      return NextResponse.json({ 
        error: 'Wallet address is required',
        details: 'wallet_address query parameter is missing'
      }, { status: 400 });
    }

    const trimmedAddress = walletAddress.trim();
    if (!trimmedAddress) {
      return NextResponse.json({ 
        error: 'Wallet address is required',
        details: 'wallet_address query parameter is empty after trimming'
      }, { status: 400 });
    }

    let rows: any[];
    try {
      rows = await sql`
        SELECT 
          wallet_address,
          payment_address,
          username,
          display_name,
          bio,
          avatar_url,
          wallet_type,
          opt_in,
          twitter_url,
          created_at,
          updated_at
        FROM profiles 
        WHERE wallet_address = ${trimmedAddress}
        LIMIT 1
      ` as any[];
    } catch (queryError: any) {
      console.error('SQL query error:', queryError);
      return NextResponse.json({ 
        error: 'Database query failed',
        details: queryError?.message || 'Unknown database error',
        walletAddress: trimmedAddress,
        queryError: queryError?.code || 'UNKNOWN'
      }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ 
        profile: null,
        message: 'Profile not found',
        walletAddress: trimmedAddress
      });
    }

    const profile = rows[0];
    
    // Validate profile data exists
    if (!profile.wallet_address) {
      console.error('Profile found but missing wallet_address:', profile);
      return NextResponse.json({ 
        error: 'Invalid profile data',
        details: 'Profile record exists but wallet_address field is missing',
        walletAddress: trimmedAddress
      }, { status: 500 });
    }

    return NextResponse.json({
      profile: {
        walletAddress: profile.wallet_address,
        paymentAddress: profile.payment_address || null,
        username: profile.username,
        displayName: profile.display_name,
        bio: profile.bio,
        avatarUrl: profile.avatar_url,
        walletType: profile.wallet_type || 'btc',
        optIn: profile.opt_in || false,
        twitterUrl: profile.twitter_url || null,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      }
    });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch profile',
      details: error?.message || 'Unknown error occurred',
      errorType: error?.name || 'Error',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    }, { status: 500 });
  }
}

// POST /api/profile - Create or update profile
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    
    const {
      wallet_address,
      payment_address,
      username,
      display_name,
      bio,
      avatar_url,
      wallet_type = 'btc',
      opt_in,
      optIn, // Also accept camelCase from frontend
      twitter_url,
      twitterUrl, // Also accept camelCase from frontend
    } = body;
    
    // Use opt_in if provided, otherwise use optIn (camelCase)
    const finalOptIn = opt_in !== undefined ? opt_in : optIn;
    
    // Use twitter_url if provided, otherwise use twitterUrl (camelCase)
    const finalTwitterUrl = twitter_url !== undefined ? twitter_url : twitterUrl;

    if (!wallet_address || !wallet_address.trim()) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    // Check if profile exists first
    const existingProfile = await sql`
      SELECT wallet_address FROM profiles 
      WHERE wallet_address = ${wallet_address}
      LIMIT 1
    ` as any[];

    const now = new Date().toISOString();

    // Determine wallet type
    const detectedWalletType = wallet_type || 
      (wallet_address.startsWith('0x') ? 'eth' : 
       wallet_address.length > 40 ? 'sol' : 'btc')

    if (existingProfile.length > 0) {
      // Update existing profile - only process username if provided
      let finalUsername: string | undefined = undefined
      if (username !== undefined) {
        finalUsername = username?.trim()
        if (!finalUsername) {
          // Empty string provided, keep existing username (don't generate new one)
          finalUsername = undefined
        } else {
          // Validate username format (alphanumeric, underscore, hyphen, 3-50 chars)
          const usernameRegex = /^[a-zA-Z0-9_-]{3,50}$/;
          if (!usernameRegex.test(finalUsername)) {
            return NextResponse.json({ 
              error: 'Username must be 3-50 characters and contain only letters, numbers, underscores, and hyphens' 
            }, { status: 400 });
          }

          // Check if username is already taken by another wallet
          const existingUsername = await sql`
            SELECT wallet_address FROM profiles 
            WHERE username = ${finalUsername.toLowerCase()} 
            AND wallet_address != ${wallet_address}
            LIMIT 1
          ` as any[];

          if (existingUsername.length > 0) {
            return NextResponse.json({ 
              error: 'Username is already taken' 
            }, { status: 400 });
          }
        }
      }
      // Update existing profile
      // Only update fields that are explicitly provided in the request body
      // Build the SET clause conditionally
      const setClauses: any[] = []
      
      // Only update username if provided and valid (don't auto-generate for existing profiles)
      if (finalUsername !== undefined) {
        setClauses.push(sql`username = ${finalUsername.toLowerCase()}`)
      }
      
      // Only update wallet_type if provided
      if (wallet_type !== undefined) {
        setClauses.push(sql`wallet_type = ${detectedWalletType}`)
      }
      
      // Only update display_name if provided
      if (display_name !== undefined) {
        setClauses.push(sql`display_name = ${display_name?.trim() || null}`)
      }
      
      // Only update bio if provided
      if (bio !== undefined) {
        setClauses.push(sql`bio = ${bio?.trim() || null}`)
      }
      
      // Only update avatar_url if provided
      if (avatar_url !== undefined) {
        setClauses.push(sql`avatar_url = ${avatar_url?.trim() || null}`)
      }
      
      // Only update payment_address if provided
      if (payment_address !== undefined) {
        setClauses.push(sql`payment_address = ${payment_address?.trim() || null}`)
      }
      
      // Only update opt_in if explicitly provided
      if (finalOptIn !== undefined) {
        setClauses.push(sql`opt_in = ${finalOptIn}`)
      }
      
      // Only update twitter_url if provided
      if (finalTwitterUrl !== undefined) {
        // Validate and normalize Twitter URL format
        let normalizedTwitterUrl = finalTwitterUrl?.trim() || null;
        if (normalizedTwitterUrl) {
          // Allow both x.com and twitter.com formats
          // Normalize to x.com format if it's twitter.com
          normalizedTwitterUrl = normalizedTwitterUrl.replace('twitter.com', 'x.com');
          // Ensure it starts with http:// or https://
          if (!normalizedTwitterUrl.startsWith('http://') && !normalizedTwitterUrl.startsWith('https://')) {
            normalizedTwitterUrl = `https://${normalizedTwitterUrl}`;
          }
        }
        setClauses.push(sql`twitter_url = ${normalizedTwitterUrl}`)
      }
      
      // Always update updated_at
      setClauses.push(sql`updated_at = ${now}`)
      
      // If no fields to update (only updated_at), return existing profile without updating
      if (setClauses.length === 1) {
        const existing = await sql`
          SELECT 
            wallet_address,
            payment_address,
            username,
            display_name,
            bio,
            avatar_url,
            wallet_type,
            opt_in,
            twitter_url,
            created_at,
            updated_at
          FROM profiles
          WHERE wallet_address = ${wallet_address}
          LIMIT 1
        ` as any[]
        const profile = existing[0]
        return NextResponse.json({
          profile: {
            walletAddress: profile.wallet_address,
            paymentAddress: profile.payment_address || null,
            username: profile.username,
            displayName: profile.display_name,
            bio: profile.bio,
            avatarUrl: profile.avatar_url,
            walletType: profile.wallet_type || 'btc',
            optIn: profile.opt_in || false,
            twitterUrl: profile.twitter_url || null,
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
          }
        })
      }
      
      // Build the SET clause by combining all clauses
      let setClause = setClauses[0]
      for (let i = 1; i < setClauses.length; i++) {
        setClause = sql`${setClause}, ${setClauses[i]}`
      }
      
      const result = await sql`
        UPDATE profiles
        SET ${setClause}
        WHERE wallet_address = ${wallet_address}
        RETURNING 
          wallet_address,
          payment_address,
          username,
          display_name,
          bio,
          avatar_url,
          wallet_type,
          opt_in,
          twitter_url,
          created_at,
          updated_at
      ` as any[]

      const profile = result[0];
      return NextResponse.json({
        profile: {
          walletAddress: profile.wallet_address,
          paymentAddress: profile.payment_address || null,
          username: profile.username,
          displayName: profile.display_name,
          bio: profile.bio,
          avatarUrl: profile.avatar_url,
          walletType: profile.wallet_type || 'btc',
          optIn: profile.opt_in || false,
          twitterUrl: profile.twitter_url || null,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        }
      });
    } else {
      // Create new profile
      // Auto-generate username if not provided (for new profiles only)
      let finalUsername = username?.trim()
      if (!finalUsername) {
        // Generate username from wallet address
        finalUsername = `user_${wallet_address.slice(0, 8)}`
      }

      // Validate username format (alphanumeric, underscore, hyphen, 3-50 chars)
      const usernameRegex = /^[a-zA-Z0-9_-]{3,50}$/;
      if (!usernameRegex.test(finalUsername)) {
        return NextResponse.json({ 
          error: 'Username must be 3-50 characters and contain only letters, numbers, underscores, and hyphens' 
        }, { status: 400 });
      }

      // Check if username is already taken by another wallet
      const existingUsername = await sql`
        SELECT wallet_address FROM profiles 
        WHERE username = ${finalUsername.toLowerCase()} 
        AND wallet_address != ${wallet_address}
        LIMIT 1
      ` as any[];

      if (existingUsername.length > 0) {
        // If username is taken, generate a unique one
        finalUsername = `user_${wallet_address.slice(0, 8)}_${Date.now().toString(36).slice(-4)}`
      }
      
      // Normalize Twitter URL if provided
      let normalizedTwitterUrl = finalTwitterUrl?.trim() || null;
      if (normalizedTwitterUrl) {
        // Allow both x.com and twitter.com formats
        // Normalize to x.com format if it's twitter.com
        normalizedTwitterUrl = normalizedTwitterUrl.replace('twitter.com', 'x.com');
        // Ensure it starts with http:// or https://
        if (!normalizedTwitterUrl.startsWith('http://') && !normalizedTwitterUrl.startsWith('https://')) {
          normalizedTwitterUrl = `https://${normalizedTwitterUrl}`;
        }
      }

      const result = await sql`
        INSERT INTO profiles (
          wallet_address,
          payment_address,
          username,
          display_name,
          bio,
          avatar_url,
          wallet_type,
          opt_in,
          twitter_url,
          created_at,
          updated_at
        )
        VALUES (
          ${wallet_address.trim()},
          ${payment_address?.trim() || null},
          ${finalUsername.toLowerCase()},
          ${display_name?.trim() || null},
          ${bio?.trim() || null},
          ${avatar_url?.trim() || null},
          ${detectedWalletType},
          ${finalOptIn !== undefined ? finalOptIn : false},
          ${normalizedTwitterUrl},
          ${now},
          ${now}
        )
        RETURNING 
          wallet_address,
          payment_address,
          username,
          display_name,
          bio,
          avatar_url,
          wallet_type,
          opt_in,
          twitter_url,
          created_at,
          updated_at
      ` as any[];

      const profile = result[0];
      return NextResponse.json({
        profile: {
          walletAddress: profile.wallet_address,
          paymentAddress: profile.payment_address || null,
          username: profile.username,
          displayName: profile.display_name,
          bio: profile.bio,
          avatarUrl: profile.avatar_url,
          walletType: profile.wallet_type || 'btc',
          optIn: profile.opt_in || false,
          twitterUrl: profile.twitter_url || null,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        }
      }, { status: 201 });
    }
  } catch (error: any) {
    console.error('Error creating/updating profile:', error);
    
    // Handle unique constraint violation
    if (error?.message?.includes('unique') || error?.message?.includes('duplicate')) {
      return NextResponse.json({ error: 'Username is already taken' }, { status: 400 });
    }
    
    return NextResponse.json({ 
      error: error?.message || 'Failed to create/update profile' 
    }, { status: 500 });
  }
}

