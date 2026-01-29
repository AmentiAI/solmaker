import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { hasEnoughCredits, deductCredits } from '@/lib/credits/credits';
import { calculateCreditsNeeded } from '@/lib/credits/credit-costs';
import { requireWalletAuth } from '@/lib/auth/signature-verification';

// POST /api/collections/[id]/lazy-layers - Add layers and traits to existing collection
// SECURITY: Requires wallet signature verification
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id: collectionId } = await params;
    
    // SECURITY: Require signature verification to prevent spoofing
    const auth = await requireWalletAuth(request, true);
    if (!auth.isValid || !auth.walletAddress) {
      return NextResponse.json({ 
        error: auth.error || 'Authentication required',
        details: 'Please sign the request with your wallet to verify ownership'
      }, { status: 401 });
    }
    
    const wallet_address = auth.walletAddress;

    // Verify collection exists and user has access
    const collectionResult = await sql`
      SELECT 
        id, name, description, wallet_address, art_style, 
        colors_description, lighting_description, border_requirements, 
        custom_rules, pixel_perfect, is_pfp_collection, facing_direction, body_style
      FROM collections 
      WHERE id = ${collectionId}
    ` as any[];

    const collection = Array.isArray(collectionResult) && collectionResult.length > 0 ? collectionResult[0] : null;
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Check if user is owner or admin
    const isOwner = collection.wallet_address === wallet_address;
    if (!isOwner) {
      return NextResponse.json({ error: 'Not authorized. Only collection owner can add layers.' }, { status: 403 });
    }

    // Check if collection already has layers
    const existingLayersResult = await sql`
      SELECT COUNT(*) as count FROM layers WHERE collection_id = ${collectionId}::uuid
    ` as any[];
    const existingLayerCount = existingLayersResult?.[0]?.count || 0;
    if (existingLayerCount > 0) {
      return NextResponse.json({ 
        error: 'Collection already has layers. This feature is only for collections with 0 layers.' 
      }, { status: 400 });
    }

    // Get OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const textModel = process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const pixelPerfectValue = collection.pixel_perfect === true || collection.pixel_perfect === 'true';

    // Step 1: Create standard layers
    const layerNames = ['Background', 'Character Skin', 'Eyes', 'Mouth', 'Outfit', 'Headwear'];
    const createdLayers = [];
    
    for (let i = 0; i < layerNames.length; i++) {
      const layerResult = await sql`
        INSERT INTO layers (collection_id, name, display_order)
        VALUES (${collectionId}::uuid, ${layerNames[i]}, ${i + 1})
        RETURNING id, name, display_order
      ` as any[];
      const layer = Array.isArray(layerResult) && layerResult.length > 0 ? layerResult[0] : null;
      if (layer) {
        createdLayers.push(layer);
      }
    }

    if (createdLayers.length === 0) {
      return NextResponse.json({ error: 'Failed to create layers' }, { status: 500 });
    }

    // Step 2: Generate traits for each layer using AI
    const traitsPerLayer = 8;
    const totalTraits = createdLayers.length * traitsPerLayer;
    const creditsNeeded = await calculateCreditsNeeded('trait_generation', totalTraits);

    // Check and deduct credits
    const hasCredits = await hasEnoughCredits(wallet_address, creditsNeeded);
    if (!hasCredits) {
      // Delete layers if credits insufficient
      await sql`DELETE FROM layers WHERE collection_id = ${collectionId}::uuid`;
      return NextResponse.json(
        { error: `Insufficient credits. You need ${creditsNeeded} credit${creditsNeeded > 1 ? 's' : ''} to generate traits. Please purchase credits.` },
        { status: 402 }
      );
    }

    const creditsDeducted = await deductCredits(
      wallet_address,
      creditsNeeded,
      `Auto-generating ${totalTraits} traits for ${createdLayers.length} layers`
    );

    if (!creditsDeducted) {
      await sql`DELETE FROM layers WHERE collection_id = ${collectionId}::uuid`;
      return NextResponse.json(
        { error: 'Failed to deduct credits. Please try again.' },
        { status: 500 }
      );
    }

    // Build collection context for trait generation
    const collectionName = collection.name || '';
    const collectionDescription = collection.description || '';
    const baseArtStyle = collection.art_style || '';
    const colorsDesc = collection.colors_description || '';
    const lightingDesc = collection.lighting_description || '';
    const borderReqs = collection.border_requirements || '';
    const customRules = collection.custom_rules || '';

    // Generate traits for ALL layers in PARALLEL
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
${baseArtStyle ? `Art Style: ${baseArtStyle}` : ''}
${colorsDesc ? `Colors Description: ${colorsDesc}` : ''}
${lightingDesc ? `Lighting Description: ${lightingDesc}` : ''}
${borderReqs ? `Border Requirements: ${borderReqs}` : ''}
${customRules ? `Custom Rules: ${customRules}` : ''}
Layer: ${layerAny.name}
Layer Type: ${baseTheme}
${specialInstructions}

IMPORTANT INSTRUCTIONS:
1. Analyze the collection name "${collectionName}" and ALL the collection settings above to understand the theme/concept:
   - Example: "down bad dogs" = dogs having bad luck/tough times, "space explorers" = sci-fi astronauts, "cool cats" = stylish cats, etc.
   - The mood and aesthetic (tough, cute, dark, bright, etc.)
   - Use the Art Style, Colors Description, Lighting Description, Border Requirements, and Custom Rules to inform trait generation
   - Traits should align with the specified color palette, lighting mood, and any custom rules provided

2. Create ${traitsPerLayer} unique traits for the "${layerAny.name}" layer that:
   - Match the collection theme/concept based on the collection name AND all collection settings above
   ${colorsDesc ? `- Use colors that align with the Colors Description: "${colorsDesc}"` : ''}
   ${lightingDesc ? `- Consider the Lighting Description: "${lightingDesc}" when describing how traits appear` : ''}
   ${borderReqs ? `- Follow the Border Requirements: "${borderReqs}"` : ''}
   ${customRules ? `- Adhere to the Custom Rules: "${customRules}"` : ''}
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
              await sql`
                INSERT INTO traits (layer_id, name, description, trait_prompt, rarity_weight, created_at, updated_at)
                VALUES (${layerAny.id}::uuid, ${trait.name}, ${trait.description}, ${trait.description}, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT DO NOTHING
              `;
            } catch (error) {
              console.error(`Error inserting trait ${trait.name}:`, error);
            }
          })
        );
        
        console.log(`[Lazy Layers] Generated ${validTraits.length} traits for layer: ${layerAny.name}`);
      } catch (error) {
        console.error(`Error generating traits for layer ${layerAny.name}:`, error);
      }
    };

    // Process ALL layers in PARALLEL
    console.log(`[Lazy Layers] Starting parallel trait generation for ${createdLayers.length} layers...`);
    await Promise.all(createdLayers.map(layer => generateTraitsForLayer(layer)));
    console.log(`[Lazy Layers] All layers processed in parallel!`);

    return NextResponse.json({
      success: true,
      layersCreated: createdLayers.length,
      traitsPerLayer,
      totalTraits: createdLayers.length * traitsPerLayer,
      creditsUsed: creditsNeeded,
    });
  } catch (error: any) {
    console.error('Error in lazy-layers:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to add layers and traits' },
      { status: 500 }
    );
  }
}

