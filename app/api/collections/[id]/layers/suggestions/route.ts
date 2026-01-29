import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { isAuthorized } from '@/lib/auth/access-control';

// Helper function to check collection access
async function checkCollectionAccess(collectionId: string, walletAddress: string): Promise<boolean> {
  const collectionResult = await sql`
    SELECT wallet_address FROM collections WHERE id::text = ${collectionId}
  ` as any[];
  const collection = collectionResult?.[0] || null;
  
  if (!collection) return false;
  
  const isAdmin = isAuthorized(walletAddress);
  const isOwner = walletAddress.trim() === collection.wallet_address;
  if (isOwner || isAdmin) return true;
  
  const collaboratorResult = await sql`
    SELECT role FROM collection_collaborators
    WHERE collection_id = ${collectionId}
      AND wallet_address = ${walletAddress.trim()}
      AND status = 'accepted'
  ` as any[];
  return Array.isArray(collaboratorResult) && collaboratorResult.length > 0;
}

// POST /api/collections/[id]/layers/suggestions - Get AI suggestions for new layers
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { wallet_address, ignore_list } = body;

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 });
    }
    
    const hasAccess = await checkCollectionAccess(id, wallet_address);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Get existing layers for the collection
    const existingLayers = await sql`
      SELECT name
      FROM layers
      WHERE collection_id = ${id}
      ORDER BY display_order ASC
    ` as any[];

    const existingLayerNames = Array.isArray(existingLayers)
      ? existingLayers.map(l => l.name).join(', ')
      : '';

    // Get collection info for context
    const [collectionInfo] = await sql`
      SELECT name, description, art_style, is_pfp_collection
      FROM collections
      WHERE id = ${id}
    ` as any[];

    if (!collectionInfo) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Call OpenAI to get suggestions
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const configuredModel = process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const textModel = configuredModel.startsWith('gpt-image') ? 'gpt-4o-mini' : configuredModel;

    // Build ignore list from existing layers and previously shown suggestions
    const allIgnoredLayers: string[] = []
    if (existingLayerNames) {
      allIgnoredLayers.push(...existingLayerNames.split(', '))
    }
    if (ignore_list && Array.isArray(ignore_list) && ignore_list.length > 0) {
      allIgnoredLayers.push(...ignore_list)
    }
    
    const ignoredLayersText = allIgnoredLayers.length > 0
      ? allIgnoredLayers.join(', ')
      : ''
    
    const existingLayersSection = ignoredLayersText
      ? `\n\nLAYERS TO IGNORE (do NOT suggest these or similar names):\n${ignoredLayersText}\n\nMake sure your suggestions are COMPLETELY DIFFERENT from all the layers listed above and complement them without overlapping.`
      : '\n\nThis collection has no existing layers yet, so suggest foundational layers that would work well for this type of collection.';

    const collectionType = collectionInfo.is_pfp_collection ? 'PFP (profile picture) collection' : 'NFT collection';
    const artStyleContext = collectionInfo.art_style ? ` The art style is: ${collectionInfo.art_style}.` : '';

    const prompt = `You are helping create layer suggestions for a ${collectionType} called "${collectionInfo.name}".${collectionInfo.description ? ` Description: ${collectionInfo.description}.` : ''}${artStyleContext}${existingLayersSection}

Please suggest exactly 5 layer names that would complement the existing layers and not overlap with them. Each layer should represent a distinct visual element or category that can be used to create variations in the collection.

Return ONLY a JSON array of exactly 5 layer name strings, nothing else. Example format: ["Background", "Eyes", "Mouth", "Outfit", "Headwear"]

Layer names should be:
- Clear and descriptive
- Not duplicate or overlap with existing layers
- Appropriate for the collection type and art style
- Common terms used in NFT/PFP collections`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: textModel,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that suggests layer names for NFT collections. Always return valid JSON arrays.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to get suggestions from AI' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '[]';

    // Parse the JSON response
    let suggestions: string[] = [];
    try {
      // Try to extract JSON array from the response (in case it's wrapped in markdown)
      const jsonMatch = content.match(/\[.*\]/s);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        suggestions = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content);
      // Fallback: try to extract layer names from text
      const lines = content.split('\n').filter(line => line.trim());
      suggestions = lines
        .map(line => {
          const match = line.match(/"([^"]+)"/);
          return match ? match[1] : null;
        })
        .filter(Boolean) as string[];
      
      if (suggestions.length === 0) {
        return NextResponse.json(
          { error: 'Failed to parse AI suggestions' },
          { status: 500 }
        );
      }
    }

    // Ensure we have exactly 5 suggestions (pad or trim if needed)
    if (suggestions.length < 5) {
      const fallbackSuggestions = ['Background', 'Eyes', 'Mouth', 'Outfit', 'Headwear'];
      suggestions = [...suggestions, ...fallbackSuggestions.slice(suggestions.length)];
    }
    suggestions = suggestions.slice(0, 5);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Error getting layer suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to get layer suggestions' },
      { status: 500 }
    );
  }
}

