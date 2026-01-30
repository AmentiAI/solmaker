#!/usr/bin/env node

/**
 * Script to apply Solana theme patterns across all page.tsx files
 * This ensures consistent styling throughout the application
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Color replacements
const colorReplacements = [
  // Backgrounds
  { from: /className="([^"]*?)bg-\[#0a0a0a\]([^"]*?)"/g, to: 'className="$1bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]$2"' },
  { from: /className="([^"]*?)bg-\[#1a1a1a\]([^"]*?)"/g, to: 'className="$1bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90$2"' },
  
  // Borders
  { from: /border-\[#222\]/g, to: 'border-[#9945FF]/20' },
  { from: /border-\[#333\]/g, to: 'border-[#9945FF]/30' },
  { from: /border-\[#444\]/g, to: 'border-[#9945FF]/50' },
  
  // Text colors
  { from: /text-\[#999\]/g, to: 'text-[#a8a8b8]' },
  { from: /text-\[#666\]/g, to: 'text-[#a8a8b8]/80' },
];

// Find all page.tsx files
async function findPageFiles() {
  const appDir = path.join(__dirname, '..', 'app');
  const pattern = path.join(appDir, '**', 'page.tsx').replace(/\\/g, '/');
  return await glob(pattern);
}

// Apply replacements to a file
function applyReplacements(content) {
  let updated = content;
  
  for (const replacement of colorReplacements) {
    updated = updated.replace(replacement.from, replacement.to);
  }
  
  return updated;
}

// Main execution
async function main() {
  console.log('🎨 Starting Solana theme update...\n');
  
  const files = await findPageFiles();
  console.log(`Found ${files.length} page files to update\n`);
  
  let updatedCount = 0;
  
  for (const file of files) {
    const relativePath = path.relative(process.cwd(), file);
    const content = fs.readFileSync(file, 'utf8');
    const updated = applyReplacements(content);
    
    if (content !== updated) {
      fs.writeFileSync(file, updated, 'utf8');
      console.log(`✅ Updated: ${relativePath}`);
      updatedCount++;
    } else {
      console.log(`⏭️  Skipped: ${relativePath} (no changes needed)`);
    }
  }
  
  console.log(`\n🎉 Complete! Updated ${updatedCount} of ${files.length} files`);
}

main().catch(console.error);
