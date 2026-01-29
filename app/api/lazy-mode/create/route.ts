import { NextRequest, NextResponse } from 'next/server';

import { hasEnoughCredits, deductCredits } from '@/lib/credits/credits';
import { calculateCreditsNeeded } from '@/lib/credits/credit-costs';
import { sql } from '@/lib/database';



// POST /api/lazy-mode/create - Create collection and auto-generate layers & traits
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const {
      wallet_address,
      collection_name,
      trait_layers,
      art_style,
      rules,
      total_needed,
    } = body;

    if (!wallet_address || wallet_address.trim() === '') {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    if (!collection_name || collection_name.trim() === '') {
      return NextResponse.json({ error: 'Collection name is required' }, { status: 400 });
    }

    if (!trait_layers || trait_layers.trim() === '') {
      return NextResponse.json({ error: 'Trait layers description is required' }, { status: 400 });
    }

    if (!art_style || art_style.trim() === '') {
      return NextResponse.json({ error: 'Art style description is required' }, { status: 400 });
    }

    // Get OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Step 1: Create collection
    // Generate UUID for collection ID (layers table expects UUID)
    const collectionIdResult = await sql`
      SELECT gen_random_uuid()::text as id
    ` as any[];
    const collectionId = collectionIdResult && collectionIdResult.length > 0 
      ? collectionIdResult[0]?.id 
      : null;
    
    if (!collectionId) {
      throw new Error('Failed to generate collection ID');
    }
    
    const description = `Art Style: ${art_style}${rules ? ` | Rules: ${rules}` : ''}`;
    
    const defaultTraitSelections = {
      characterType: { enabled: false, selected: [] },
      background: { enabled: false, selected: [] },
      accessories: { enabled: false, selected: [] },
      eyes: { enabled: false, selected: [] },
      mouth: { enabled: false, selected: [] },
      headwear: { enabled: false, selected: [] },
      outfits: { enabled: false, selected: [] },
      props: { enabled: false, selected: [] },
    };

    await sql`
      INSERT INTO collections (
        id,
        name,
        description,
        generation_mode,
        trait_selections,
        wallet_address,
        created_at,
        updated_at,
        is_active
      )
      VALUES (
        ${collectionId},
        ${collection_name.trim()},
        ${description},
        'trait',
        ${JSON.stringify(defaultTraitSelections)}::jsonb,
        ${wallet_address.trim()},
        NOW(),
        NOW(),
        false
      )
    `;

    // Step 2: Use AI to generate layer names from description
    const layerPrompt = `Based on this description of trait layers: "${trait_layers}"

Generate a list of layer names for an NFT collection. Each layer should be a single, clear name (like "Background", "Character Base", "Eyes", "Mouth", "Headwear", "Accessories", "Outfit", "Props", etc.).

Return ONLY a JSON array of layer names, nothing else. Example format:
["Background", "Character Base", "Eyes", "Mouth", "Headwear", "Accessories", "Outfit", "Props"]

Make sure the layer names are:
- Clear and descriptive
- In logical order (background first, then character, then details)
- Appropriate for the collection theme described

Return the JSON array now:`;

    const layerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates layer names for NFT collections. Always return valid JSON arrays.'
          },
          {
            role: 'user',
            content: layerPrompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!layerResponse.ok) {
      throw new Error('Failed to generate layer names');
    }

    const layerData = await layerResponse.json();
    let layerNames: string[] = [];
    
    try {
      const content = layerData.choices[0]?.message?.content || '';
      // Try to extract JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        layerNames = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: split by common delimiters
        layerNames = content
          .split(/[,\n]/)
          .map((s: string) => s.trim().replace(/^["']|["']$/g, ''))
          .filter((s: string) => s.length > 0);
      }
    } catch (parseError) {
      // Fallback: use simple parsing
      const content = layerData.choices[0]?.message?.content || '';
      layerNames = content
        .split(/[,\n]/)
        .map((s: string) => s.trim().replace(/^["'\[\]]|["'\[\]]$/g, ''))
        .filter((s: string) => s.length > 0 && s !== 'Background' || s === 'Background')
        .slice(0, 15); // Limit to 15 layers
    }

    // Ensure we have at least some layers
    if (layerNames.length === 0) {
      // Default layers
      layerNames = ['Background', 'Character Base', 'Eyes', 'Mouth', 'Headwear', 'Accessories', 'Outfit', 'Props'];
    }

    // Step 3: Create layers
    // Cast collection_id to UUID for layers table
    const createdLayers: any[] = [];
    for (let i = 0; i < layerNames.length; i++) {
      const layerResult = await sql`
        INSERT INTO layers (collection_id, name, display_order)
        VALUES (${collectionId}::uuid, ${layerNames[i]}, ${i + 1})
        RETURNING id, name, display_order
      ` as any[];
      if (Array.isArray(layerResult) && layerResult.length > 0) {
        createdLayers.push(layerResult[0]);
      }
    }

    // Step 4: Generate traits for each layer using AI
    // Calculate total traits needed (estimate: 10-20 traits per layer)
    const traitsPerLayer = 15; // Generate 15 traits per layer
    const totalTraits = createdLayers.length * traitsPerLayer;
    const creditsNeeded = await calculateCreditsNeeded('trait_generation', totalTraits);

    // Check and deduct credits
    const hasCredits = await hasEnoughCredits(wallet_address, creditsNeeded);
    if (!hasCredits) {
      // Delete collection and layers if credits insufficient
      await sql`DELETE FROM layers WHERE collection_id = ${collectionId}::uuid`;
      await sql`DELETE FROM collections WHERE id = ${collectionId}`;
      return NextResponse.json(
        { error: `Insufficient credits. You need ${creditsNeeded} credit${creditsNeeded > 1 ? 's' : ''} to generate traits. Please purchase credits.` },
        { status: 402 }
      );
    }

    const creditsDeducted = await deductCredits(
      wallet_address,
      creditsNeeded,
      `Auto-generating traits for ${createdLayers.length} layers`
    );

    if (!creditsDeducted) {
      await sql`DELETE FROM layers WHERE collection_id = ${collectionId}::uuid`;
      await sql`DELETE FROM collections WHERE id = ${collectionId}`;
      return NextResponse.json(
        { error: 'Failed to deduct credits. Please try again.' },
        { status: 500 }
      );
    }

    // Generate traits for each layer
    for (const layer of createdLayers) {
      try {
        const traitPrompt = `Generate ${traitsPerLayer} unique trait names and descriptions for a "${layer.name}" layer in a "${collection_name}" ordinal collection.

COLLECTION THEME & CONTEXT:
- Collection Name: "${collection_name}"
- Art Style: ${art_style}
${rules ? `- Rules: ${rules}` : ''}
- Full Description: ${description}

CRITICAL REQUIREMENTS:
1. Analyze the collection name "${collection_name}" to understand its unique theme, concept, and aesthetic
2. Create traits that are SPECIFICALLY tailored to this collection's theme - do NOT use generic trait ideas
3. Each trait must reflect the collection's unique identity and concept
4. Traits should be cohesive with the art style: ${art_style}
${rules ? `5. Traits must follow these rules: ${rules}` : ''}

For each trait, provide:
1. A creative trait name (2-4 words) that matches the collection theme
2. A detailed visual description that aligns with the collection's aesthetic

Format:
TRAIT_1:
NAME: [trait name]
DESCRIPTION: [detailed visual description]

TRAIT_2:
NAME: [trait name]
DESCRIPTION: [detailed visual description]

...and so on for all ${traitsPerLayer} traits.

IMPORTANT: Make sure traits are unique to this collection's theme. Do not reuse generic trait ideas from other collections.`;

        const traitResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are a visual design assistant that creates detailed trait descriptions for NFT collections. You analyze each collection\'s unique theme, name, and description to generate traits that are SPECIFICALLY tailored to that collection. You never reuse generic trait ideas across different collections - each collection gets unique, theme-appropriate traits.'
              },
              {
                role: 'user',
                content: traitPrompt
              }
            ],
            max_tokens: 2000,
            temperature: 0.9,
          }),
        });

        if (!traitResponse.ok) {
          console.error(`Failed to generate traits for layer ${layer.name}`);
          continue;
        }

        const traitData = await traitResponse.json();
        const aiResponse = traitData.choices[0]?.message?.content || '';

        // Parse traits
        const traitMatches = aiResponse.matchAll(/NAME:\s*([\s\S]+?)\s*DESCRIPTION:\s*([\s\S]+?)(?=\n\n|TRAIT_|$)/g);
        const parsedTraits = [];
        
        for (const match of traitMatches) {
          const name = match[1].trim();
          const description = match[2].trim();
          if (name && description) {
            parsedTraits.push({ name, description });
          }
        }

        // Create traits in database (default to common rarity)
        for (const trait of parsedTraits) {
          try {
            await sql`
              INSERT INTO traits (layer_id, name, description, trait_prompt, rarity_weight)
              VALUES (${layer.id}, ${trait.name}, ${trait.description}, ${art_style}, 40)
            `;
          } catch (traitError) {
            console.error(`Error creating trait ${trait.name}:`, traitError);
          }
        }
      } catch (layerError) {
        console.error(`Error generating traits for layer ${layer.name}:`, layerError);
      }
    }

    // Get final layer counts with trait counts
    const layersWithCounts = await sql`
      SELECT 
        l.id,
        l.name,
        l.display_order,
        COUNT(t.id) as trait_count
      FROM layers l
      LEFT JOIN traits t ON l.id = t.layer_id
      WHERE l.collection_id = ${collectionId}::uuid
      GROUP BY l.id, l.name, l.display_order
      ORDER BY l.display_order ASC
    ` as any[];

    return NextResponse.json({
      collection: {
        id: collectionId,
        name: collection_name,
        description,
      },
      layers: Array.isArray(layersWithCounts) ? layersWithCounts.map((l: any) => ({
        id: l.id,
        name: l.name,
        trait_count: parseInt(l.trait_count) || 0,
      })) : [],
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error in lazy mode create:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create collection and generate traits' },
      { status: 500 }
    );
  }
}

