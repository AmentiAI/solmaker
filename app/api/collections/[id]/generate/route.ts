import { NextRequest, NextResponse } from 'next/server';
import { hasEnoughCredits, deductCredits } from '@/lib/credits/credits';
import { calculateCreditsNeeded } from '@/lib/credits/credit-costs';
import { sql } from '@/lib/database';

// POST /api/collections/[id]/generate - Queue a new ordinal generation job
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id: collectionId } = await params;
    const body = await request.json();
    const { ordinal_number, quantity = 1, trait_overrides = null, wallet_address, image_model } = body;

    // Validate wallet address
    if (!wallet_address || wallet_address.trim() === '') {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    // Validate quantity
    const jobCount = Math.min(Math.max(1, parseInt(String(quantity))), 10); // Max 10 at once

    // Validate model (Classic vs Pro)
    const requestedModel = String(image_model || '').trim();
    const resolvedModel =
      requestedModel === 'gpt-image-1' || requestedModel === 'gpt-image-1.5' ? requestedModel : 'gpt-image-1.5';

    // Get credit cost from database
    const creditsNeeded = await calculateCreditsNeeded('collection_generation', jobCount);

    // Check if user has enough credits
    const hasCredits = await hasEnoughCredits(wallet_address, creditsNeeded);
    if (!hasCredits) {
      return NextResponse.json(
        { error: `Insufficient credits. You need ${creditsNeeded} credit${creditsNeeded > 1 ? 's' : ''} to queue ${jobCount} generation job${jobCount > 1 ? 's' : ''}. Please purchase credits.` },
        { status: 402 } // 402 Payment Required
      );
    }

    // Verify collection exists and get its name
    const collectionResult = await sql`
      SELECT id, name FROM collections WHERE id = ${collectionId}
    `;

    if (!Array.isArray(collectionResult) || collectionResult.length === 0) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    const collectionName = (collectionResult[0] as any)?.name || collectionId;

    // Deduct credits IMMEDIATELY before queuing jobs
    const creditsDeducted = await deductCredits(
      wallet_address,
      creditsNeeded,
      `Queued ${jobCount} generation job${jobCount > 1 ? 's' : ''} for collection "${collectionName}"`
    );

    if (!creditsDeducted) {
      return NextResponse.json(
        { error: 'Failed to deduct credits. Please try again.' },
        { status: 500 }
      );
    }

    // Log trait overrides
    if (trait_overrides && Object.keys(trait_overrides).length > 0) {
      console.log(`[Generate] Creating ${jobCount} trait-based job(s) with trait overrides:`, trait_overrides);
    }

    // Create multiple generation jobs (trait-based only)
    const jobs = [];
    let imageModelColumnMissing = false;
    for (let i = 0; i < jobCount; i++) {
      let result: any;
      try {
        result = await sql`
          INSERT INTO generation_jobs (collection_id, ordinal_number, trait_overrides, status, image_model)
          VALUES (
            ${collectionId}, 
            ${ordinal_number || null}, 
            ${trait_overrides ? JSON.stringify(trait_overrides) : null},
            'pending',
            ${resolvedModel}
          )
          RETURNING id, collection_id, ordinal_number, trait_overrides, status, created_at
        `;
      } catch (e: any) {
        const msg = String(e?.message || e || '');
        if (msg.toLowerCase().includes('image_model') && msg.toLowerCase().includes('does not exist')) {
          imageModelColumnMissing = true;
          // Fallback for when migration hasn't been applied yet.
          result = await sql`
            INSERT INTO generation_jobs (collection_id, ordinal_number, trait_overrides, status)
            VALUES (
              ${collectionId}, 
              ${ordinal_number || null}, 
              ${trait_overrides ? JSON.stringify(trait_overrides) : null},
              'pending'
            )
            RETURNING id, collection_id, ordinal_number, trait_overrides, status, created_at
          `;
        } else {
          throw e;
        }
      }
      const job = Array.isArray(result) ? result[0] : result;
      jobs.push(job);
    }

    const filterMessage = trait_overrides && Object.keys(trait_overrides).length > 0 
      ? ` (with ${Object.keys(trait_overrides).length} trait filter${Object.keys(trait_overrides).length > 1 ? 's' : ''})` 
      : '';

    return NextResponse.json({ 
      jobs,
      count: jobCount,
      hasTraitOverrides: trait_overrides && Object.keys(trait_overrides).length > 0,
      trait_overrides,
      message: `${jobCount} generation job${jobCount > 1 ? 's' : ''} queued successfully${filterMessage}. They will be processed within 5 minutes.`,
      warning: imageModelColumnMissing
        ? 'Classic/Pro selection saved locally, but the database migration for image_model is not applied yet. Run scripts/migrations/035_add_generation_job_image_model.sql to persist per-job model.'
        : undefined,
    }, { status: 202 });

  } catch (error) {
    console.error('Error queuing generation job:', error);
    const msg = error instanceof Error ? error.message : String(error || '');
    return NextResponse.json(
      { error: 'Failed to queue generation job', details: msg || undefined },
      { status: 500 }
    );
  }
}
