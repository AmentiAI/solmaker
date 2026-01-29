#!/usr/bin/env node

/**
 * Script to migrate all API routes to use shared database connection
 * This prevents memory leaks from multiple neon() connection instances
 */

const fs = require('fs');
const path = require('path');

const API_DIR = path.join(__dirname, '..', 'app', 'api');

// Pattern to find and replace
const patterns = [
  // Standard pattern
  {
    find: /import { neon } from '@neondatabase\/serverless';\n\nconst getDatabaseUrl = \(\) => \{\n  return process\.env\.NEON_DATABASE \|\| \n         process\.env\.DATABASE_URL \|\| \n         process\.env\.NEXT_PUBLIC_NEON_DATABASE \|\|\n         ''\n\}\n\nconst databaseUrl = getDatabaseUrl\(\);\nlet sql: ReturnType<typeof neon> \| null = null;\n\nif \(typeof window === 'undefined' && databaseUrl\) \{\n  sql = neon\(databaseUrl\);\n\}/g,
    replace: `import { sql } from '@/lib/database';`
  },
  // Pattern with semicolon variations
  {
    find: /import { neon } from '@neondatabase\/serverless'\n\nconst getDatabaseUrl = \(\) => \{\n  return process\.env\.NEON_DATABASE \|\| \n         process\.env\.DATABASE_URL \|\| \n         process\.env\.NEXT_PUBLIC_NEON_DATABASE \|\|\n         ''\n\}\n\nconst databaseUrl = getDatabaseUrl\(\)\nlet sql: ReturnType<typeof neon> \| null = null\n\nif \(typeof window === 'undefined' && databaseUrl\) \{\n  sql = neon\(databaseUrl\)\n\}/g,
    replace: `import { sql } from '@/lib/database'`
  }
];

// Also need to remove the neon import if it's on a line with other imports
const neonImportPattern = /import { neon } from '@neondatabase\/serverless';?\n?/g;

function getAllApiFiles(dir) {
  const files = [];
  
  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (item === 'route.ts') {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // Check if already using shared db
  if (content.includes("import { sql } from '@/lib/database'")) {
    return { path: filePath, status: 'already-fixed' };
  }

  // Check if has neon connection pattern
  if (!content.includes('let sql') || !content.includes('neon(')) {
    return { path: filePath, status: 'no-match' };
  }

  // Try each pattern
  for (const pattern of patterns) {
    if (pattern.find.test(content)) {
      content = content.replace(pattern.find, pattern.replace);
      modified = true;
      break;
    }
  }

  // If patterns didn't match, try a more flexible approach
  if (!modified && content.includes('neon(databaseUrl)')) {
    // Remove the neon import
    content = content.replace(neonImportPattern, '');
    
    // Remove the database URL getter and connection setup
    const dbSetupPattern = /const getDatabaseUrl[\s\S]*?sql = neon\(databaseUrl\);?\n\}/;
    content = content.replace(dbSetupPattern, '');
    
    // Add the shared import after first line or after 'use server' if present
    const lines = content.split('\n');
    const insertIndex = lines[0].includes("'use server'") ? 1 : 0;
    
    // Find where to insert (after other imports)
    let lastImportIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('import ')) {
        lastImportIndex = i;
      }
    }
    
    // Check if import already exists
    if (!content.includes("import { sql } from '@/lib/database'")) {
      lines.splice(lastImportIndex + 1, 0, "import { sql } from '@/lib/database';");
      content = lines.join('\n');
      modified = true;
    }
  }

  if (modified) {
    // Clean up any double blank lines
    content = content.replace(/\n\n\n+/g, '\n\n');
    fs.writeFileSync(filePath, content, 'utf-8');
    return { path: filePath, status: 'fixed' };
  }

  return { path: filePath, status: 'needs-manual' };
}

// Main
console.log('🔧 Fixing database connections in API routes...\n');

const files = getAllApiFiles(API_DIR);
console.log(`Found ${files.length} route files\n`);

const results = {
  fixed: [],
  'already-fixed': [],
  'no-match': [],
  'needs-manual': []
};

for (const file of files) {
  const result = fixFile(file);
  const relativePath = path.relative(path.join(__dirname, '..'), result.path);
  results[result.status].push(relativePath);
}

console.log(`✅ Fixed: ${results.fixed.length}`);
results.fixed.forEach(f => console.log(`   ${f}`));

console.log(`\n⏭️  Already fixed: ${results['already-fixed'].length}`);

console.log(`\n⚠️  Needs manual fix: ${results['needs-manual'].length}`);
results['needs-manual'].forEach(f => console.log(`   ${f}`));

console.log(`\n📊 Summary:`);
console.log(`   Total files: ${files.length}`);
console.log(`   Auto-fixed: ${results.fixed.length}`);
console.log(`   Already good: ${results['already-fixed'].length}`);
console.log(`   Need manual: ${results['needs-manual'].length}`);

