import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { fieldType, collectionName, collectionDescription } = await request.json();

    if (!fieldType) {
      return NextResponse.json({ error: 'Field type is required' }, { status: 400 });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Build context-aware prompts for each field type
    const fieldPrompts: Record<string, string> = {
      art_style: `Generate 5 unique art style descriptions for a collection${collectionName ? ` named "${collectionName}"` : ''}${collectionDescription ? `: ${collectionDescription}` : ''}. Each description should be 1-2 sentences describing a distinct art style (e.g., "professional digital illustration, cute cartoonish style" or "pixel art with retro 8-bit aesthetic"). Return ONLY a JSON array of 5 strings, no other text.`,
      border_requirements: `Generate 5 unique border requirement descriptions for a collection${collectionName ? ` named "${collectionName}"` : ''}${collectionDescription ? `: ${collectionDescription}` : ''}. Each description should be 1-2 sentences describing border style (e.g., "thin decorative frame with intricate corner ornaments" or "no borders, full bleed image"). Return ONLY a JSON array of 5 strings, no other text.`,
      custom_rules: `Generate 5 unique custom rules for AI image generation for a collection${collectionName ? ` named "${collectionName}"` : ''}${collectionDescription ? `: ${collectionDescription}` : ''}. Each rule should be 1-2 sentences describing specific generation requirements (e.g., "always include shadows" or "use warm colors only"). Return ONLY a JSON array of 5 strings, no other text.`,
      colors_description: `Generate 5 unique color description prompts for a collection${collectionName ? ` named "${collectionName}"` : ''}${collectionDescription ? `: ${collectionDescription}` : ''}. Each description should be 1-2 sentences describing color palette and style (e.g., "Deep saturated colors, metallic accents, bright glows, rich colored shadows, smooth gradients, high contrast" or "Muted pastel tones with soft gradients and subtle highlights"). Return ONLY a JSON array of 5 strings, no other text.`,
      lighting_description: `Generate 5 unique lighting description prompts for a collection${collectionName ? ` named "${collectionName}"` : ''}${collectionDescription ? `: ${collectionDescription}` : ''}. Each description should be 1-2 sentences describing lighting setup (e.g., "Multiple sources, dramatic setup, warm key light, cool fill light, rim lighting, atmospheric effects" or "Soft diffused lighting with gentle shadows and ambient glow"). Return ONLY a JSON array of 5 strings, no other text.`
    };

    const prompt = fieldPrompts[fieldType];
    if (!prompt) {
      return NextResponse.json({ error: 'Invalid field type' }, { status: 400 });
    }

    // Use a text-capable model for option generation.
    const configuredModel = process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const textModel = configuredModel.startsWith('gpt-image') ? 'gpt-4o-mini' : configuredModel;

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
            content: 'You are a helpful assistant that generates creative descriptions for AI image generation prompts. Always return valid JSON arrays only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.9,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return NextResponse.json({ error: 'Failed to generate options' }, { status: 500 });
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json({ error: 'No content generated' }, { status: 500 });
    }

    // Parse JSON array from response
    let options: string[] = [];
    try {
      // Try to extract JSON array from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        options = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: try parsing the whole content
        options = JSON.parse(content);
      }
    } catch (parseError) {
      // If JSON parsing fails, try to extract quoted strings
      const quotedStrings = content.match(/"([^"]+)"/g);
      if (quotedStrings) {
        options = quotedStrings.map((s: string) => s.replace(/^"|"$/g, ''));
      } else {
        // Last resort: split by newlines and clean
        options = content.split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line && !line.startsWith('[') && !line.startsWith(']'))
          .map((line: string) => line.replace(/^[-*•]\s*/, '').replace(/^["']|["']$/g, ''))
          .filter((line: string) => line.length > 0)
          .slice(0, 5);
      }
    }

    if (!Array.isArray(options) || options.length === 0) {
      return NextResponse.json({ error: 'Invalid response format' }, { status: 500 });
    }

    // Ensure we have exactly 5 options (pad or trim if needed)
    while (options.length < 5) {
      options.push(options[options.length - 1] || 'No description available');
    }
    options = options.slice(0, 5);

    // Randomly select one
    const selected = options[Math.floor(Math.random() * options.length)];

    return NextResponse.json({
      options,
      selected
    });

  } catch (error: any) {
    console.error('Error generating auto options:', error);
    return NextResponse.json({ 
      error: 'Failed to generate options',
      details: error?.message 
    }, { status: 500 });
  }
}

