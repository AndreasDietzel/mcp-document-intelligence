#!/usr/bin/env node

/**
 * Downloads-Sortier-Script für 2026
 * 1. Zeigt Vorschau (Dry-Run)
 * 2. Nach Bestätigung: Verschiebt Dateien
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Importiere die built version
const indexPath = path.join(projectRoot, 'build', 'index.js');

const DOWNLOADS = '/Users/andreasdietzel/Downloads';
const ARCHIVE = '/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv';

console.log('🔍 DOWNLOADS VORSCHAU - Dry Run\n');
console.log(`📂 Downloads: ${DOWNLOADS}`);
console.log(`📦 Archiv: ${ARCHIVE}`);
console.log(`📅 Ziel-Jahr: 2026\n`);

// Prüfe ob Ordner existieren
if (!fs.existsSync(DOWNLOADS)) {
  console.error('❌ Downloads-Ordner nicht gefunden!');
  process.exit(1);
}

if (!fs.existsSync(ARCHIVE)) {
  console.error('❌ Archiv-Ordner nicht gefunden!');
  process.exit(1);
}

// Zähle Dateien in Downloads
const files = fs.readdirSync(DOWNLOADS)
  .filter(f => {
    const fullPath = path.join(DOWNLOADS, f);
    return fs.statSync(fullPath).isFile();
  })
  .filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.pdf', '.docx', '.pages', '.png', '.jpg', '.jpeg', '.txt'].includes(ext);
  });

console.log(`📄 Gefundene Dokumente: ${files.length}\n`);

if (files.length === 0) {
  console.log('✅ Keine Dokumente zum Sortieren gefunden.');
  process.exit(0);
}

console.log('📋 Vorschau der ersten 10 Dateien:\n');
files.slice(0, 10).forEach((file, i) => {
  console.log(`${i + 1}. ${file}`);
});

if (files.length > 10) {
  console.log(`   ... und ${files.length - 10} weitere\n`);
} else {
  console.log('');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('🚀 NÄCHSTER SCHRITT:');
console.log('');
console.log('Führe aus, um zu starten:');
console.log('  node scripts/sort-downloads-execute.js');
console.log('');
console.log('Oder nutze Claude Desktop / Perplexity mit:');
console.log('  Testfall 1 für Preview (autoMove: false)');
console.log('  Testfall 2 für Ausführung (autoMove: true)');
console.log('');
