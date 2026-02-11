#!/usr/bin/env node

/**
 * SolMaker x Pump.fun Tweet Flyer Generator
 *
 * Generates promotional flyers from tweets using OpenAI gpt-image-1.5
 * Tracks progress and processes one tweet at a time
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { put } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const TWEETS_FILE = path.join(__dirname, 'tweet-flyers', 'tweets.json');
const PROGRESS_FILE = path.join(__dirname, 'tweet-flyers', 'progress.json');
const OUTPUT_DIR = path.join(__dirname, 'tweet-flyers', 'generated');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Load tweets from JSON file
 */
async function loadTweets() {
  try {
    const data = await fs.readFile(TWEETS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading tweets.json:', error.message);
    console.log('\nPlease create scripts/tweet-flyers/tweets.json with your tweet content.');
    process.exit(1);
  }
}

/**
 * Load or initialize progress tracking
 */
async function loadProgress() {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // Initialize if doesn't exist
    return { completed: [], lastIndex: -1 };
  }
}

/**
 * Save progress
 */
async function saveProgress(progress) {
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Generate flyer image using DALL-E 3
 */
async function generateFlyer(tweet, index) {
  console.log(`\n🎨 Generating flyer for tweet ${index + 1}...`);
  console.log(`Tweet: "${tweet.content.substring(0, 100)}..."`);

  // Create a detailed prompt for the flyer
  const prompt = `Create a professional, eye-catching promotional flyer for SolMaker.Fun - a Solana NFT creation platform.

Design style: Modern, vibrant, tech-focused with gradient backgrounds (purple, blue, cyan tones)

Main elements:
- Bold headline at top: "${tweet.headline || 'SolMaker.Fun'}"
- Feature the tweet text prominently in the center: "${tweet.content}"
- Include "SolMaker.Fun" branding at the bottom
- Include visual elements: SOLANA logo/symbols, NFT card imagery, digital art collectibles, 3D rendered NFTs, pixel art characters
- IMPORTANT: NO Bitcoin symbols, NO Ethereum symbols, NO BTC, NO ETH - ONLY SOLANA
- Bottom section with call-to-action button and SolMaker.Fun branding
- Professional typography with good contrast
- Modern UI/UX design aesthetic
- Show examples of NFT collections, digital art, profile pictures
- NO AI MODEL NAMES OR TECHNICAL JARGON

Style: Clean, minimalist but bold, suitable for Twitter/social media sharing
Format: Vertical poster/flyer layout optimized for social media`;

  try {
    const response = await openai.images.generate({
      model: "gpt-image-1.5",
      prompt: prompt,
      n: 1,
      size: "1024x1536" // Vertical format for social media
    });

    // Get the image data (base64 by default for this model)
    const imageData = response.data?.[0]?.b64_json || response.data?.[0]?.url;

    if (!imageData) {
      console.log('Full response:', JSON.stringify(response, null, 2));
      throw new Error('No image data in response');
    }

    return imageData;
  } catch (error) {
    console.error('Error generating image:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    throw error;
  }
}

/**
 * Save image to Vercel Blob and optionally save locally
 */
async function saveImage(imageData, blobFilename, localFilename) {
  // Convert base64 to buffer
  const buffer = Buffer.from(imageData, 'base64');

  // Upload to Vercel Blob
  console.log('☁️  Uploading to Vercel Blob...');
  const blob = await put(blobFilename, buffer, {
    access: 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: 'image/png'
  });

  // Also save locally for backup
  const localPath = path.join(OUTPUT_DIR, localFilename);
  await fs.writeFile(localPath, buffer);
  console.log(`💾 Local backup: ${localFilename}`);

  return blob.url;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 SolMaker x Pump.fun Tweet Flyer Generator\n');

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(TWEETS_FILE), { recursive: true });

  // Check for API keys
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY environment variable not set');
    console.log('\nPlease set your OpenAI API key:');
    console.log('export OPENAI_API_KEY="your-api-key-here"');
    process.exit(1);
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('❌ Error: BLOB_READ_WRITE_TOKEN environment variable not set');
    console.log('\nPlease set your Vercel Blob token in .env');
    process.exit(1);
  }

  // Load tweets and progress
  const tweets = await loadTweets();
  const progress = await loadProgress();

  console.log(`📊 Total tweets: ${tweets.length}`);
  console.log(`✅ Completed: ${progress.completed.length}`);
  console.log(`⏳ Remaining: ${tweets.length - progress.completed.length}`);

  // Find next tweet to process
  let nextIndex = -1;
  for (let i = 0; i < tweets.length; i++) {
    if (!progress.completed.includes(i)) {
      nextIndex = i;
      break;
    }
  }

  // Check if all done
  if (nextIndex === -1) {
    console.log('\n🎉 All tweets have been processed!');
    console.log(`Generated flyers are in: ${OUTPUT_DIR}`);
    return;
  }

  // Process next tweet
  const tweet = tweets[nextIndex];
  console.log(`\n📝 Processing tweet ${nextIndex + 1}/${tweets.length}`);

  try {
    // Generate image
    const imageData = await generateFlyer(tweet, nextIndex);

    // Save image
    const localFilename = `flyer-${String(nextIndex + 1).padStart(3, '0')}-${Date.now()}.png`;
    const blobFilename = `tweet-flyers/${localFilename}`;

    const blobUrl = await saveImage(imageData, blobFilename, localFilename);

    console.log(`✅ Uploaded to Blob: ${blobUrl}`);

    // Initialize processed array if it doesn't exist
    if (!progress.processed) {
      progress.processed = [];
    }

    // Update progress
    progress.completed.push(nextIndex);
    progress.lastIndex = nextIndex;
    progress.lastCompletedAt = new Date().toISOString();
    progress.processed.push({
      index: nextIndex,
      filename: localFilename,
      blobUrl: blobUrl,
      tweet: tweet.headline || tweet.content.substring(0, 50) + '...',
      completedAt: new Date().toISOString()
    });
    await saveProgress(progress);

    console.log('\n✨ Success! Run the script again to process the next tweet.');
    console.log(`Progress: ${progress.completed.length}/${tweets.length} completed`);
    console.log(`\n🔗 View your flyer: ${blobUrl}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
