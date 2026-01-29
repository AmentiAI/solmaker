import { NextRequest, NextResponse } from 'next/server';

import { hasEnoughCredits, deductCredits } from '@/lib/credits/credits';
import { calculateCreditsNeeded } from '@/lib/credits/credit-costs';
import { sql } from '@/lib/database';

// POST /api/lazy-mode/generate - Generate batch of images (10 at a time)
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const {
      wallet_address,
      collection_id,
      quantity = 10,
    } = body;

    if (!wallet_address || wallet_address.trim() === '') {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    if (!collection_id) {
      return NextResponse.json({ error: 'Collection ID is required' }, { status: 400 });
    }

    const jobCount = Math.min(Math.max(1, parseInt(String(quantity))), 10); // Max 10 at a time

    // Verify collection exists
    const collectionResult = await sql`
      SELECT id FROM collections WHERE id = ${collection_id}
    `;

    if (!Array.isArray(collectionResult) || collectionResult.length === 0) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Get credit cost
    const creditsNeeded = await calculateCreditsNeeded('collection_generation', jobCount);

    // Check if user has enough credits
    const hasCredits = await hasEnoughCredits(wallet_address, creditsNeeded);
    if (!hasCredits) {
      return NextResponse.json(
        { error: `Insufficient credits. You need ${creditsNeeded} credit${creditsNeeded > 1 ? 's' : ''} to generate ${jobCount} image${jobCount > 1 ? 's' : ''}. Please purchase credits.` },
        { status: 402 }
      );
    }

    // Deduct credits
    const creditsDeducted = await deductCredits(
      wallet_address,
      creditsNeeded,
      `Generating ${jobCount} image${jobCount > 1 ? 's' : ''} for lazy mode collection`
    );

    if (!creditsDeducted) {
      return NextResponse.json(
        { error: 'Failed to deduct credits. Please try again.' },
        { status: 500 }
      );
    }

    // Create generation jobs
    const jobs = [];
    for (let i = 0; i < jobCount; i++) {
      const result = await sql`
        INSERT INTO generation_jobs (collection_id, ordinal_number, trait_overrides, status)
        VALUES (
          ${collection_id}, 
          NULL, 
          NULL,
          'pending'
        )
        RETURNING id, collection_id, ordinal_number, trait_overrides, status, created_at
      `;
      const job = Array.isArray(result) ? result[0] : result;
      jobs.push(job);
    }

    return NextResponse.json({ 
      jobs,
      generated: jobCount,
      message: `${jobCount} generation job${jobCount > 1 ? 's' : ''} queued successfully. They will be processed within 5 minutes.`
    }, { status: 202 });

  } catch (error: any) {
    console.error('Error in lazy mode generate:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate images' },
      { status: 500 }
    );
  }
}

