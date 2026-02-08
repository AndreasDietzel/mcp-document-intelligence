#!/usr/bin/env node

/**
 * UNDO YEAR MOVES: Reverses incorrect year changes from OCR scan
 * - Analyzes log file to find year changes
 * - Moves files back to their original year
 */

import * as fs from 'fs';
import * as path from 'path';

const ARCHIVE = '/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv';
const LOG_FILE = '/Users/andreasdietzel/Projects/mcp-document-intelligence/ocr-full-scan-20260208-183819.log';

console.log('🔄 UNDO YEAR MOVES: Reversing incorrect year changes\n');

if (!fs.existsSync(LOG_FILE)) {
  console.log('❌ Log-Datei nicht gefunden:', LOG_FILE);
  console.log('   Kann Jahr-Verschiebungen nicht rückgängig machen.\n');
  process.exit(1);
}

console.log('📖 Lese Log-Datei...\n');

const logContent = fs.readFileSync(LOG_FILE, 'utf8');
const lines = logContent.split('\n');

// Parse log for year changes
const moves = [];
let currentFile = null;
let currentYear = null;

for (const line of lines) {
  // Detect file being processed
  const fileMatch = line.match(/^📄 (.+)/);
  if (fileMatch) {
    currentFile = fileMatch[1];
    // Extract year from filename
    const yearMatch = currentFile.match(/^(\d{4})/);
    currentYear = yearMatch ? yearMatch[1] : null;
    continue;
  }
  
  // Detect move with category
  const moveMatch = line.match(/✅ Verschoben: (\d+_\w+)\/(.+)/);
  if (moveMatch && currentFile) {
    const category = moveMatch[1];
    const newFilename = moveMatch[2];
    
    // Extract target year from new filename
    const targetYearMatch = newFilename.match(/^(\d{4})/);
    const targetYear = targetYearMatch ? targetYearMatch[1] : null;
    
    // Check if year changed
    if (currentYear && targetYear && currentYear !== targetYear) {
      moves.push({
        originalFile: currentFile,
        originalYear: currentYear,
        newFilename: newFilename,
        targetYear: targetYear,
        category: category
      });
    }
  }
}

console.log(`📊 Gefundene Jahr-Verschiebungen: ${moves.length}\n`);

if (moves.length === 0) {
  console.log('✅ Keine falschen Jahr-Verschiebungen gefunden!\n');
  console.log('   Möglicherweise wurde das Problem bereits behoben,');
  console.log('   oder das Log enthält keine Jahr-Änderungen.\n');
  process.exit(0);
}

// Show preview
console.log('📋 Preview der Rückverschiebungen:\n');
for (const move of moves.slice(0, 10)) {
  console.log(`   ${move.targetYear} → ${move.originalYear}: ${move.newFilename}`);
}
if (moves.length > 10) {
  console.log(`   ... und ${moves.length - 10} weitere\n`);
}

console.log('\n⚠️  ACHTUNG: Diese Dateien werden zurückverschoben!\n');
console.log('Press ENTER to continue or Ctrl+C to abort...');

// Wait for user confirmation (commented out for automated execution)
// await new Promise(resolve => process.stdin.once('data', resolve));

let moved = 0;
let notFound = 0;
let errors = 0;

for (const move of moves) {
  try {
    // Find file in target year
    const targetDecade = parseInt(move.targetYear) < 2010 ? 'Nuller' : 'Zwanziger';
    const sourceDecade = parseInt(move.originalYear) < 2010 ? 'Nuller' : 'Zwanziger';
    
    const sourcePath = path.join(ARCHIVE, targetDecade, move.targetYear, move.category, move.newFilename);
    
    if (!fs.existsSync(sourcePath)) {
      console.log(`⚠️  Nicht gefunden: ${move.newFilename}`);
      notFound++;
      continue;
    }
    
    // Move back to original year
    const targetDir = path.join(ARCHIVE, sourceDecade, move.originalYear, move.category);
    fs.mkdirSync(targetDir, { recursive: true });
    
    const targetPath = path.join(targetDir, move.newFilename);
    
    if (fs.existsSync(targetPath)) {
      console.log(`⚠️  Ziel existiert bereits: ${move.newFilename}`);
      continue;
    }
    
    fs.renameSync(sourcePath, targetPath);
    console.log(`✅ ${move.targetYear} → ${move.originalYear}: ${move.newFilename}`);
    moved++;
    
  } catch (error) {
    console.log(`❌ Fehler bei ${move.newFilename}: ${error.message}`);
    errors++;
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n📊 ZUSAMMENFASSUNG\n');
console.log(`📄 Jahr-Änderungen gefunden: ${moves.length}`);
console.log(`✅ Zurückverschoben: ${moved}`);
console.log(`⚠️  Nicht gefunden: ${notFound}`);
console.log(`❌ Fehler: ${errors}\n`);

if (moved > 0) {
  console.log('✅ Dateien wurden in ihre ursprünglichen Jahre zurückverschoben!\n');
}
