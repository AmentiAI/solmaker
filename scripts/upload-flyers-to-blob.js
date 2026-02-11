#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { put } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GENERATED_DIR = path.join(__dirname, 'tweet-flyers', 'generated');

async function uploadFlyersToBlob() {
  console.log('🚀 Uploading flyers to Vercel Blob...\n');

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('❌ Error: BLOB_READ_WRITE_TOKEN not found in .env');
    process.exit(1);
  }

  // Read all PNG files in the generated directory
  const files = await fs.readdir(GENERATED_DIR);
  const pngFiles = files.filter(f => f.endsWith('.png')).sort();

  console.log(`Found ${pngFiles.length} flyers to upload\n`);

  const uploadedUrls = [];

  for (const filename of pngFiles) {
    console.log(`📤 Uploading ${filename}...`);

    const filePath = path.join(GENERATED_DIR, filename);
    const fileBuffer = await fs.readFile(filePath);

    try {
      const blob = await put(`tweet-flyers/${filename}`, fileBuffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: 'image/png',
        addRandomSuffix: false
      });

      console.log(`✅ Uploaded: ${blob.url}\n`);
      uploadedUrls.push({ filename, url: blob.url });
    } catch (error) {
      console.error(`❌ Failed to upload ${filename}:`, error.message);
    }
  }

  // Save URLs to a file
  const urlsFile = path.join(__dirname, 'tweet-flyers', 'blob-urls.json');
  await fs.writeFile(urlsFile, JSON.stringify(uploadedUrls, null, 2));

  console.log('\n✨ Upload complete!');
  console.log(`📝 URLs saved to: ${urlsFile}`);
  console.log('\n🔗 All flyer URLs:');
  uploadedUrls.forEach((item, i) => {
    console.log(`${i + 1}. ${item.url}`);
  });
}

uploadFlyersToBlob().catch(console.error);
