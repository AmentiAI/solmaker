const fs = require('fs');
const path = require('path');

// Color and class replacements
const replacements = [
  // Old cosmic purple to new Solana purple
  { from: /#B537F2/g, to: '#9945FF' },
  { from: /#00b8e6/g, to: '#14F195' },
  { from: /#ff6b35/g, to: '#DC1FFF' },
  { from: /#ff5722/g, to: '#9945FF' },
  { from: /#ff4757/g, to: '#EF4444' },
  
  // Cosmic card to Solana card
  { from: /cosmic-card/g, to: 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md' },
  
  // Background colors
  { from: /bg-\[#0a0a0a\]/g, to: 'bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]' },
  { from: /bg-\[#1a1a1a\]/g, to: 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90' },
  { from: /bg-\[#111\]/g, to: 'bg-[#14141e]' },
  { from: /bg-\[#222\]/g, to: 'bg-[#1a1a24]' },
  
  // Border colors
  { from: /border-\[#222\]/g, to: 'border-[#9945FF]/20' },
  { from: /border-\[#333\]/g, to: 'border-[#9945FF]/30' },
  { from: /border-\[#444\]/g, to: 'border-[#9945FF]/40' },
  
  // Text colors
  { from: /text-\[#999\]/g, to: 'text-[#a8a8b8]' },
  { from: /text-\[#666\]/g, to: 'text-[#a8a8b8]/80' },
  { from: /text-white\/80/g, to: 'text-[#a8a8b8]' },
  { from: /text-white\/60/g, to: 'text-[#a8a8b8]/80' },
];

function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    replacements.forEach(({ from, to }) => {
      if (content.match(from)) {
        content = content.replace(from, to);
        modified = true;
      }
    });
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Updated: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
    return false;
  }
}

function walkDirectory(dir, filePattern = /\.tsx?$/) {
  const files = [];
  
  function walk(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and .next
        if (entry.name !== 'node_modules' && entry.name !== '.next') {
          walk(fullPath);
        }
      } else if (entry.isFile() && filePattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

// Main execution
const appDir = path.join(__dirname, '..', 'app');
const componentsDir = path.join(__dirname, '..', 'components');

console.log('🚀 Starting Solana Theme Phase 3 Update...\n');

let totalUpdated = 0;

// Update app directory
console.log('📁 Updating app directory...');
const appFiles = walkDirectory(appDir);
appFiles.forEach(file => {
  if (updateFile(file)) totalUpdated++;
});

// Update components directory
console.log('\n📁 Updating components directory...');
const componentFiles = walkDirectory(componentsDir);
componentFiles.forEach(file => {
  if (updateFile(file)) totalUpdated++;
});

console.log(`\n✨ Complete! Updated ${totalUpdated} files.`);
