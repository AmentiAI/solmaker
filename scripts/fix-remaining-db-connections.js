#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const filesToFix = [
  'app/api/admin/collections/route.ts',
  'app/api/admin/generated-images/route.ts',
  'app/api/admin/generation-jobs/route.ts',
  'app/api/admin/homepage-visibility/route.ts',
  'app/api/admin/track-visit/route.ts',
  'app/api/admin/transactions/route.ts',
  'app/api/admin/users/[wallet]/credits/route.ts',
  'app/api/admin/users/route.ts',
  'app/api/admin/wipe-generation-jobs/route.ts',
  'app/api/admin/wipe-transactions/route.ts',
  'app/api/collections/[id]/activate/route.ts',
  'app/api/collections/[id]/ordinals/[ordinalId]/flip/route.ts',
  'app/api/collections/[id]/ordinals/[ordinalId]/restore/route.ts',
  'app/api/collections/[id]/ordinals/compress/route.ts',
  'app/api/collections/[id]/ordinals/restore-all/route.ts',
  'app/api/collections/[id]/wipe-compressions/route.ts',
  'app/api/credits/cancel-payment/route.ts',
  'app/api/cron/check-payments/route.ts',
  'app/api/generate-simple/save-to-collection/route.ts',
  'app/api/layers/[id]/route.ts',
  'app/api/lazy-mode/create/route.ts',
  'app/api/migrations/add-collaborator-status/route.ts',
  'app/api/mint/available-ordinals/[collectionId]/route.ts',
  'app/api/mint/create-commit/route.ts',
  'app/api/mint/estimate-cost/route.ts',
  'app/api/mint/reveal/route.ts',
  'app/api/ordinals/batch-file-sizes/route.ts',
  'app/api/ordinals/batch-thumbnails/route.ts',
  'app/api/ordinals/ensure-thumbnail/route.ts',
  'app/api/tester11/save-to-collection/route.ts',
  'app/api/traits/[id]/route.ts',
];

// Pattern to match the old neon boilerplate
const oldPatterns = [
  // Pattern 1: getDatabaseUrl function with let sql
  /const getDatabaseUrl = \(\) => \{[\s\S]*?\}\s*\n\s*const databaseUrl = getDatabaseUrl\(\);\s*\n\s*let sql: ReturnType<typeof neon> \| null = null;\s*\n\s*if \(typeof window === 'undefined' && databaseUrl\) \{\s*\n\s*sql = neon\(databaseUrl\);\s*\n\s*\}/g,
  // Pattern 2: Just the let sql part without getDatabaseUrl
  /let sql: ReturnType<typeof neon> \| null = null;\s*\n\s*if \(typeof window === 'undefined' && databaseUrl\) \{\s*\n\s*sql = neon\(databaseUrl\);\s*\n\s*\}/g,
  // Pattern 3: neon import that's no longer needed
  /import \{ neon \} from '@neondatabase\/serverless';\s*\n?/g,
];

// Pattern to check if already has the correct import
const correctImportPattern = /import \{ sql \} from '@\/lib\/database'/;

let fixedCount = 0;
let alreadyFixedCount = 0;
let errorCount = 0;

console.log('🔧 Fixing remaining database connections in API routes...\n');

for (const file of filesToFix) {
  const filePath = path.join(process.cwd(), file);
  
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${file}`);
      continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Check if already has correct import
    const hasCorrectImport = correctImportPattern.test(content);
    
    // Remove old patterns
    let modified = false;
    for (const pattern of oldPatterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, '');
        modified = true;
      }
    }
    
    // Add correct import if not present
    if (!hasCorrectImport && modified) {
      // Find the first import statement and add after NextRequest/NextResponse import
      const nextImportMatch = content.match(/import \{ NextRequest, NextResponse \} from 'next\/server';/);
      if (nextImportMatch) {
        content = content.replace(
          /import \{ NextRequest, NextResponse \} from 'next\/server';/,
          "import { NextRequest, NextResponse } from 'next/server';\nimport { sql } from '@/lib/database';"
        );
      }
    }
    
    // Clean up extra blank lines
    content = content.replace(/\n{3,}/g, '\n\n');
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed: ${file}`);
      fixedCount++;
    } else if (hasCorrectImport) {
      alreadyFixedCount++;
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${file}:`, error.message);
    errorCount++;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Fixed: ${fixedCount}`);
console.log(`   Already correct: ${alreadyFixedCount}`);
console.log(`   Errors: ${errorCount}`);

