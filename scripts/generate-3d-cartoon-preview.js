#!/usr/bin/env node
/**
 * Generate 3D Cartoon Art Style Preview
 * Quick script to generate just the 3D Cartoon style preview
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: '.env.local' });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in .env.local');
  process.exit(1);
}

const style = {
  id: '3d-cartoon',
  name: '3D Cartoon',
  prompt: '3D cartoon style character, Pixar Disney animation aesthetic, smooth rendered 3D surfaces, stylized proportions, soft ambient lighting, vibrant saturated colors, professional 3D animation render quality, Octane render'
};

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'art-styles');

async function main() {
  console.log('🎨 Generating 3D Cartoon art style preview...\n');
  console.log(`Prompt: ${style.prompt}\n`);

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
      imageBuffer = Buffer.from(imageUrl, 'base64');
    }

    // Ensure directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Save the image
    const outputPath = path.join(OUTPUT_DIR, `${style.id}.png`);
    fs.writeFileSync(outputPath, imageBuffer);
    
    console.log(`✅ Saved: ${outputPath}`);
    console.log('\n🎉 Done! 3D Cartoon preview generated successfully.');

  } catch (error) {
    console.error(`❌ Failed: ${error.message}`);
    process.exit(1);
  }
}

main();

