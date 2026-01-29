#!/usr/bin/env node
/**
 * Generate Art Style Preview Images
 * 
 * This script generates preview images for different art styles using OpenAI's gpt-image-1 model.
 * The images are saved locally and used in the collection creation form to show users what each style looks like.
 * 
 * Usage: node scripts/generate-art-style-previews.js
 * 
 * Requires: OPENAI_API_KEY in .env.local
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: '.env.local' });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in .env.local');
  process.exit(1);
}

// Art styles with their prompts for preview generation
const ART_STYLES = [
  {
    id: 'chibi',
    name: 'Chibi / Cute',
    description: 'Big head, small body, adorable expressions',
    prompt: 'Chibi style character with big head, tiny body, huge expressive eyes, cute adorable proportions, kawaii aesthetic, clean vector art, vibrant colors, simple background, professional digital illustration'
  },
  {
    id: 'anime',
    name: 'Anime / Manga',
    description: 'Japanese animation style with expressive features',
    prompt: 'Anime style character portrait, Japanese animation aesthetic, detailed eyes with highlights, stylized hair, cel-shaded coloring, clean linework, vibrant colors, professional manga illustration'
  },
  {
    id: 'realistic',
    name: 'Realistic / Photorealistic',
    description: 'Lifelike proportions and detailed textures',
    prompt: 'Photorealistic character portrait, detailed skin textures, realistic lighting, professional photography style, high detail, lifelike proportions, studio lighting, 8k quality'
  },
  {
    id: 'pixel',
    name: 'Pixel Art',
    description: 'Retro game-inspired blocky pixels',
    prompt: 'Pixel art character sprite, 32-bit retro game style, blocky pixels, limited color palette, nostalgic video game aesthetic, clean pixel edges, vibrant colors'
  },
  {
    id: 'cartoon',
    name: 'Western Cartoon',
    description: 'Bold outlines, exaggerated features',
    prompt: 'Western cartoon style character, bold black outlines, exaggerated proportions, flat colors, Cartoon Network aesthetic, playful expression, clean vector art'
  },
  {
    id: 'watercolor',
    name: 'Watercolor / Painterly',
    description: 'Soft edges, flowing colors, artistic texture',
    prompt: 'Watercolor painting style character portrait, soft flowing colors, visible brush strokes, artistic texture, dreamy aesthetic, muted color palette, fine art quality'
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk / Neon',
    description: 'Futuristic, neon lights, tech aesthetic',
    prompt: 'Cyberpunk style character, neon lights, futuristic tech aesthetic, glowing accents, dark background with neon highlights, sci-fi vibes, high contrast, digital art'
  },
  {
    id: 'fantasy',
    name: 'Fantasy / Epic',
    description: 'Magical, detailed, dramatic lighting',
    prompt: 'Epic fantasy style character portrait, magical glow effects, dramatic lighting, detailed armor or robes, mystical atmosphere, rich colors, professional fantasy illustration'
  },
  {
    id: 'minimalist',
    name: 'Minimalist / Flat',
    description: 'Simple shapes, limited colors, clean design',
    prompt: 'Minimalist flat design character, simple geometric shapes, limited color palette, clean lines, modern aesthetic, no gradients, professional graphic design'
  },
  {
    id: 'graffiti',
    name: 'Street Art / Graffiti',
    description: 'Urban, bold colors, spray paint texture',
    prompt: 'Street art graffiti style character, bold spray paint colors, urban aesthetic, dripping paint effects, hip-hop culture vibes, vibrant neon colors, textured background'
  },
  {
    id: '3d-cartoon',
    name: '3D Cartoon',
    description: 'Pixar/Disney style 3D rendered characters',
    prompt: '3D cartoon style character, Pixar Disney animation aesthetic, smooth rendered 3D surfaces, stylized proportions, soft ambient lighting, vibrant saturated colors, professional 3D animation render quality, Octane render'
  },
  {
    id: 'low-poly',
    name: 'Low Poly / Geometric',
    description: 'Angular geometric shapes, faceted surfaces, modern 3D',
    prompt: 'Low poly geometric style character, angular faceted surfaces, geometric shapes, modern 3D aesthetic, clean edges, minimalist polygons, vibrant flat colors, isometric view, professional 3D render'
  },
  {
    id: 'abstract',
    name: 'Abstract / Surreal',
    description: 'Non-representational, dreamlike, artistic expression',
    prompt: 'Abstract surreal style character portrait, non-representational art, dreamlike aesthetic, flowing forms, artistic expression, vibrant colors, imaginative composition, contemporary art style, unique visual language'
  },
  {
    id: 'vintage',
    name: 'Vintage / Retro',
    description: 'Nostalgic, aged aesthetic, classic design',
    prompt: 'Vintage retro style character portrait, nostalgic aesthetic, aged textures, classic design elements, muted color palette, retro-futuristic vibes, timeless appeal, 1950s-1980s aesthetic, film grain effect'
  },
  {
    id: 'hand-drawn',
    name: 'Hand-drawn / Sketch',
    description: 'Organic lines, sketchy, artistic hand-drawn feel',
    prompt: 'Hand-drawn sketch style character portrait, organic lines, artistic pencil work, sketchy aesthetic, natural imperfections, expressive strokes, artistic illustration, traditional art style, detailed linework'
  },
  {
    id: 'glitch',
    name: 'Glitch / Digital Art',
    description: 'Digital artifacts, data corruption aesthetic, cyber',
    prompt: 'Glitch art style character portrait, digital corruption effects, data artifacts, cyber aesthetic, RGB color separation, pixelated distortions, digital noise, futuristic glitch vibes, datamosh aesthetic, VHS distortion'
  }
];

// Output directory for generated images
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'art-styles');

async function generateImage(style) {
  console.log(`\n🎨 Generating preview for: ${style.name}`);
  
  // Check if image already exists
  const outputPath = path.join(OUTPUT_DIR, `${style.id}.png`);
  if (fs.existsSync(outputPath)) {
    console.log(`   ⏭️  Skipping: ${style.id}.png already exists`);
    return true;
  }

  console.log(`   Prompt: ${style.prompt.substring(0, 50)}...`);

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: style.prompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API Error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;

    if (!imageUrl) {
      throw new Error('No image data returned');
    }

    // Download the image
    let imageBuffer;
    if (imageUrl.startsWith('http')) {
      const imageResponse = await fetch(imageUrl);
      const arrayBuffer = await imageResponse.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else {
      // Base64 encoded
      imageBuffer = Buffer.from(imageUrl, 'base64');
    }

    // Save the image (outputPath already defined above)
    fs.writeFileSync(outputPath, imageBuffer);
    console.log(`   ✅ Saved: ${outputPath}`);

    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Art Style Preview Generator');
  console.log('================================\n');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Created directory: ${OUTPUT_DIR}`);
  }

  // Generate images for each style
  let successCount = 0;
  let failCount = 0;

  for (const style of ART_STYLES) {
    const success = await generateImage(style);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n================================');
  console.log(`✅ Successfully generated: ${successCount} images`);
  console.log(`❌ Failed: ${failCount} images`);
  console.log(`\n📁 Images saved to: ${OUTPUT_DIR}`);
  
  // Also output the styles configuration for use in the frontend
  const stylesConfig = ART_STYLES.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    previewImage: `/art-styles/${s.id}.png`
  }));
  
  const configPath = path.join(OUTPUT_DIR, 'styles-config.json');
  fs.writeFileSync(configPath, JSON.stringify(stylesConfig, null, 2));
  console.log(`📝 Styles config saved to: ${configPath}`);
}

main().catch(console.error);

