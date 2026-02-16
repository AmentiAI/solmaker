import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

/**
 * GET /api/marketplace/reviews
 * Get reviews for a seller, listing, or collection
 * Query params:
 * - seller_wallet: Get all reviews for a seller
 * - listing_id: Get reviews for a specific listing
 * - collection_id: Get reviews for a collection
 * - transaction_id: Get review for a specific transaction
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const sellerWallet = searchParams.get('seller_wallet')
    const listingId = searchParams.get('listing_id')
    const collectionId = searchParams.get('collection_id')
    const transactionId = searchParams.get('transaction_id')

    if (!sellerWallet && !listingId && !collectionId && !transactionId) {
      return NextResponse.json({ error: 'Must provide seller_wallet, listing_id, collection_id, or transaction_id' }, { status: 400 })
    }

    let query = sql`
      SELECT 
        r.id,
        r.transaction_id,
        r.listing_id,
        r.collection_id,
        r.seller_wallet,
        r.buyer_wallet,
        r.rating,
        r.review_text,
        r.buyer_username,
        r.is_visible,
        r.is_edited,
        r.created_at,
        r.updated_at,
        c.name as collection_name,
        l.title as listing_title
      FROM marketplace_reviews r
      LEFT JOIN collections c ON r.collection_id = c.id
      LEFT JOIN collection_marketplace_listings l ON r.listing_id = l.id
      WHERE r.is_visible = true
    `

    if (sellerWallet) {
      query = sql`${query} AND r.seller_wallet = ${sellerWallet}`
    }
    if (listingId) {
      query = sql`${query} AND r.listing_id = ${listingId}`
    }
    if (collectionId) {
      query = sql`${query} AND r.collection_id = ${collectionId}`
    }
    if (transactionId) {
      query = sql`${query} AND r.transaction_id = ${transactionId}`
    }

    query = sql`${query} ORDER BY r.created_at DESC`

    const reviews = await query as any[]

    // Calculate rating statistics if seller_wallet is provided
    let stats = null
    if (sellerWallet) {
      const statsResult = await sql`
        SELECT 
          COUNT(*)::int as total_reviews,
          AVG(rating)::numeric(3,2) as average_rating,
          COUNT(CASE WHEN rating = 5 THEN 1 END)::int as five_star,
          COUNT(CASE WHEN rating = 4 THEN 1 END)::int as four_star,
          COUNT(CASE WHEN rating = 3 THEN 1 END)::int as three_star,
          COUNT(CASE WHEN rating = 2 THEN 1 END)::int as two_star,
          COUNT(CASE WHEN rating = 1 THEN 1 END)::int as one_star
        FROM marketplace_reviews
        WHERE seller_wallet = ${sellerWallet} AND is_visible = true
      ` as any[]

      if (statsResult && statsResult.length > 0) {
        const s = statsResult[0]
        stats = {
          total_reviews: parseInt(s.total_reviews || '0', 10),
          average_rating: parseFloat(s.average_rating || '0'),
          five_star: parseInt(s.five_star || '0', 10),
          four_star: parseInt(s.four_star || '0', 10),
          three_star: parseInt(s.three_star || '0', 10),
          two_star: parseInt(s.two_star || '0', 10),
          one_star: parseInt(s.one_star || '0', 10),
        }
      }
    }

    return NextResponse.json({
      success: true,
      reviews: reviews || [],
      stats,
    })
  } catch (error: any) {
    console.error('Error fetching reviews:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch reviews' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/marketplace/reviews
 * Create a new review for a completed purchase
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const authResult = await checkAuthorizationServer(request, sql)
    if (!authResult.isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { transaction_id, rating, review_text } = body

    if (!transaction_id || !rating) {
      return NextResponse.json({ error: 'transaction_id and rating are required' }, { status: 400 })
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 })
    }

    const buyerWallet = authResult.walletAddress

    // Verify the transaction exists and the buyer is the actual buyer
    const transactionResult = await sql`
      SELECT 
        mt.id,
        mt.listing_id,
        mt.collection_id,
        mt.seller_wallet,
        mt.buyer_wallet,
        mt.status,
        l.status as listing_status
      FROM marketplace_transactions mt
      LEFT JOIN collection_marketplace_listings l ON mt.listing_id = l.id
      WHERE mt.id = ${transaction_id}
    ` as any[]

    if (!transactionResult || transactionResult.length === 0) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const transaction = transactionResult[0]

    if (transaction.buyer_wallet !== buyerWallet) {
      return NextResponse.json({ error: 'You can only review your own purchases' }, { status: 403 })
    }

    if (transaction.status !== 'completed') {
      return NextResponse.json({ error: 'Can only review completed purchases' }, { status: 400 })
    }

    // Check if review already exists
    const existingReview = await sql`
      SELECT id FROM marketplace_reviews
      WHERE transaction_id = ${transaction_id}
    ` as any[]

    if (existingReview && existingReview.length > 0) {
      return NextResponse.json({ error: 'Review already exists for this transaction' }, { status: 400 })
    }

    // Get buyer username
    const buyerProfile = await sql`
      SELECT username FROM user_profiles
      WHERE wallet_address = ${buyerWallet}
      LIMIT 1
    ` as any[]

    const buyerUsername = buyerProfile && buyerProfile.length > 0 ? buyerProfile[0].username : null

    // Create the review
    const reviewResult = await sql`
      INSERT INTO marketplace_reviews (
        transaction_id,
        listing_id,
        collection_id,
        seller_wallet,
        buyer_wallet,
        rating,
        review_text,
        buyer_username
      )
      VALUES (
        ${transaction_id},
        ${transaction.listing_id},
        ${transaction.collection_id},
        ${transaction.seller_wallet},
        ${buyerWallet},
        ${rating},
        ${review_text || null},
        ${buyerUsername}
      )
      RETURNING *
    ` as any[]

    const review = reviewResult[0]

    return NextResponse.json({
      success: true,
      review,
      message: 'Review created successfully',
    })
  } catch (error: any) {
    console.error('Error creating review:', error)
    
    // Handle unique constraint violation
    if (error.message?.includes('one_review_per_transaction') || error.message?.includes('unique')) {
      return NextResponse.json({ error: 'Review already exists for this transaction' }, { status: 400 })
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create review' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/marketplace/reviews/[id]
 * Update an existing review (only by the buyer who created it)
 */
