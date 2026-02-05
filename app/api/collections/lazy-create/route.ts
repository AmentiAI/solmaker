import { NextRequest, NextResponse } from 'next/server';
import { hasEnoughCredits, deductCredits } from '@/lib/credits/credits';
import { calculateCreditsNeeded } from '@/lib/credits/credit-costs';
import { sql } from '@/lib/database';
import { requireWalletAuth } from '@/lib/auth/signature-verification';

// Increase timeout for this route (trait generation can take a while)
export const maxDuration = 300; // 5 minutes (default is 10 seconds for Hobby, 60 for Pro)
export const dynamic = 'force-dynamic';

// POST /api/collections/lazy-create - Create chibi collection with auto-generated layers and traits
// SECURITY: Requires wallet signature verification
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    // SECURITY: Require signature verification to prevent spoofing
    const auth = await requireWalletAuth(request, true);
    if (!auth.isValid || !auth.walletAddress) {
      return NextResponse.json({ 
        error: auth.error || 'Authentication required',
        details: 'Please sign the request with your wallet to verify ownership'
      }, { status: 401 });
    }
    
    const walletAddress = auth.walletAddress;
    const db = sql as NonNullable<typeof sql>;
    const body = await request.clone().json();
    const { collection_name, name, description, compression_quality, compression_dimensions, compression_format, is_pfp_collection, facing_direction, body_style, art_style, art_style_id, border_requirements, colors_description, lighting_description, custom_rules, pixel_perfect } = body;

    // Support both 'name' and 'collection_name' for compatibility
    const collectionName = (collection_name || name || '').trim();

    if (!collectionName) {
      return NextResponse.json({ error: 'Collection name is required' }, { status: 400 });
    }

    // Get OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Use a text-capable model for trait generation.
    const configuredModel = process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const textModel = configuredModel.startsWith('gpt-image') ? 'gpt-4o-mini' : configuredModel;

    // Step 1: Generate collection ID
    const collectionIdResult = await db`
      SELECT gen_random_uuid()::text as id
    ` as any[];
    const collectionId = Array.isArray(collectionIdResult) && collectionIdResult.length > 0 ? collectionIdResult[0]?.id : null;
    
    if (!collectionId) {
      throw new Error('Failed to generate collection ID');
    }

    // Art style and prompt settings from user selection or defaults
    const baseArtStyle = art_style?.trim() || 'Professional digital illustration, high quality, detailed rendering';
    const colorsDesc = colors_description?.trim() || null;
    const lightingDesc = lighting_description?.trim() || null;
    const borderReqs = border_requirements?.trim() || null;
    
    const collectionDescription = description?.trim() || `Ordinal collection with unique characters and traits.`;

    // Validate PFP settings (needed for custom rules prompt)
    const isPfp = is_pfp_collection === true || is_pfp_collection === 'true';
    const validFacingDirections = ['left', 'left-front', 'front', 'right-front', 'right'];
    const facingDir = isPfp && facing_direction && validFacingDirections.includes(facing_direction)
      ? facing_direction
      : null;
    const validBodyStyles = ['full', 'half', 'headonly'];
    const bodyStyleValue = isPfp && body_style && validBodyStyles.includes(body_style)
      ? body_style
      : 'full';

    // Generate custom rules with head and body frame dimensions using OpenAI (lazy mode only)
    let customRulesValue = custom_rules?.trim() || null;
    if (!customRulesValue) {
      try {
        const dimensionPrompt = `Based on the following collection details, create a simple image prompt that specifies head and upper body frame dimensions for consistent character generation.

Collection Name: "${collectionName}"
Collection Description: "${collectionDescription}"
Art Style: "${baseArtStyle}"
${colorsDesc ? `Colors: "${colorsDesc}"` : ''}
${lightingDesc ? `Lighting: "${lightingDesc}"` : ''}
${isPfp ? `PFP Collection: Yes, Body Style: ${bodyStyleValue}, Facing: ${facingDir || 'front'}` : 'PFP Collection: No'}

Generate a concise image prompt (2-3 sentences) that specifies:
1. Head dimensions and positioning (e.g., head size relative to frame, head position from top)
2. Upper body/chest frame dimensions and positioning (e.g., upper body width, shoulder positioning, chest area)
3. Any specific proportions needed for consistency

The prompt should be clear, specific, and suitable for image generation. Focus on dimensional requirements that ensure all generated characters have consistent head and body proportions.

Return ONLY the prompt text, no additional explanation.`;

        const dimensionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: textModel,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that creates precise image generation prompts with specific dimensional requirements for consistent character design.'
              },
              {
                role: 'user',
                content: dimensionPrompt
              }
            ],
            temperature: 0.7,
            max_tokens: 300,
          }),
        });

        if (dimensionResponse.ok) {
          const dimensionData = await dimensionResponse.json();
          const generatedRules = dimensionData.choices[0]?.message?.content?.trim();
          if (generatedRules) {
            customRulesValue = generatedRules;
            console.log('[Lazy Create] Generated custom rules with dimensions:', customRulesValue);
          }
        } else {
          console.warn('[Lazy Create] Failed to generate custom rules, using null');
        }
      } catch (error) {
        console.error('[Lazy Create] Error generating custom rules:', error);
        // Continue without custom rules if generation fails
      }
    }
    
    const defaultTraitSelections = {
      characterType: { enabled: false, selected: [] },
      background: { enabled: false, selected: [] },
      accessories: { enabled: false, selected: [] },
      eyes: { enabled: false, selected: [] },
      mouth: { enabled: false, selected: [] },
      headwear: { enabled: false, selected: [] },
      outfits: { enabled: false, selected: [] },
    };

    // Validate compression settings (only if provided)
    const quality = compression_quality !== undefined && compression_quality !== null && compression_quality !== ''
      ? Math.max(0, Math.min(100, parseInt(String(compression_quality)) || 100))
      : null;
    const dimensions = compression_dimensions !== undefined && compression_dimensions !== null && compression_dimensions !== ''
      ? Math.max(1, Math.min(1024, parseInt(String(compression_dimensions)) || 1024))
      : null;
    const format = compression_format && ['jpg', 'png', 'webp'].includes(compression_format)
      ? compression_format
      : 'webp'; // Default to webp

    // Step 2: Create collection with settings from form
    const pixelPerfectValue = pixel_perfect === true || pixel_perfect === 'true';

    await db`
      INSERT INTO collections (
        id,
        name,
        description,
        generation_mode,
        trait_selections,
        wallet_address,
        art_style,
        colors_description,
        lighting_description,
        border_requirements,
        custom_rules,
        is_pfp_collection,
        facing_direction,
        body_style,
        pixel_perfect,
        compression_quality,
        compression_dimensions,
        compression_format,
        created_at,
        updated_at
      )
      VALUES (
        ${collectionId},
        ${collectionName},
        ${collectionDescription},
        'trait',
        ${JSON.stringify(defaultTraitSelections)}::jsonb,
        ${walletAddress},
        ${baseArtStyle},
        ${colorsDesc},
        ${lightingDesc},
        ${borderReqs},
        ${customRulesValue},
        ${isPfp},
        ${facingDir},
        ${bodyStyleValue},
        ${pixelPerfectValue},
        ${quality},
        ${dimensions},
        ${format},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;

    // Step 3: Create standard layers for collection
    const layerNames = ['Background', 'Character Skin', 'Eyes', 'Mouth', 'Outfit', 'Headwear'];
    const createdLayers = [];
    
    for (let i = 0; i < layerNames.length; i++) {
      const layerResult = await db`
        INSERT INTO layers (collection_id, name, display_order)
        VALUES (${collectionId}::uuid, ${layerNames[i]}, ${i + 1})
        RETURNING id, name, display_order
      ` as any[];
      const layer = Array.isArray(layerResult) && layerResult.length > 0 ? layerResult[0] : null;
      if (layer) {
        createdLayers.push(layer);
      }
    }

    // Step 4: Generate traits for each layer using AI
    const traitsPerLayer = 8; // Generate 8 traits per layer
    const totalTraits = createdLayers.length * traitsPerLayer;
    const creditsNeeded = await calculateCreditsNeeded('trait_generation', totalTraits);

    // Check and deduct credits
    const hasCredits = await hasEnoughCredits(walletAddress, creditsNeeded);
    if (!hasCredits) {
      // Delete collection and layers if credits insufficient
      await db`DELETE FROM layers WHERE collection_id = ${collectionId}::uuid`;
      await db`DELETE FROM collections WHERE id = ${collectionId}`;
      return NextResponse.json(
        { error: `Insufficient credits. You need ${creditsNeeded} credit${creditsNeeded > 1 ? 's' : ''} to generate traits. Please purchase credits.` },
        { status: 402 }
      );
    }

    const creditsDeducted = await deductCredits(
      walletAddress,
      creditsNeeded,
      `Auto-generating ${totalTraits} traits for chibi collection`
    );

    if (!creditsDeducted) {
      await db`DELETE FROM layers WHERE collection_id = ${collectionId}::uuid`;
      await db`DELETE FROM collections WHERE id = ${collectionId}`;
      return NextResponse.json(
        { error: 'Failed to deduct credits. Please try again.' },
        { status: 500 }
      );
    }

    // Generate traits for ALL layers in PARALLEL (much faster than sequential)
    const generateTraitsForLayer = async (layer: any) => {
      const layerAny = layer as any;

      // Create a theme based on layer name
      let baseTheme = '';
      let specialInstructions = '';
      switch (layerAny.name.toLowerCase()) {
        case 'background': baseTheme = 'backgrounds and environments'; break;
        case 'character skin':
          baseTheme = 'full-body skin, fur, or body texture covering the entire character';
          specialInstructions = `
