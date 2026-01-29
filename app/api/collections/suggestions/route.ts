import { NextRequest, NextResponse } from 'next/server';

// POST /api/collections/suggestions - Generate collection name and description suggestions
export async function POST(request: NextRequest) {
  try {
    const { keyword, isPfp } = await request.json();

    if (!keyword || typeof keyword !== 'string' || keyword.trim() === '') {
      return NextResponse.json({ error: 'Keyword is required' }, { status: 400 });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const configuredModel = process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const model = configuredModel.startsWith('gpt-image') ? 'gpt-4o-mini' : configuredModel;

    const collectionType = isPfp 
      ? 'Profile Picture (PFP) collection with character traits, layers, and variations'
      : 'NFT collection with various traits and layers';

    const prompt = `Generate exactly 10 unique NFT collection ideas based on the keyword "${keyword.trim()}".

Each collection should have:
1. A creative and memorable collection name (2-4 words)
2. A brief description (1-2 sentences) explaining the collection's theme, style, and appeal

Collection type: ${collectionType}

Return ONLY a JSON array of objects, each with "name" and "description" fields. Example format:
[
  {"name": "Cyberpunk Warriors", "description": "A futuristic PFP collection featuring neon-lit warriors with cybernetic enhancements, set in a dystopian cyberpunk world."},
  {"name": "Mystic Guardians", "description": "Magical guardians with elemental powers, each possessing unique mystical abilities and ancient artifacts."}
]

Make sure:
- Names are unique and creative
- Descriptions are engaging and explain the collection's appeal
- All suggestions relate to the keyword "${keyword.trim()}"
- Collections are appropriate for ${isPfp ? 'PFP' : 'NFT'} collections`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a creative assistant that generates NFT collection ideas. Always return valid JSON arrays only, no markdown or explanation.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.9,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error:', error);
      return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: 'No content from AI' }, { status: 500 });
    }

    // Parse JSON response
    let suggestions: Array<{ name: string; description: string }>;
    try {
      // Try to extract JSON array from response (handle markdown code blocks)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        suggestions = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return NextResponse.json({ error: 'Invalid suggestions format' }, { status: 500 });
    }

    // Ensure we have exactly 10 suggestions (or at least what we got)
    const finalSuggestions = suggestions.slice(0, 10).map(s => ({
      name: s.name || '',
      description: s.description || ''
    }));

    return NextResponse.json({ suggestions: finalSuggestions });
  } catch (error: any) {
    console.error('Error generating collection suggestions:', error);
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
  }
}

