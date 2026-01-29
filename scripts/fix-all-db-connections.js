#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const filesToFix = [
  'app/api/admin/homepage-visibility/route.ts',
  'app/api/admin/track-visit/route.ts',
  'app/api/admin/users/[wallet]/credits/route.ts',
  'app/api/admin/wipe-generation-jobs/route.ts',
  'app/api/admin/wipe-transactions/route.ts',
  'app/api/generate-simple/save-to-collection/route.ts',
  'app/api/mint/available-ordinals/[collectionId]/route.ts',
  'app/api/mint/create-commit/route.ts',
  'app/api/mint/estimate-cost/route.ts',
  'app/api/mint/reveal/route.ts',
  'app/api/ordinals/batch-file-sizes/route.ts',
  'app/api/ordinals/batch-thumbnails/route.ts',
  'app/api/ordinals/ensure-thumbnail/route.ts',
  'app/api/tester11/save-to-collection/route.ts',
];

console.log('🔧 Fixing remaining database connections...\n');

let fixedCount = 0;

for (const file of filesToFix) {
  const filePath = path.join(process.cwd(), file);
  
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${file}`);
      continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Remove the getDatabaseUrl block (with or without semicolons)
    content = content.replace(/const getDatabaseUrl = \(\) => \{[\s\S]*?\}\s*\n/g, '');
    content = content.replace(/const databaseUrl = getDatabaseUrl\(\);?\s*\n/g, '');
    content = content.replace(/let sql: ReturnType<typeof neon> \| null = null;?\s*\n/g, '');
    content = content.replace(/if \(typeof window === 'undefined' && databaseUrl\) \{\s*\n\s*sql = neon\(databaseUrl\);?\s*\n\s*\}\s*\n?/g, '');
    
    // Remove neon import if present
    content = content.replace(/import \{ neon \} from '@neondatabase\/serverless';?\s*\n?/g, '');
    
    // Ensure correct import exists
    if (!content.includes("import { sql } from '@/lib/database'")) {
      // Add after NextRequest import
      content = content.replace(
        /import \{ NextRequest, NextResponse \} from 'next\/server';?\s*\n/,
        "import { NextRequest, NextResponse } from 'next/server'\nimport { sql } from '@/lib/database';\n"
      );
    }
    
    // Clean up multiple blank lines
    content = content.replace(/\n{3,}/g, '\n\n');
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed: ${file}`);
      fixedCount++;
    } else {
      console.log(`⏭️  No changes needed: ${file}`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${file}:`, error.message);
  }
}

console.log(`\n📊 Fixed ${fixedCount} files`);