CRITICAL FOR CHARACTER SKIN LAYER:
- This layer represents the ENTIRE BODY covering (fur, skin, scales, texture, etc.)
- Describe the FULL BODY appearance, NOT individual body parts like eyes, nose, ears, paws, etc.
- Think of this as the base layer that covers the whole character from head to toe
- Examples of GOOD character skin traits: "Scruffy Brown Fur", "Wet Matted Fur", "Patchy Grey and White Fur", "Mangy Spotted Fur", "Sleek Black Fur", "Muddy Tan Fur"
- Examples of BAD character skin traits: "Cloudy Blue Eyes" (this is eyes, not skin), "Dirty White Socks" (this is paws/feet, not full body skin), "Faded Black Snout" (this is nose, not skin)
- Each trait should describe what the ENTIRE character's body covering looks like, not specific body parts`;
          break;
        case 'eyes': baseTheme = 'eye styles and eye appearances'; break;
        case 'mouth': baseTheme = 'mouth styles and mouth appearances'; break;
        case 'outfit': 
          baseTheme = 'outfits and clothing';
          specialInstructions = `
IMPORTANT - OUTFIT LAYER RULES:
- Outfits must be UPPER BODY CLOTHING ONLY that goes ON TOP of the character body
- Examples of GOOD outfit traits: "Red Hoodie", "Leather Jacket", "Hawaiian Shirt", "Tank Top", "Varsity Jacket", "Denim Vest", "Turtleneck Sweater", "Band T-Shirt"
- Examples of BAD outfit traits: "Full Hazmat Suit" (covers entire body including head), "Mascot Costume" (full body), "Onesie Pajamas" (full body), "Diving Suit" (full body)
- Outfits should leave the HEAD, FACE, and LOWER BODY (legs/feet) visible so other layers can be seen
- Think of outfits as what goes on the TORSO and ARMS area only
- Outfits should NOT include hats, helmets, or headwear (those are in the headwear layer)
- Outfits should NOT include pants, shoes, or lower body clothing (character skin handles body appearance)`;
          break;
        case 'headwear': baseTheme = 'headwear and head accessories'; break;
        default: baseTheme = `${layerAny.name.toLowerCase()} items`;
      }

      // Check if this is a character body layer and pixel-perfect is enabled
      const isCharacterBodyLayer = ['character skin', 'character', 'skin', 'body'].some(keyword =>
        layerAny.name.toLowerCase().includes(keyword)
      );
      const usePixelPerfect = pixelPerfectValue && isCharacterBodyLayer;

      try {
        // Generate ALL traits for this layer in ONE API call
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: textModel,
            messages: [
              {
                role: 'system',
                content: 'You are a creative assistant that generates unique trait names and descriptions for NFT collections. You analyze each collection\'s unique theme, name, and description to generate traits that are SPECIFICALLY tailored to that collection. You never reuse generic trait ideas across different collections - each collection gets unique, theme-appropriate traits that match its specific concept and aesthetic. Always return valid JSON.'
              },
              {
                role: 'user',
                content: `Generate ${traitsPerLayer} unique traits for an NFT collection.

Collection Name: "${collectionName}"
Collection Description: "${collectionDescription}"
Layer: ${layerAny.name}
Layer Type: ${baseTheme}
${specialInstructions}

IMPORTANT INSTRUCTIONS:
1. Analyze the collection name "${collectionName}" to understand the theme/concept:
   - Example: "down bad dogs" = dogs having bad luck/tough times, "space explorers" = sci-fi astronauts, "cool cats" = stylish cats, etc.
   - The mood and aesthetic (tough, cute, dark, bright, etc.)

2. Create ${traitsPerLayer} unique traits for the "${layerAny.name}" layer that:
   - Match the collection theme/concept based on the collection name
   - Are STANDALONE visual descriptions - do NOT mention any art style, rendering style, or aesthetic in the trait names or descriptions
   - Focus only on WHAT the trait IS (colors, shapes, textures, materials, patterns, details)
   - Are unique and creative (no duplicates)
   - Have clear, descriptive names (2-4 words each)
   - Have PRECISE, DETERMINISTIC visual descriptions that will generate the EXACT SAME image every time
   - CRITICAL: NO TEXT OR WORDS should appear on any trait. Traits must be purely visual elements only.
   
   DETERMINISTIC REQUIREMENTS - Be extremely specific about:
   - EXACT colors (e.g., "deep crimson red", "pale mint green")
   - EXACT counts (e.g., "three small stars", "two vertical stripes")
   - EXACT positions (e.g., "centered horizontally", "tilted 15 degrees left")
   - EXACT sizes (e.g., "small 20% width", "large covering 60% of area")
   - EXACT textures (e.g., "smooth matte finish", "rough weathered wood grain")
   - EXACT patterns (e.g., "diagonal stripes running top-left to bottom-right")
${usePixelPerfect ? `
   PIXEL-PERFECT POSITIONING (CRITICAL FOR CHARACTER BODIES):
   - Body must be CENTERED VERTICALLY in the frame (head at top 15%, feet at bottom 5%)
   - Body must be CENTERED HORIZONTALLY (equal space left and right)
   - Head position: top of head at 10-15% from top edge
   - Shoulders: positioned at 25-30% from top edge
   - Waist/hips: positioned at 50-55% from top edge
   - Feet: positioned at 90-95% from top edge (bottom of frame)
   - Arms: symmetrically positioned relative to body centerline
   - All body parts must maintain EXACT proportional spacing for consistency across traits
   - Example: "Character body centered vertically and horizontally, head top at 12% from top, shoulders at 28% from top, waist at 52% from top, feet at 92% from bottom, arms symmetrically spaced 15% from body centerline"
` : ''}

3. DO NOT mention any of these in trait names or descriptions:
   - Art styles (chibi, anime, realistic, graffiti, pixel art, etc.)
   - Rendering styles (3D, painted, illustrated, etc.)
   - Medium (watercolor, spray paint, digital, etc.)
   The art style will be applied separately during image generation - traits should describe the SUBJECT MATTER only.

4. GOOD trait example: "Crimson Bandana" - "A deep red bandana with five white paisley swirls evenly spaced, tied in a knot at the back-left, three frayed threads hanging 2cm from the right edge, slight fade marks on the front-center"
   BAD trait example: "Graffiti Bandana" - "A bandana in graffiti style with spray paint effects" (DON'T do this - too vague and includes art style!)

5. All traits must be visual-only. Never include text, words, letters, numbers, or written symbols.

Return ONLY valid JSON in this format:
{
  "traits": [
    { "name": "Trait Name 1", "description": "Detailed visual description of what it looks like..." },
    { "name": "Trait Name 2", "description": "Detailed visual description of what it looks like..." }
  ]
}`
              }
            ],
            temperature: 0.9,
            max_tokens: 2000,
          }),
        });

        if (!openaiResponse.ok) {
          console.error(`OpenAI API error for layer ${layerAny.name}:`, await openaiResponse.text());
          return;
        }

        const openaiData = await openaiResponse.json();
        const content = openaiData.choices[0]?.message?.content;
        
        if (!content) {
          console.error(`No content from OpenAI for layer ${layerAny.name}`);
          return;
        }

        // Parse JSON response
        let traitData;
        try {
          const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
          const jsonString = jsonMatch ? jsonMatch[1] : content;
          traitData = JSON.parse(jsonString.trim());
        } catch (parseError) {
          console.error(`Failed to parse OpenAI response for layer ${layerAny.name}:`, content);
          return;
        }

        // Extract traits array
        const traits = traitData.traits || traitData;
        if (!Array.isArray(traits)) {
          console.error(`Invalid traits format for layer ${layerAny.name}:`, traitData);
          return;
        }

        // Filter and prepare valid traits
        const validTraits = traits
          .map(trait => ({ name: trait.name?.trim(), description: trait.description?.trim() }))
          .filter(trait => trait.name && trait.description);

        if (validTraits.length === 0) {
          console.error(`No valid traits for layer ${layerAny.name}`);
          return;
        }

        // Insert all traits for this layer in parallel
        await Promise.all(
          validTraits.map(async (trait) => {
            try {
              await db`
                INSERT INTO traits (layer_id, name, description, trait_prompt, rarity_weight, created_at, updated_at)
                VALUES (${layerAny.id}::uuid, ${trait.name}, ${trait.description}, ${trait.description}, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT DO NOTHING
              `;
            } catch (error) {
              console.error(`Error inserting trait ${trait.name}:`, error);
            }
          })
        );
        
        console.log(`[Lazy Create] Generated ${validTraits.length} traits for layer: ${layerAny.name}`);
      } catch (error) {
        console.error(`Error generating traits for layer ${layerAny.name}:`, error);
      }
    };

    // Process ALL layers in PARALLEL - this is the key optimization!
    // Instead of 7 sequential API calls (35+ seconds), all 7 run at once (~5 seconds)
    console.log(`[Lazy Create] Starting parallel trait generation for ${createdLayers.length} layers...`);
    await Promise.all(createdLayers.map(layer => generateTraitsForLayer(layer)));
    console.log(`[Lazy Create] All layers processed in parallel!`);

    return NextResponse.json({
      success: true,
      collection: {
        id: collectionId,
        name: collectionName,
      },
      layersCreated: createdLayers.length,
      traitsPerLayer,
      totalTraits: createdLayers.length * traitsPerLayer,
      creditsUsed: creditsNeeded,
    });
  } catch (error: any) {
    console.error('Error in lazy-create:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create collection' },
      { status: 500 }
    );
  }
}

