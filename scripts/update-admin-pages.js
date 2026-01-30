const fs = require('fs');
const path = require('path');

// Additional replacements for admin and other pages
const replacements = [
  // Slate/gray backgrounds to Solana gradients
  { from: /bg-slate-900/g, to: 'bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]' },
  { from: /bg-slate-800/g, to: 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90' },
  { from: /bg-gray-900/g, to: 'bg-[#14141e]' },
  { from: /bg-gray-800/g, to: 'bg-[#1a1a24]' },
  { from: /bg-gray-700/g, to: 'bg-[#1a1a24]/80' },
  
  // Border colors
  { from: /border-gray-700/g, to: 'border-[#9945FF]/20' },
  { from: /border-gray-600/g, to: 'border-[#9945FF]/30' },
  { from: /border-gray-500/g, to: 'border-[#9945FF]/40' },
  
  // Text colors
  { from: /text-gray-400/g, to: 'text-[#a8a8b8]' },
  { from: /text-gray-500/g, to: 'text-[#a8a8b8]/80' },
  { from: /text-gray-300/g, to: 'text-white' },
  
  // Button colors
  { from: /bg-blue-600/g, to: 'bg-[#9945FF]' },
  { from: /bg-blue-700/g, to: 'bg-[#7C3AED]' },
  { from: /text-blue-600/g, to: 'text-[#9945FF]' },
  { from: /text-blue-700/g, to: 'text-[#14F195]' },
  { from: /hover:bg-blue-700/g, to: 'hover:bg-[#7C3AED]' },
  { from: /hover:text-blue-700/g, to: 'hover:text-[#14F195]' },
  
  // Emerald colors for success states
  { from: /text-emerald-300/g, to: 'text-[#14F195]' },
  { from: /text-emerald-400/g, to: 'text-[#14F195]' },
  { from: /bg-emerald-500\/20/g, to: 'bg-[#14F195]/20' },
  { from: /border-emerald-500\/50/g, to: 'border-[#14F195]/30' },
  
  // Red colors for error states
  { from: /bg-red-900\/20/g, to: 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90' },
  { from: /border-red-700/g, to: 'border-[#EF4444]/20' },
  { from: /text-red-400/g, to: 'text-[#EF4444]' },
  
  // Yellow colors for warning states
  { from: /bg-yellow-900\/20/g, to: 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90' },
  { from: /border-yellow-700/g, to: 'border-[#FBBF24]/20' },
  { from: /text-yellow-400/g, to: 'text-[#FBBF24]' },
  { from: /bg-yellow-600/g, to: 'bg-[#FBBF24]' },
  { from: /hover:bg-yellow-700/g, to: 'hover:bg-[#F59E0B]' },
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

console.log('🚀 Starting Admin Pages Theme Update...\n');

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
