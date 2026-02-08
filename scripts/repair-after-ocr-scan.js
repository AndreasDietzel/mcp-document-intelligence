#!/usr/bin/env node

/**
 * REPAIR SCRIPT: Fixes issues from OCR scan
 * - Removes "null" from filenames
 * - Does NOT move files between years
 * - Keeps files in their current year folder
 */

import * as fs from 'fs';
import * as path from 'path';

const ARCHIVE = '/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv';

// Unicode normalisieren
function normalizeUnicode(str) {
  return str.normalize('NFC');
}

// Dateiname bereinigen
function sanitizeFilename(filename) {
  let safe = normalizeUnicode(filename);
  safe = safe.replace(/[<>:"|?*\x00-\x1F]/g, '_');
  safe = safe.replace(/[\\]/g, '-');
  safe = safe.trim().replace(/_+/g, '_').replace(/^_|_$/g, '');
  return safe;
}

console.log('🔧 REPAIR SCRIPT: Fixing OCR scan issues\n');
console.log('📋 Tasks:');
console.log('   1. Remove "null" from filenames');
console.log('   2. Keep files in their current year (NO year changes)');
console.log('   3. Rename to sensible names\n');

// Sammle alle Dateien mit "null" im Namen
const filesWithNull = [];

function scanForNullFiles(dirPath, currentYear) {
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      if (item.startsWith('.')) continue;
      
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Erkenne Jahr aus Ordnername
        if (/^\d{4}$/.test(item)) {
          scanForNullFiles(fullPath, item);
        } else {
          scanForNullFiles(fullPath, currentYear);
        }
      } else if (stat.isFile() && item.includes('null')) {
        const ext = path.extname(item);
        filesWithNull.push({
          path: fullPath,
          name: item,
          year: currentYear,
          ext,
          dir: path.dirname(fullPath)
        });
      }
    }
  } catch (error) {
    // Skip errors
  }
}

// Scanne alle Dekaden
const decades = ['Nuller', 'Zehner', 'Zwanziger'];
for (const decade of decades) {
  const decadePath = path.join(ARCHIVE, decade);
  if (fs.existsSync(decadePath)) {
    console.log(`📂 Scanne ${decade}...`);
    scanForNullFiles(decadePath, null);
  }
}

console.log(`\n📄 Gefunden: ${filesWithNull.length} Dateien mit "null"\n`);

let repaired = 0;
let errors = 0;

for (const file of filesWithNull) {
  console.log(`📄 ${file.name}`);
  
  try {
    // Extrahiere Datum aus aktuellem Namen
    const dateMatch = file.name.match(/^(\d{4}-\d{2}-\d{2})/);
    let date = dateMatch ? dateMatch[1] : null;
    
    // Falls kein Datum: Verwende Jahr aus Ordner
    if (!date && file.year) {
      date = `${file.year}-01-01`;
    } else if (!date) {
      date = '2026-01-01';
    }
    
    // Bestimme neuen Namen basierend auf Original
    let newBaseName;
    
    if (file.name.includes('Scan') || file.name.toLowerCase().includes('scan')) {
      newBaseName = 'Scan';
    } else if (file.ext.match(/\.(jpg|jpeg|png)$/i)) {
      newBaseName = 'Bild';
    } else {
      newBaseName = 'Dokument';
    }
    
    // Erstelle neuen Dateinamen (OHNE "null")
    let newName = sanitizeFilename(`${date}_${newBaseName}${file.ext}`);
    
    // Ziel: SELBER Ordner (keine Jahresänderung!)
    let targetPath = path.join(file.dir, newName);
    
    // Handle Duplikate
    if (fs.existsSync(targetPath) && targetPath !== file.path) {
      let counter = 1;
      const base = path.basename(newName, file.ext);
      while (fs.existsSync(targetPath)) {
        newName = sanitizeFilename(`${base}_${counter}${file.ext}`);
        targetPath = path.join(file.dir, newName);
        counter++;
      }
    }
    
    // Umbenennen (im selben Ordner!)
    if (targetPath !== file.path) {
      fs.renameSync(file.path, targetPath);
      console.log(`   ✅ ${file.name} → ${newName}`);
      console.log(`   📁 Bleibt in: ${path.basename(file.dir)}\n`);
      repaired++;
    } else {
      console.log(`   ⏭️  Bereits korrekt\n`);
    }
    
  } catch (error) {
    console.log(`   ❌ Fehler: ${error.message}\n`);
    errors++;
  }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n📊 ZUSAMMENFASSUNG\n');
console.log(`📄 Gefunden: ${filesWithNull.length}`);
console.log(`✅ Repariert: ${repaired}`);
console.log(`❌ Fehler: ${errors}\n`);

if (repaired > 0) {
  console.log('✅ "null"-Problem behoben!\n');
  console.log('ℹ️  Alle Dateien bleiben in ihren aktuellen Jahresordnern.\n');
}

console.log('⚠️  Falls du Dateien zwischen Jahren verschieben willst,');
console.log('   verwende bitte einen separaten Prozess mit Datum-Analyse.\n');
