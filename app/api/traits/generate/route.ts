import { NextRequest, NextResponse } from 'next/server';

import { hasEnoughCredits, deductCredits } from '@/lib/credits/credits';
import { calculateCreditsNeeded } from '@/lib/credits/credit-costs';
import { sql } from '@/lib/database';

// POST /api/traits/generate - Generate multiple AI traits with descriptions
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { layer_id, theme, quantity = 1, use_item_word = true, rarity_weight = 40, wallet_address } = body;

    if (!layer_id || !theme) {
      return NextResponse.json({ error: 'Layer ID and theme are required' }, { status: 400 });
    }

    if (!wallet_address || wallet_address.trim() === '') {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    if (quantity < 1 || quantity > 10) {
      return NextResponse.json({ error: 'Quantity must be between 1 and 10' }, { status: 400 });
    }

    // Calculate credits needed from database
    const creditsNeeded = await calculateCreditsNeeded('trait_generation', quantity);

    // Check if user has enough credits
    const hasCredits = await hasEnoughCredits(wallet_address, creditsNeeded);
    if (!hasCredits) {
      return NextResponse.json(
        { error: `Insufficient credits. You need ${creditsNeeded} credit${creditsNeeded > 1 ? 's' : ''} to generate ${quantity} trait${quantity > 1 ? 's' : ''}. Please purchase credits.` },
        { status: 402 } // 402 Payment Required
      );
    }

    // Deduct credits IMMEDIATELY before generation starts
    const creditsDeducted = await deductCredits(
      wallet_address,
      creditsNeeded,
      `Generating ${quantity} trait${quantity > 1 ? 's' : ''} for layer ${layer_id}`
    );

    if (!creditsDeducted) {
      return NextResponse.json(
        { error: 'Failed to deduct credits. Please try again.' },
        { status: 500 }
      );
    }

    // Get layer and collection information for context
    const [layerInfo] = await sql`
      SELECT
        l.name as layer_name,
        c.name as collection_name,
        c.description as collection_description,
        c.pixel_perfect
      FROM layers l
      JOIN collections c ON l.collection_id = c.id
      WHERE l.id = ${layer_id}
    ` as any[];

    if (!layerInfo) {
      return NextResponse.json({ error: 'Layer not found' }, { status: 404 });
    }

    // Check if this is a character body layer and pixel-perfect is enabled
    const isCharacterBodyLayer = ['character', 'skin', 'body'].some(keyword =>
      layerInfo.layer_name.toLowerCase().includes(keyword)
    );
    const usePixelPerfect = layerInfo.pixel_perfect === true && isCharacterBodyLayer;

    // Get existing trait names to avoid duplicates
    const existingTraits = await sql`
      SELECT name FROM traits WHERE layer_id = ${layer_id}
    `;
    const existingNames = Array.isArray(existingTraits) 
      ? existingTraits.map(t => t.name).join(', ') 
      : '';

    // Generate AI traits using OpenAI
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const layerType = use_item_word ? `${layerInfo.layer_name} item` : layerInfo.layer_name;
    const existingTraitsSection = existingNames
      ? `\n\nEXISTING TRAITS TO AVOID (do NOT create similar traits or use these names):\n${existingNames}\n\nMake sure your new traits are COMPLETELY DIFFERENT from the existing ones above.`
      : '';

    // Determine if this is a character skin layer
    const isCharacterSkinLayer = layerInfo.layer_name.toLowerCase() === 'character skin' ||
      (layerInfo.layer_name.toLowerCase().includes('character') && layerInfo.layer_name.toLowerCase().includes('skin'));

    // Determine if this is a body part layer that holds items
    const bodyPartLayers = ['right hand', 'left hand', 'hand', 'hands', 'right arm', 'left arm'];
    const isBodyPartLayer = bodyPartLayers.some(part => layerInfo.layer_name.toLowerCase().includes(part));
    
    // If it's a hand layer, modify the theme to include "held in [hand name]"
    let modifiedTheme = theme;
    if (isBodyPartLayer) {
      // Check if theme already contains "held" or "holding" to avoid duplication
      if (!theme.toLowerCase().includes('held') && !theme.toLowerCase().includes('holding')) {
        modifiedTheme = `${theme} held in ${layerInfo.layer_name}`;
      }
    }
    
    // Create a combined layer+theme context phrase for better AI understanding
    // This helps the AI understand "materials leather" as "leather materials" (types of leather)
    // or "background forest" as "forest backgrounds" (types of forest scenes)
    const layerThemeContext = `${theme} ${layerInfo.layer_name}`;
    
    const contextualPrompt = isCharacterSkinLayer
      ? `You are generating the ENTIRE BODY covering (skin, fur, scales, texture, etc.) for the character.

CRITICAL FOR CHARACTER SKIN:
- This represents the FULL BODY covering from head to toe
- DO NOT describe individual body parts like eyes, nose, ears, paws, socks, snout, whiskers, etc.
- DO describe the overall body texture, fur pattern, skin type, or covering

GOOD EXAMPLES for "Character Skin":
- "Scruffy Brown Fur" - covers entire body
- "Wet Matted Fur" - full body texture
- "Patchy Grey and White Fur" - overall pattern covering the character
- "Mangy Spotted Fur" - full body condition
- "Sleek Black Fur" - entire body covering
- "Muddy Tan Fur with Dirt Patches" - full body appearance

BAD EXAMPLES (these are individual body parts, NOT full body skin):
- "Cloudy Blue Eyes" (this is eyes, not skin)
- "Dirty White Socks" (this is paws/feet, not full body)
- "Faded Black Snout" (this is nose, not skin)
- "Ragged Ears" (this is ears, not full body covering)
- "Muddy Whiskers" (this is whiskers, not skin)

Each trait should describe what the ENTIRE character's body is covered with.`
      : isBodyPartLayer
      ? `You are generating items that would be HELD IN the ${layerInfo.layer_name}, like weapons, tools, or objects. The character will be GRIPPING or HOLDING these items in their hand.

DO NOT describe:
- The hand itself
- Gloves, gauntlets, or anything worn ON the hand
- The hand holding something

INSTEAD, describe ONLY the object being held:
- Weapons (swords, staffs, daggers, scythes)
- Tools (lanterns, keys, bells)
- Magical items (wands, orbs, spellbooks)
- Objects (skulls, chains, bottles, candles)

GOOD EXAMPLES for a "right hand" layer:
- "A gnarled wooden staff topped with a glowing purple crystal, weathered bark texture with moss growing near the base"
- "A rusty iron lantern with a flickering green flame inside, dented metal frame with cobwebs hanging from the handle"
- "A silver dagger with runes etched along the blade, wrapped leather grip with a ruby pommel"
- "A small ornate birdcage containing a glowing ghostly wisp, tarnished brass bars with gothic patterns"

BAD EXAMPLES (these describe hands/gloves, NOT held objects):
- "A silver gauntlet adorned with glowing blue runes" (this is a glove/armor, not a held item)
- "A twisted obsidian hand encasing a glowing crystal ball" (describes the hand, not an item)
- "A skeletal hand with elongated fingers" (describes the hand itself)
- "A clawed hand dripping with blood" (describes the hand itself)`
      : `You are generating visual descriptions of ${layerThemeContext} - meaning you should create variations and types of "${theme}" that belong to the "${layerInfo.layer_name}" category.

CRITICAL CONTEXT UNDERSTANDING:
- The layer name "${layerInfo.layer_name}" defines the CATEGORY or TYPE of items you're creating
- The theme word "${theme}" defines the SPECIFIC MATERIAL, STYLE, or SUBJECT within that category
- Combine them intelligently: "${layerThemeContext}" means you're creating different variations/types of ${theme} that fit the ${layerInfo.layer_name} category

EXAMPLES:
- Layer: "materials" + Theme: "leather" = Generate different TYPES of leather materials (smooth leather, rough leather, embossed leather, etc.)
- Layer: "background" + Theme: "forest" = Generate different TYPES of forest backgrounds (dense forest, misty forest, autumn forest, etc.)
- Layer: "accessory" + Theme: "hat" = Generate different TYPES of hat accessories (baseball cap, top hat, beanie, etc.)
- Layer: "clothing" + Theme: "jacket" = Generate different TYPES of jackets (leather jacket, denim jacket, bomber jacket, etc.)

Each trait should be a specific variation or type of "${theme}" that belongs to the "${layerInfo.layer_name}" category.`;
    
    const prompt = `Generate ${quantity} unique visual trait descriptions for "${layerThemeContext}" in a "${layerInfo.collection_name}" collection.

Collection: ${layerInfo.collection_name}
Layer Category: ${layerType}
Theme/Subject: ${theme}
Combined Context: ${layerThemeContext}
Quantity: ${quantity}${existingTraitsSection}

${contextualPrompt}

IMPORTANT: Each description must be a PRECISE, DETERMINISTIC VISUAL BREAKDOWN that will generate the EXACT SAME image every time. Be extremely specific about:
- EXACT colors (e.g., "deep crimson red", "pale mint green", "golden yellow #FFD700")
- EXACT counts (e.g., "three small stars", "two vertical stripes", "five evenly-spaced dots")
- EXACT positions (e.g., "centered horizontally", "tilted 15 degrees left", "positioned in upper-right corner")
- EXACT sizes and proportions (e.g., "small 20% width", "large covering 60% of area")
- EXACT textures and materials (e.g., "smooth matte finish", "rough weathered wood grain")
- EXACT patterns (e.g., "diagonal stripes running top-left to bottom-right", "checkerboard pattern with 8x8 squares")
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

DO NOT use vague, poetic, or metaphorical language. Be LITERAL and PRECISELY REPEATABLE.

GOOD EXAMPLE: "A deep crimson baseball cap with white stitching, flat bill facing forward, single gold star emblem centered on front panel, slightly worn fabric texture with three small scratches on the left side"
BAD EXAMPLE: "A stylish cap with cool decorations and a sporty vibe"

The goal is that the EXACT SAME description will generate the EXACT SAME visual result every time - same colors, same positions, same details.

Please provide ${quantity} unique traits. For each trait:
1. A creative trait name (2-4 words)
2. A PRECISE VISUAL description with specific counts, positions, colors, and details

Format your response as:
TRAIT_1:
NAME: [trait name]
DESCRIPTION: [detailed visual description]

TRAIT_2:
NAME: [trait name]
DESCRIPTION: [detailed visual description]

...and so on for all ${quantity} traits.`;

    // Calculate max_tokens: base of 500 per trait, but ensure minimum of 2000 and cap at 4000
    // This prevents issues with very small quantities and very large ones
    const calculatedMaxTokens = 500 * quantity;
    const maxTokens = Math.max(2000, Math.min(calculatedMaxTokens, 4000));
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: 'You are a visual design assistant that creates detailed, concrete descriptions of visual elements for digital art. Focus on specific visual details like colors, shapes, textures, materials, and physical characteristics. Avoid metaphors, symbolism, or vague poetic language. Be literal and descriptive about what the item actually looks like.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.9,
      }),
    });

    if (!response.ok) {
      let error: any
      const contentType = response.headers.get("content-type")
      
      try {
        if (contentType?.includes("application/json")) {
          error = await response.json()
        } else {
          const textError = await response.text()
          error = { message: textError }
        }
      } catch (parseError) {
        try {
          const textError = await response.text()
          error = { message: textError }
        } catch {
          error = { message: "Unknown error from OpenAI API" }
        }
      }
      
      // Check if error is related to API key credits/quota
      const errorMessage = typeof error === 'object' && error !== null && 'message' in error 
        ? String((error as any).message) 
        : String(error)
      const errorCode = typeof error === 'object' && error !== null && 'code' in error 
        ? String((error as any).code) 
        : ''
      const errorType = typeof error === 'object' && error !== null && 'type' in error 
        ? String((error as any).type) 
        : ''
      
      const isQuotaError = 
        errorCode === 'insufficient_quota' ||
        errorType === 'insufficient_quota' ||
        errorMessage.toLowerCase().includes('insufficient_quota') ||
        errorMessage.toLowerCase().includes('quota') ||
        errorMessage.toLowerCase().includes('billing') ||
        errorMessage.toLowerCase().includes('insufficient funds') ||
        errorMessage.toLowerCase().includes('payment method') ||
        errorCode === 'billing_not_active' ||
        errorType === 'billing_not_active'
      
      // Return generic message for quota/billing errors
      if (isQuotaError) {
        return NextResponse.json({ error: "The system is temporarily down. Please try again later." }, { status: 503 })
      }
      
      throw new Error(`OpenAI API error: ${response.status} - ${errorMessage}`)
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content || '';

    // Parse the AI response to extract multiple traits
    // Try multiple regex patterns to handle different response formats
    let traitMatches = Array.from(aiResponse.matchAll(/NAME:\s*(.+?)\s*DESCRIPTION:\s*(.+?)(?=\n\n|TRAIT_|$)/gs));
    
    // If first pattern doesn't work, try alternative formats
    if (traitMatches.length === 0) {
      // Try pattern without TRAIT_ prefix
      traitMatches = Array.from(aiResponse.matchAll(/NAME:\s*(.+?)\s*DESCRIPTION:\s*(.+?)(?=\n\nNAME:|$)/gs));
    }
    
    // If still no matches, try numbered format
    if (traitMatches.length === 0) {
      traitMatches = Array.from(aiResponse.matchAll(/(?:TRAIT_\d+|^\d+\.)\s*NAME:\s*(.+?)\s*DESCRIPTION:\s*(.+?)(?=\n\n(?:TRAIT_|\d+\.)|$)/gms));
    }
    
    const parsedTraits = [];
    
    for (const match of traitMatches) {
      // Handle different match group positions based on pattern
      const name = (match[1] || match[2] || '').trim();
      const description = (match[2] || match[3] || '').trim();
      if (name && description && name.length > 0 && description.length > 10) {
        parsedTraits.push({ name, description });
      }
    }

    // If we still have no traits, try a more lenient parsing approach
    if (parsedTraits.length === 0) {
      // Split by lines and look for NAME: and DESCRIPTION: patterns
      const lines = aiResponse.split('\n');
      let currentTrait: { name?: string; description?: string } = {};
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('NAME:')) {
          currentTrait.name = line.replace(/^NAME:\s*/i, '').trim();
        } else if (line.startsWith('DESCRIPTION:')) {
          currentTrait.description = line.replace(/^DESCRIPTION:\s*/i, '').trim();
          // Continue reading description if it spans multiple lines
          let j = i + 1;
          while (j < lines.length && !lines[j].trim().match(/^(NAME:|TRAIT_|\d+\.)/i)) {
            currentTrait.description += ' ' + lines[j].trim();
            j++;
          }
          i = j - 1;
          
          if (currentTrait.name && currentTrait.description && currentTrait.description.length > 10) {
            parsedTraits.push({ 
              name: currentTrait.name, 
              description: currentTrait.description 
            });
            currentTrait = {};
          }
        }
      }
    }

    if (parsedTraits.length === 0) {
      console.error('Failed to parse AI response. Response was:', aiResponse);
      return NextResponse.json({ 
        error: 'Failed to parse AI response. The AI may have returned an unexpected format. Please try again with a smaller quantity or different theme.' 
      }, { status: 500 });
    }
    
    // If we got fewer traits than requested, log a warning but continue
    if (parsedTraits.length < quantity) {
      console.warn(`Requested ${quantity} traits but only parsed ${parsedTraits.length} traits from AI response`);
    }

    // Create all traits in the database
    const createdTraits = [];
    for (const parsedTrait of parsedTraits) {
      const [trait] = await sql`
        INSERT INTO traits (layer_id, name, description, rarity_weight)
        VALUES (${layer_id}, ${parsedTrait.name}, ${parsedTrait.description}, ${rarity_weight})
        RETURNING id, name, description, rarity_weight, created_at, updated_at
      `;
      createdTraits.push(trait);
    }

    return NextResponse.json({ 
      traits: createdTraits,
      count: createdTraits.length,
      ai_response: aiResponse 
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error generating traits:', error);
    
    // Check if error is related to API key credits/quota
    const errorMessage = error?.message || String(error)
    const isQuotaError = 
      errorMessage?.toLowerCase().includes('insufficient_quota') ||
      errorMessage?.toLowerCase().includes('quota') ||
      errorMessage?.toLowerCase().includes('billing') ||
      errorMessage?.toLowerCase().includes('insufficient funds') ||
      errorMessage?.toLowerCase().includes('payment method')
    
    if (isQuotaError) {
      return NextResponse.json({ error: "The system is temporarily down. Please try again later." }, { status: 503 })
    }
    
    return NextResponse.json({ error: 'Failed to generate traits' }, { status: 500 });
  }
}
