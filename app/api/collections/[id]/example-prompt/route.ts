import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

// This replicates the buildPrompt logic from process-generation-jobs-v2/route.ts
// NOTE: Must stay in sync with buildPrompt function - any changes here should be mirrored there
function buildExamplePrompt(
  collection: {
    name: string;
    description?: string;
    art_style?: string;
    border_requirements?: string;
    custom_rules?: string;
    colors_description?: string;
    lighting_description?: string;
    is_pfp_collection?: boolean;
    facing_direction?: string;
    body_style?: string;
    pixel_perfect?: boolean;
    wireframe_config?: any;
  },
  traits: Record<string, { name: string; description: string; trait_prompt: string }>
): string {
  const artStyle = collection.art_style?.trim();
  const borderReqs = collection.border_requirements?.trim();
  const customRules = collection.custom_rules?.trim();
  const colorsDescription = collection.colors_description?.trim();
  const lightingDescription = collection.lighting_description?.trim();
  const isPfpCollection = collection.is_pfp_collection ?? false;
  const facingDirection = collection.facing_direction || 'front';
  const bodyStyle = collection.body_style || 'full';
  const pixelPerfect = collection.pixel_perfect ?? false;

  const bodyVisibilityBlock = (() => {
    if (!isPfpCollection) return null;
    const style = String(bodyStyle || 'full').toLowerCase();

    if (style === 'headonly') {
      const headOnlyBase = [
        '⚠️ BODY VISIBILITY (NON-NEGOTIABLE): HEAD & SHOULDERS ONLY.',
        'Framing: crop just below shoulders / upper chest. NO torso below chest. NO waist. NO legs.',
        'If any body beyond shoulders would appear, adjust camera/framing to remove it.',
      ];

      // Add pixel-perfect positioning when enabled
      if (pixelPerfect) {
        // Pixel coordinates for 1024x1024 canvas
        // Default values for head & shoulders positioning
        const topOfHead = 150; // pixels from top (approximately 15%)
        const leftMargin = 200; // pixels from left edge
        const rightMargin = 200; // pixels from right edge (character width = 1024 - 200 - 200 = 624px)
        const shoulderLine = 750; // pixels from top (approximately 73%)
        const bottomCrop = 850; // pixels from top (approximately 83%)
        
        headOnlyBase.push(
          '\n\nPIXEL-PERFECT POSITIONING (1024x1024 canvas):',
          `– Top of head frame: ${topOfHead}px from top edge.`,
          `– Left margin: ${leftMargin}px from left edge.`,
          `– Right margin: ${rightMargin}px from right edge.`,
          `– Character frame width: ${1024 - leftMargin - rightMargin}px (centered horizontally).`,
          `– Shoulder line position: ${shoulderLine}px from top edge.`,
          `– Bottom crop: ${bottomCrop}px from top edge.`,
          '\n\nNote: Character facing direction is set separately and takes priority. Frame dimensions apply within the chosen orientation.'
        );
      }

      return headOnlyBase.join(' ');
    }

    if (style === 'half') {
      return [
        '⚠️ BODY VISIBILITY (NON-NEGOTIABLE): UPPER BODY ONLY (WAIST UP).',
        'Framing: include head, shoulders, chest, and waist/hips area. EXCLUDE legs and feet entirely.',
        'If legs/feet would appear, zoom/crop to waist-up.',
      ].join(' ');
    }

    const fullBodyBase = [
      '⚠️ BODY VISIBILITY (NON-NEGOTIABLE): FULL BODY.',
      'Framing: include the entire character from head to feet in-frame. NO cropping of feet or lower legs.',
      'If feet would be cut off, zoom out / reposition to keep full body visible.',
    ];

    if (pixelPerfect) {
      // Pixel coordinates for 1024x1024 canvas
      const topOfHead = 100; // pixels from top (approximately 10%)
      const leftMargin = 150; // pixels from left edge
      const rightMargin = 150; // pixels from right edge
      const shoulderLine = 300; // pixels from top (approximately 29%)
      const waistLine = 550; // pixels from top (approximately 54%)
      const feetBottom = 950; // pixels from top (approximately 93%)
      
      fullBodyBase.push(
        '\n\nPIXEL-PERFECT POSITIONING (1024x1024 canvas):',
        `– Top of head: ${topOfHead}px from top edge.`,
        `– Left margin: ${leftMargin}px from left edge.`,
        `– Right margin: ${rightMargin}px from right edge.`,
        `– Character frame width: ${1024 - leftMargin - rightMargin}px (centered horizontally).`,
        `– Shoulder line: ${shoulderLine}px from top edge.`,
        `– Waist/hips: ${waistLine}px from top edge.`,
        `– Feet soles: ${feetBottom}px from top edge.`,
        '\n\nNote: Character facing direction is set separately and takes priority. Frame dimensions apply within the chosen orientation.'
      );
    }

    return fullBodyBase.join(' ');
  })();

  const traitDescriptions = Object.entries(traits)
    .map(([layerName, trait]) => {
      const desc = trait.description || trait.name;
      return `${layerName}: ${trait.name} - ${desc}`;
    })
    .join('\n');

  const isAbstractStyle = artStyle && (
    artStyle.toLowerCase().includes('abstract') ||
    artStyle.toLowerCase().includes('surreal') ||
    artStyle.toLowerCase().includes('non-representational')
  );

  const sections: string[] = [];

  if (isAbstractStyle && artStyle) {
    sections.push(`🎨 PRIMARY ART STYLE (MOST IMPORTANT): ${artStyle}`);
    sections.push('');
    sections.push('⚠️ ABSTRACT/SURREAL INTERPRETATION: All elements should be interpreted through an abstract, non-representational lens. Traits are INSPIRATIONS, not literal requirements. Use flowing forms, dreamlike aesthetics, and artistic expression over literal representation.');
    sections.push('');
  }

  sections.push('⚠️ SINGLE CHARACTER REQUIREMENT: This image must contain EXACTLY ONE character. NO multiple characters, NO two characters, NO group shots, NO companions, NO sidekicks, NO background characters. ONLY ONE main character/subject in the entire image.');
  sections.push('');

  const formatLine = isAbstractStyle 
    ? 'Abstract artistic illustration with non-representational elements.'
    : 'Professional digital illustration.';
  sections.push(formatLine);
  sections.push('');

  if (artStyle && !isAbstractStyle) {
    sections.push(`ART STYLE: ${artStyle}`);
    sections.push('');
  }
  
  if (collection.description?.trim()) {
    sections.push(`DESCRIPTION: ${collection.description.trim()}`);
    sections.push('');
  }

  sections.push('ASSIGNED TRAITS:');
  sections.push(traitDescriptions);
  sections.push('');
  
  if (isAbstractStyle) {
    sections.push('TRAIT INTERPRETATION: Use traits as abstract INSPIRATIONS. Interpret colors, textures, and concepts through flowing forms, dreamlike aesthetics, and artistic expression. NO literal representation required - prioritize abstract artistic expression over exact trait matching.');
    sections.push('');
  } else {
    sections.push('TRAIT RENDERING: Each trait must be rendered EXACTLY as specified in the descriptions. NO artistic interpretation, NO variation.');
    sections.push('');
  }

  if (customRules) {
    // Preserve line breaks in custom rules
    const formattedCustomRules = customRules.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    sections.push(`CUSTOM RULES: ${formattedCustomRules}`);
    sections.push('');
  }

  const isMinimalistStyle = artStyle && (
    artStyle.toLowerCase().includes('minimalist') || 
    artStyle.toLowerCase().includes('flat design') ||
    artStyle.toLowerCase().includes('simple')
  );
  const isPixelArtStyle = artStyle && artStyle.toLowerCase().includes('pixel');

  if (isAbstractStyle) {
    sections.push('DETAIL: Flowing forms, dreamlike textures, abstract patterns, artistic expression, vibrant colors, imaginative composition, non-representational elements.');
    sections.push('');
  } else if (!isMinimalistStyle && !isPixelArtStyle) {
    sections.push('DETAIL: Multiple layers, texture, highlights, shadows, material quality rendering.');
    sections.push('');
  } else if (isPixelArtStyle) {
    sections.push('DETAIL: Crisp pixel edges, limited color palette, retro game aesthetic, no anti-aliasing, clean blocky pixels.');
    sections.push('');
  } else if (isMinimalistStyle) {
    sections.push('DETAIL: Clean shapes, limited colors, simple geometric forms, no unnecessary complexity.');
    sections.push('');
  }
  
  if (lightingDescription) {
    // Preserve line breaks in lighting description
    const formattedLighting = lightingDescription.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    sections.push(`LIGHTING: ${formattedLighting}`);
    sections.push('');
  }
  
  if (colorsDescription) {
    // Preserve line breaks in colors description
    const formattedColors = colorsDescription.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    sections.push(`COLORS: ${formattedColors}`);
    sections.push('');
  }

  if (borderReqs) {
    // Preserve line breaks in border requirements
    const formattedBorder = borderReqs.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    sections.push(`BORDER: ${formattedBorder} - PLACEMENT: Outer edge EXACTLY at canvas edge, NO gaps, FULL BLEED.`);
    sections.push('');
  }

  if (isAbstractStyle) {
    sections.push('QUALITY: Abstract artistic expression, flowing forms, dreamlike aesthetic, vibrant colors, imaginative composition.');
    sections.push('');
    sections.push('FINAL: Abstract surreal style with non-representational elements, artistic expression prioritized over literal representation, dreamlike aesthetic throughout.');
  } else if (isMinimalistStyle) {
    sections.push('QUALITY: Professional flat design, clean edges, consistent color fills, balanced composition.');
    sections.push('');
    sections.push('FINAL: Clean minimalist aesthetic, simple shapes, limited color palette, modern design.');
  } else if (isPixelArtStyle) {
    sections.push('QUALITY: Professional pixel art, crisp edges, consistent pixel size, retro game quality.');
    sections.push('');
    sections.push('FINAL: Authentic pixel art style, no smoothing, consistent blocky aesthetic throughout.');
  } else {
     sections.push('');
  }

  // Only include pose section if PFP collection (body style added at end for emphasis)
  // For abstract styles, make positioning more flexible
  // NOTE: This must match buildPrompt in process-generation-jobs-v2/route.ts exactly
  if (isPfpCollection && !isAbstractStyle) {
    const directionMap: Record<string, string> = {
      'left': `ORIENTATION LOCK (CRITICAL):
Character is facing LEFT (←).
Body rotated 70–90° toward the LEFT edge of the image.
Face turned LEFT, nose pointing toward left image boundary.
Left shoulder is closer to the viewer than the right.
Camera positioned left-side of the character.

TORSO & PELVIS ORIENTATION LOCK (CRITICAL):
Torso, chest, AND pelvis all face the SAME direction (left).
Spine aligned with body rotation — no twist.
Chest plane angled 70–90° toward the LEFT image edge.
Pelvis square with torso, NOT counter-rotated.
NO contrapposto stance.

NEGATIVE ORIENTATION:
NOT facing right.
NOT angled toward right edge.
NOT mirrored.
NOT right-leaning.
NOT contrapposto.
NOT torso twisted opposite the head.
NOT hips facing right.
NOT shoulders facing right while head faces left.

If orientation is incorrect, FLIP HORIZONTALLY so the character faces LEFT.
Left-facing orientation takes absolute priority over all other pose details.`,
      'left-front': `ORIENTATION LOCK (CRITICAL):
Character is facing FRONT-LEFT (↖).
Body rotated 10–20° toward the LEFT edge of the image.
Face turned slightly LEFT, nose pointing toward left image boundary.
Left shoulder is closer to the viewer than the right.
Camera positioned front-left of the character.

TORSO & PELVIS ORIENTATION LOCK (CRITICAL):
Torso, chest, AND pelvis all face the SAME direction (front-left).
Spine aligned with body rotation — no twist.
Chest plane angled 10–20° toward the LEFT image edge.
Pelvis square with torso, NOT counter-rotated.
NO contrapposto stance.

NEGATIVE ORIENTATION:
NOT facing right.
NOT angled toward right edge.
NOT mirrored.
NOT right-leaning.
NOT contrapposto.
NOT torso twisted opposite the head.
NOT hips facing right.
NOT shoulders facing right while head faces left.

If orientation is incorrect, FLIP HORIZONTALLY so the character faces LEFT.
Left-facing orientation takes absolute priority over all other pose details.`,
      'front': `ORIENTATION LOCK (CRITICAL):
Character is facing DIRECTLY FRONT (↑).
Body rotated 0° - perfectly centered and symmetrical.
Face turned directly forward, nose pointing straight at viewer.
Both shoulders equidistant from viewer.
Camera positioned directly in front of the character.

TORSO & PELVIS ORIENTATION LOCK (CRITICAL):
Torso, chest, AND pelvis all face the SAME direction (directly front).
Spine aligned with body rotation — no twist.
Chest plane perfectly centered, 0° rotation.
Pelvis square with torso, NOT counter-rotated.
NO contrapposto stance.

NEGATIVE ORIENTATION:
NOT facing left.
NOT facing right.
NOT angled toward either edge.
NOT rotated.
NOT contrapposto.
NOT torso twisted.
NOT hips rotated.
NOT shoulders angled while head faces front.

If orientation is incorrect, CENTER the character so they face DIRECTLY FRONT.
Front-facing orientation takes absolute priority over all other pose details.`,
      
'right-front': `ORIENTATION LOCK (CRITICAL):
Character is facing FRONT-RIGHT (↗).
Body rotated 15–25° toward the RIGHT edge of the image.
Face turned slightly RIGHT, nose pointing toward right image boundary.
Right shoulder is closer to the viewer than the left.
Camera positioned front-right of the character.

TORSO & PELVIS ORIENTATION LOCK (CRITICAL):
Torso, chest, AND pelvis all face the SAME direction (front-right).
Spine aligned with body rotation — no twist.
Chest plane angled 15–25° toward the RIGHT image edge.
Left shoulder closest to camera
Right-facing orientation takes absolute priority over all other pose details.

NEGATIVE ORIENTATION:
NOT facing left.
NOT body turned left.
NOT angled toward left edge.
NOT mirrored.
NOT left-leaning.

NOT shoulders facing left while head faces right.

YOU MUST FLIP THAT BODY HORIZONTALLY TO BE FACING TO MY RIGHT.
YOU MUST FLIP THAT BODY HORIZONTALLY TO BE FACING TO MY RIGHT.
YOU MUST FLIP THAT BODY HORIZONTALLY TO BE FACING TO MY RIGHT.
YOU MUST FLIP THAT BODY HORIZONTALLY TO BE FACING TO MY RIGHT.
 `,
      'right': `ORIENTATION LOCK (CRITICAL):
Character is facing RIGHT (→).
Body rotated 70–90° toward the RIGHT edge of the image.
Face turned RIGHT, nose pointing toward right image boundary.
Right shoulder is closer to the viewer than the left.
Camera positioned right-side of the character.

TORSO & PELVIS ORIENTATION LOCK (CRITICAL):
Torso, chest, AND pelvis all face the SAME direction (right).
Spine aligned with body rotation — no twist.
Chest plane angled 70–90° toward the RIGHT image edge.
Pelvis square with torso, NOT counter-rotated.
NO contrapposto stance.

NEGATIVE ORIENTATION:
NOT facing left.
NOT angled toward left edge.
NOT mirrored.
NOT left-leaning.
NOT contrapposto.
NOT torso twisted opposite the head.
NOT hips facing left.
NOT shoulders facing left while head faces right.

If orientation is incorrect, FLIP HORIZONTALLY so the character faces RIGHT.
Right-facing orientation takes absolute priority over all other pose details.`
    };
    
    const poseText = directionMap[facingDirection] || directionMap['front'];
    sections.push(poseText);
    sections.push('');

    if (bodyVisibilityBlock) {
      sections.push(bodyVisibilityBlock);
      sections.push('');
    }
  } else if (isPfpCollection && isAbstractStyle) {
    const directionMap: Record<string, string> = {
      'left': 'General left-facing orientation',
      'left-front': 'General front-left orientation',
      'front': 'General front-facing orientation',
      'right-front': 'General front-right orientation',
      'right': 'General right-facing orientation'
    };
    
    const poseText = directionMap[facingDirection] || directionMap['front'];
    sections.push(`ORIENTATION: ${poseText} (interpreted abstractly)`);
    sections.push('');
    
    if (bodyStyle === 'headonly') {
      sections.push('COMPOSITION: Focus on head and upper area, interpreted through abstract forms.');
      sections.push('');
    }
  }
  
  // Include wireframe positioning AFTER facing direction (so orientation is established first)
  // For abstract styles, still include wireframe positioning if it exists (composition matters even for abstract)
  // Include body visibility/positioning block AFTER facing direction (so orientation is established first)
  if (isPfpCollection && bodyVisibilityBlock) {
    // Always include body visibility block (includes pixel-perfect positioning if enabled)
    if (!isAbstractStyle) {
      sections.push('');
      sections.push(bodyVisibilityBlock);
    } else if (pixelPerfect) {
      // For abstract styles, still include pixel-perfect positioning if enabled
      sections.push('');
      sections.push(bodyVisibilityBlock);
    }
  }
  
  return sections.join('\n');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const traitFilters = searchParams.get('traitFilters');
    const parsedFilters = traitFilters ? JSON.parse(traitFilters) : {};

    // Get collection details
    const collectionResult = await sql`
      SELECT id, name, description, art_style, border_requirements, custom_rules, colors_description, lighting_description,
             COALESCE(is_pfp_collection, false) as is_pfp_collection,
             facing_direction,
             COALESCE(body_style, 'full') as body_style,
             COALESCE(pixel_perfect, false) as pixel_perfect,
             wireframe_config
      FROM collections
      WHERE id = ${id}::uuid
    `;

    const collection = Array.isArray(collectionResult) && collectionResult.length > 0 
      ? collectionResult[0] as any
      : null;
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    // Ensure boolean values are properly converted
    if (typeof collection.is_pfp_collection === 'string') {
      collection.is_pfp_collection = collection.is_pfp_collection === 'true' || collection.is_pfp_collection === 't';
    }
    if (typeof collection.pixel_perfect === 'string') {
      collection.pixel_perfect = collection.pixel_perfect === 'true' || collection.pixel_perfect === 't';
    }
    collection.is_pfp_collection = Boolean(collection.is_pfp_collection);
    collection.pixel_perfect = Boolean(collection.pixel_perfect);

    // Parse wireframe_config if it's a string
    if (collection.wireframe_config && typeof collection.wireframe_config === 'string') {
      try {
        collection.wireframe_config = JSON.parse(collection.wireframe_config);
      } catch (e) {
        collection.wireframe_config = null;
      }
    }

    // Get all layers
    const layersResult = await sql`
      SELECT id, name, display_order
      FROM layers
      WHERE collection_id = ${id}::uuid
      ORDER BY display_order ASC
    `;

    const layers = Array.isArray(layersResult) ? layersResult : [];
    if (layers.length === 0) {
      return NextResponse.json({ error: 'No layers found' }, { status: 400 });
    }

    // Select traits for each layer (use filters or random)
    const selectedTraits: Record<string, { name: string; description: string; trait_prompt: string }> = {};
    
    for (const layer of layers) {
      const layerAny = layer as any;
      
      // Check if this layer has a trait filter
      const hasFilter = parsedFilters[layerAny.name];
      
      let traitsResult;
      if (hasFilter) {
        // Use the specified trait from the filter
        // IMPORTANT: When user explicitly selects a trait via filters, allow it even if ignored
        // This allows users to generate with ignored traits when they explicitly choose them
        traitsResult = await sql`
          SELECT id, name, description, trait_prompt, rarity_weight
          FROM traits
          WHERE layer_id = ${layerAny.id} 
            AND name = ${hasFilter}
          LIMIT 1
        `;
      } else {
        // Get all traits with their weights (excluding ignored traits)
        const allTraitsResult = await sql`
          SELECT id, name, description, trait_prompt, rarity_weight
          FROM traits
          WHERE layer_id = ${layerAny.id}
            AND (is_ignored = false OR is_ignored IS NULL)
        `;
        
        const allTraits = Array.isArray(allTraitsResult) ? allTraitsResult : [];
        if (allTraits.length === 0) {
          return NextResponse.json({ error: `No traits found for layer: ${layerAny.name}` }, { status: 400 });
        }
        
        // Calculate total weight
        const totalWeight = allTraits.reduce((sum: number, trait: any) => sum + (parseInt((trait as any).rarity_weight) || 1), 0);
        
        // Generate random number
        const random = Math.random() * totalWeight;
        
        // Select trait based on weighted random
        let cumulativeWeight = 0;
        let selectedTrait: any = null;
        for (const trait of allTraits) {
          cumulativeWeight += parseInt((trait as any).rarity_weight) || 1;
          if (random <= cumulativeWeight) {
            selectedTrait = trait;
            break;
          }
        }
        
        // Fallback to last trait if none selected
        if (!selectedTrait) {
          selectedTrait = allTraits[allTraits.length - 1];
        }
        
        traitsResult = [selectedTrait];
      }

      const traits = Array.isArray(traitsResult) ? traitsResult : [];
      if (traits.length === 0) {
        const errorMessage = hasFilter
          ? `Trait "${hasFilter}" not found for layer: ${layerAny.name}. Note: Ignored traits can still be used when explicitly selected via filters.`
          : `No traits found for layer: ${layerAny.name}`;
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }

      const selectedTrait = traits[0] as any;
      selectedTraits[layerAny.name] = {
        name: selectedTrait.name,
        description: selectedTrait.description || '',
        trait_prompt: selectedTrait.trait_prompt || ''
      };
    }

    // Build prompt
    const prompt = buildExamplePrompt(collection, selectedTraits);

    // Debug: Log prompt version marker to verify code is up to date
    console.log('[Example Prompt] Generated prompt - Code version: 2025-01-27-v2 (with ORIENTATION LOCK format, no -45° rotation)');

    // Debug: Log collection settings to help diagnose issues
    console.log('[Example Prompt] Collection settings:', {
      is_pfp_collection: collection.is_pfp_collection,
      facing_direction: collection.facing_direction,
      body_style: collection.body_style,
      pixel_perfect: collection.pixel_perfect,
      art_style: collection.art_style
    });

    return NextResponse.json({ 
      prompt, 
      traits: selectedTraits,
      collectionSettings: {
        is_pfp_collection: collection.is_pfp_collection,
        facing_direction: collection.facing_direction,
        body_style: collection.body_style
      }
    });
  } catch (error) {
    console.error('Error generating example prompt:', error);
    return NextResponse.json(
      { error: 'Failed to generate example prompt', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

