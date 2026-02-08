#!/usr/bin/env node

/**
 * Downloads sortieren und in 2026 einsortieren
 * MIT Analyse, Umbenennung und Verschiebung
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DOWNLOADS = '/Users/andreasdietzel/Downloads';
const ARCHIVE = '/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv';
const TARGET_YEAR = '2026';
const TARGET_DECADE = 'Zwanziger';

// Unicode normalisieren (macOS NFD -> NFC)
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

// Kategorisierung basierend auf Dateinamen
function categorizeByFilename(filename) {
  const lower = filename.toLowerCase();
  
  if (lower.includes('rechnung') || lower.includes('invoice') || lower.includes('praemien')) {
    return '01_Finanzen';
  }
  if (lower.includes('versicherung') || lower.includes('police')) {
    return '04_Versicherungen';
  }
  if (lower.includes('lebenslauf') || lower.includes('bewerbung')) {
    return '07_Beruf';
  }
  if (lower.includes('hochschule') || lower.includes('studieren')) {
    return '08_Bildung';
  }
  if (lower.includes('dhl') || lower.includes('paket') || lower.includes('lieferung')) {
    return '06_Post_Paket';
  }
  if (lower.includes('wahl') || lower.includes('antrag')) {
    return '12_Behörden';
  }
  
  return '99_Sonstiges';
}

// Extrahiere Datum aus Dateiname
function extractDateFromFilename(filename) {
  // Suche nach Datum-Patterns
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})/,  // 2026-01-15
    /(\d{4})(\d{2})(\d{2})/,     // 20260115
    /(\d{2})\.(\d{2})\.(\d{4})/, // 15.01.2026
  ];
  
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      if (pattern.source.includes('\\.')) {
        // Format: DD.MM.YYYY
        return `${match[3]}-${match[2]}-${match[1]}`;
      } else if (match[1].length === 4) {
        // Format: YYYY-MM-DD oder YYYYMMDD
        return `${match[1]}-${match[2] || match[0].substring(4, 6)}-${match[3] || match[0].substring(6, 8)}`;
      }
    }
  }
  
  // Kein Datum gefunden, nutze heutiges Datum
  return new Date().toISOString().split('T')[0];
}

// Generiere intelligenten Dateinamen
function generateSmartFilename(filename, date, category) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  
  // Entferne Datum aus originalem Namen falls vorhanden
  let cleanBase = base.replace(/^\d{4}-\d{2}-\d{2}[_-]?/, '');
  cleanBase = cleanBase.replace(/^\d{8}[_-]?/, '');
  cleanBase = cleanBase.replace(/^\d{2}\.\d{2}\.\d{4}[_-]?/, '');
  
  // Kürze zu lange Namen
  if (cleanBase.length > 50) {
    cleanBase = cleanBase.substring(0, 50);
  }
  
  // Kombiniere zu neuem Namen
  const newName = `${date}_${cleanBase}${ext}`;
  return sanitizeFilename(newName);
}

console.log('🚀 DOWNLOADS SORTIEREN NACH 2026\n');

// Sammle alle Dokumente
const files = fs.readdirSync(DOWNLOADS)
  .filter(f => {
    const fullPath = path.join(DOWNLOADS, f);
    try {
      return fs.statSync(fullPath).isFile();
    } catch {
      return false;
    }
  })
  .filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.pdf', '.docx', '.pages', '.png', '.jpg', '.jpeg', '.txt'].includes(ext);
  });

console.log(`📄 Zu verarbeiten: ${files.length} Dokumente\n`);

const results = {
  success: [],
  errors: [],
  skipped: []
};

for (const filename of files) {
  const sourcePath = path.join(DOWNLOADS, filename);
  
  try {
    // Extrahiere Datum
    const date = extractDateFromFilename(filename);
    
    // Kategorisiere
    const category = categorizeByFilename(filename);
    
    // Generiere neuen Namen
    const newFilename = generateSmartFilename(filename, date, category);
    
    // Baue Zielpfad
    const targetDir = path.join(ARCHIVE, TARGET_DECADE, TARGET_YEAR, category);
    const targetPath = path.join(targetDir, newFilename);
    
    // Erstelle Ordner
    fs.mkdirSync(targetDir, { recursive: true });
    
    // Handle Duplikate
    let finalPath = targetPath;
    if (fs.existsSync(targetPath)) {
      let counter = 1;
      const ext = path.extname(newFilename);
      const base = path.basename(newFilename, ext);
      while (fs.existsSync(finalPath)) {
        const dupName = sanitizeFilename(`${base}_${counter}${ext}`);
        finalPath = path.join(targetDir, dupName);
        counter++;
      }
    }
    
    // Verschiebe Datei
    fs.renameSync(sourcePath, finalPath);
    
    results.success.push({
      original: filename,
      new: path.basename(finalPath),
      category,
      path: finalPath
    });
    
    console.log(`✅ ${filename}`);
    console.log(`   → ${category}/${path.basename(finalPath)}\n`);
    
  } catch (error) {
    results.errors.push({
      file: filename,
      error: error.message
    });
    console.log(`❌ ${filename}: ${error.message}\n`);
  }
}

// Zusammenfassung
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n📊 ZUSAMMENFASSUNG\n');
console.log(`✅ Erfolgreich verschoben: ${results.success.length}`);
console.log(`❌ Fehler: ${results.errors.length}`);
console.log(`⏭️  Übersprungen: ${results.skipped.length}\n`);

if (results.success.length > 0) {
  console.log('📂 Verteilung nach Kategorien:\n');
  const categoryCounts = {};
  results.success.forEach(r => {
    categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
  });
  
  Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} Dateien`);
    });
  console.log('');
}

console.log('✅ Downloads-Ordner sortiert!\n');
console.log(`📁 Archiv: ${path.join(ARCHIVE, TARGET_DECADE, TARGET_YEAR)}`);
