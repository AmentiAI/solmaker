#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const directories = ['app', 'components'];
const offWhite = 'bg-[#FDFCFA]';

// Patterns where we want to KEEP pure white (for contrast)
const keepWhitePatterns = [
  /input.*bg-white/i,
  /select.*bg-white/i,
  /textarea.*bg-white/i,
];

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.jsx')) return false;
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Replace bg-white with off-white, but be selective
  // We'll replace all bg-white for now - inputs typically have their own styling
  content = content.replace(/\bbg-white\b/g, offWhite);
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

function walkDir(dir) {
  let changedFiles = 0;
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and .next
      if (file !== 'node_modules' && file !== '.next') {
        changedFiles += walkDir(filePath);
      }
    } else if (processFile(filePath)) {
      console.log(`✅ Updated: ${filePath}`);
      changedFiles++;
    }
  }
  
  return changedFiles;
}

console.log('🎨 Updating bg-white to eggshell off-white...\n');

let totalChanged = 0;
for (const dir of directories) {
  const dirPath = path.join(process.cwd(), dir);
  if (fs.existsSync(dirPath)) {
    totalChanged += walkDir(dirPath);
  }
}

console.log(`\n📊 Updated ${totalChanged} files`);

