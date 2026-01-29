import { NextRequest, NextResponse } from 'next/server';

// POST /api/ai/generate-prompt-suggestions - Generate AI suggestions for prompt fields
export async function POST(request: NextRequest) {
  try {
    const { 
      field, 
      collectionName, 
      description,
      artStyle,
      isPfp,
      facingDirection,
      colors,
      border,
      lighting,
      rules
    } = await request.json();

    if (!field) {
      return NextResponse.json({ error: 'Field type is required' }, { status: 400 });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Build rich context from all form fields
    const contextParts: string[] = [];
    if (collectionName) contextParts.push(`Collection name: "${collectionName}"`);
    if (description) contextParts.push(`Description: "${description}"`);
    if (artStyle) contextParts.push(`Art style: ${artStyle}`);
    if (isPfp) contextParts.push(`PFP collection with character facing ${facingDirection || 'front'}`);
    if (colors) contextParts.push(`Color palette: ${colors}`);
    if (border) contextParts.push(`Border style: ${border}`);
    if (lighting) contextParts.push(`Lighting: ${lighting}`);
    if (rules) contextParts.push(`Custom rules: ${rules}`);
    
    const contextBlock = contextParts.length > 0 
      ? `\n\nCONTEXT FOR THIS COLLECTION:\n${contextParts.join('\n')}\n\nGenerate suggestions that complement and match this context.`
      : '';
    
    const fieldPrompts: Record<string, string> = {
      border: `Generate 10 different creative border/frame style descriptions for NFT artwork.${contextBlock}
        Examples range from ornate golden frames to minimalist lines to no borders.
        Each should be a short, descriptive phrase (5-15 words).
        Make sure the borders match the overall aesthetic of the collection.
        Return ONLY a JSON array of 10 strings, no explanation.
        Example format: ["thick ornate golden baroque frame", "thin black line border", "no border, edge fades to transparent", ...]`,
      
      colors: `Generate 10 different creative color/visual style descriptions for NFT artwork.${contextBlock}
        DO NOT use specific color names like "purple", "blue", "red", "yellow".
        Instead describe the COLOR FEEL using terms like: contrast, saturation, brightness, warmth, coolness, gradients, shadows, highlights, muted, vibrant, desaturated, glowing, atmospheric, etc.
        Each should describe the overall color mood and feel, not specific hues.
        Return ONLY a JSON array of 10 strings, no explanation.
        Example format: ["high contrast with deep shadows and bright highlights", "desaturated muted tones with warm undertones", "neon glows against dark moody backgrounds", "soft diffused pastels with low saturation", "rich saturated warmth with golden accents", "cold desaturated palette with hints of warmth", "high saturation pop art vibes with bold contrast", ...]`,
      
      lighting: `Generate 10 different creative lighting style descriptions for NFT artwork.${contextBlock}
        DO NOT use specific color names like "golden", "blue", "warm orange", "cool blue", etc.
        Instead describe the LIGHTING QUALITY using terms like: dramatic, soft, harsh, diffused, rim lighting, backlighting, side lighting, ambient, cinematic, spotlight, volumetric, silhouette, high-key, low-key, chiaroscuro, etc.
        Focus on direction, intensity, contrast, and mood - NOT colors.
        Each should be a short, descriptive phrase (5-15 words).
        Make sure the lighting matches the overall aesthetic of the collection.
        Return ONLY a JSON array of 10 strings, no explanation.
        Example format: ["dramatic rim lighting with deep shadows", "soft diffused ambient glow", "harsh directional spotlight from above", "moody low-key with strong contrast", "ethereal backlighting with silhouette edges", ...]`,
      
      rules: `Generate 10 different creative custom rules/instructions for AI image generation.${contextBlock}
        These are additional instructions to guide the AI (e.g., "always include sparkles", "no text", "include reflections").
        Each should be a clear, actionable instruction (5-20 words).
        Make sure the rules complement the overall aesthetic of the collection.
        Return ONLY a JSON array of 10 strings, no explanation.
        Example format: ["always include subtle particle effects", "add lens flare on light sources", ...]`
    };

    const prompt = fieldPrompts[field];
    if (!prompt) {
      return NextResponse.json({ error: 'Invalid field type' }, { status: 400 });
    }

    // Use a text-capable chat model for prompt suggestion generation.
    // If OPENAI_MODEL is set to an image model (gpt-image-*), fall back to a chat model.
    const configuredModel = process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const model = configuredModel.startsWith('gpt-image') ? 'gpt-4o-mini' : configuredModel

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
            content: 'You are a creative assistant that generates style descriptions for NFT artwork. Always return valid JSON arrays only, no markdown or explanation.'
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
    let suggestions: string[];
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

    // Randomly select one suggestion
    const randomIndex = Math.floor(Math.random() * suggestions.length);
    const selected = suggestions[randomIndex];

    return NextResponse.json({ 
      selected,
      all: suggestions // Include all for potential future use (dropdown selection)
    });

  } catch (error) {
    console.error('Error generating suggestions:', error);
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
  }
}