export async function PATCH(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const authResult = await checkAuthorizationServer(request, sql)
    if (!authResult.isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { review_id, rating, review_text } = body

    if (!review_id) {
      return NextResponse.json({ error: 'review_id is required' }, { status: 400 })
    }

    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 })
    }

    const buyerWallet = authResult.walletAddress

    // Verify the review exists and belongs to the buyer
    const existingReview = await sql`
      SELECT id, buyer_wallet FROM marketplace_reviews
      WHERE id = ${review_id}
    ` as any[]

    if (!existingReview || existingReview.length === 0) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    if (existingReview[0].buyer_wallet !== buyerWallet) {
      return NextResponse.json({ error: 'You can only edit your own reviews' }, { status: 403 })
    }

    // Update the review
    const updateFields: any[] = []
    if (rating !== undefined) {
      updateFields.push(sql`rating = ${rating}`)
    }
    if (review_text !== undefined) {
      updateFields.push(sql`review_text = ${review_text}`)
    }
    updateFields.push(sql`is_edited = true`)
    updateFields.push(sql`updated_at = CURRENT_TIMESTAMP`)

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const updateQuery = sql`
      UPDATE marketplace_reviews
      SET ${sql.join(updateFields, sql`, `)}
      WHERE id = ${review_id}
      RETURNING *
    `

    const updatedReview = await updateQuery as any[]

    return NextResponse.json({
      success: true,
      review: updatedReview[0],
      message: 'Review updated successfully',
    })
  } catch (error: any) {
    console.error('Error updating review:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update review' },
      { status: 500 }
    )
  }
}

