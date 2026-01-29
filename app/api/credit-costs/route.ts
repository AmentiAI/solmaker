import { NextRequest, NextResponse } from 'next/server';
import { getCreditCost } from '@/lib/credits/credit-costs';

// GET /api/credit-costs - Get all credit costs (public endpoint)
export async function GET(request: NextRequest) {
  try {
    // Fetch costs for all action types
    const [imageCost, traitCost, collectionCost] = await Promise.all([
      getCreditCost('image_generation'),
      getCreditCost('trait_generation'),
      getCreditCost('collection_generation'),
    ]);

    return NextResponse.json({
      costs: {
        image_generation: imageCost,
        trait_generation: traitCost,
        collection_generation: collectionCost,
      },
    });
  } catch (error: any) {
    console.error('Error fetching credit costs:', error);
    // Return defaults on error
    return NextResponse.json({
      costs: {
        image_generation: 1.0,
        trait_generation: 0.05,
        collection_generation: 1.0,
      },
    });
  }
}

