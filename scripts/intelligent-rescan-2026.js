#!/usr/bin/env node

/**
 * Intelligent Re-Scan: Analysiert PDFs mit pdftotext
 * - Erkennt richtiges Jahr aus Inhalt
 * - Kategorisiert basierend auf Content
 * - Generiert intelligente Dateinamen
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const ARCHIVE = '/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv';
const YEAR_2026 = path.join(ARCHIVE, 'Zwanziger', '2026');

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

// PDF Text extrahieren
async function extractPdfText(filePath) {
  try {
    const escapedPath = filePath.replace(/'/g, "'\\''");
    const { stdout } = await execAsync(
      `pdftotext -enc UTF-8 -l 3 '${escapedPath}' - 2>/dev/null | head -c 5000`,
      { encoding: 'utf8', timeout: 10000 }
    );
    return stdout.trim();
  } catch (error) {
    console.error(`   ⚠️  PDF-Extraktion fehlgeschlagen: ${error.message}`);
    return '';
  }
}

// Extrahiere Datum aus Text
function extractDateFromText(text) {
  const patterns = [
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/g,     // DD.MM.YYYY
    /(\d{4})-(\d{2})-(\d{2})/g,            // YYYY-MM-DD
    /vom\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/gi,
    /Datum[:\s]+(\d{1,2})\.(\d{1,2})\.(\d{4})/gi,
  ];
  
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      // Nimm erstes Datum
      const match = matches[0];
      if (match[0].includes('-')) {
        return match[0]; // YYYY-MM-DD
      } else {
        // DD.MM.YYYY -> YYYY-MM-DD
        const cleaned = match[0].replace(/vom\s+|Datum[:\s]+/gi, '').trim();
        const parts = cleaned.split('.');
        if (parts.length === 3) {
          return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
    }
  }
  
  return null;
}

// Erkenne Firmen/Entitäten
function detectEntity(text) {
  const entities = {
    'ING': /\bING\b/i,
    'Hallesche': /\bhallesche\b/i,
    'HUK': /\bHUK\b/i,
    'Sparkasse': /\bsparkasse\b/i,
    'Postbank': /\bpostbank\b/i,
    'Telekom': /\btelekom\b/i,
    'Vodafone': /\bvodafone\b/i,
    'DHL': /\bDHL\b/i,
    'Amazon': /\bamazon\b/i,
    'Finanzamt': /\bfinanzamt\b/i,
  };
  
  for (const [name, pattern] of Object.entries(entities)) {
    if (pattern.test(text)) {
      return name;
    }
  }
  
  return null;
}

// Erkenne Dokumenttyp
function detectDocumentType(text) {
  if (/rechnung|invoice/i.test(text)) return 'Rechnung';
  if (/vertrag|contract/i.test(text)) return 'Vertrag';
  if (/bescheid/i.test(text)) return 'Bescheid';
  if (/kündigung/i.test(text)) return 'Kündigung';
  if (/bestätigung|confirmation/i.test(text)) return 'Bestätigung';
  if (/mahnung/i.test(text)) return 'Mahnung';
  if (/angebot|offer/i.test(text)) return 'Angebot';
  if (/quittung|beleg/i.test(text)) return 'Quittung';
  
  return 'Dokument';
}

// Kategorisiere basierend auf Inhalt
function categorizeByContent(text, entity, docType) {
  const lower = text.toLowerCase();
  
  // Versicherungen
  if (entity && ['Hallesche', 'HUK'].includes(entity)) {
    return '04_Versicherungen';
  }
  if (lower.includes('versicherung') || lower.includes('police')) {
    return '04_Versicherungen';
  }
  
  // Finanzen
  if (entity && ['ING', 'Sparkasse', 'Postbank'].includes(entity)) {
    return '01_Finanzen';
  }
  if (docType === 'Rechnung' || lower.includes('rechnung') || lower.includes('kontoauszug')) {
    return '01_Finanzen';
  }
  
  // Telekommunikation
  if (entity && ['Telekom', 'Vodafone'].includes(entity)) {
    return '11_Telekommunikation';
  }
  
  // Post/Paket
  if (entity === 'DHL' || lower.includes('paket') || lower.includes('sendung')) {
    return '06_Post_Paket';
  }
  
  // Steuern
  if (entity === 'Finanzamt' || lower.includes('steuer') || lower.includes('finanzamt')) {
    return '05_Steuern';
  }
  
  // Behörden
  if (lower.includes('behörde') || lower.includes('amt') || lower.includes('wahl')) {
    return '12_Behörden';
  }
  
  // Beruf
  if (lower.includes('lebenslauf') || lower.includes('bewerbung') || lower.includes('arbeitsvertrag')) {
    return '07_Beruf';
  }
  
  // Bildung
  if (lower.includes('hochschule') || lower.includes('universität') || lower.includes('studium')) {
    return '08_Bildung';
  }
  
  return '99_Sonstiges';
}

console.log('🔍 INTELLIGENTER SCAN VON 2026-ORDNER\n');
console.log('Analysiere PDFs mit pdftotext...\n');

// Sammle alle Dateien aus 2026
const categories = fs.readdirSync(YEAR_2026);
const allFiles = [];

for (const category of categories) {
  if (category.startsWith('.')) continue;
  
  const categoryPath = path.join(YEAR_2026, category);
  if (!fs.statSync(categoryPath).isDirectory()) continue;
  
  const files = fs.readdirSync(categoryPath);
  for (const file of files) {
    if (file.startsWith('.')) continue;
    allFiles.push({
      file,
      category,
      path: path.join(categoryPath, file)
    });
  }
}

console.log(`📄 Gefunden: ${allFiles.length} Dateien in 2026\n`);

const results = {
  analyzed: 0,
  moved: 0,
  renamed: 0,
  unchanged: 0,
  errors: []
};

for (const item of allFiles) {
  const { file, category, path: filePath } = item;
  const ext = path.extname(file).toLowerCase();
  
  console.log(`📄 ${file}`);
  console.log(`   Aktuell: ${category}`);
  
  try {
    let text = '';
    let detectedYear = 2026;
    let detectedDate = null;
    let entity = null;
    let docType = null;
    let newCategory = category;
    
    // Analysiere PDF-Inhalte
    if (ext === '.pdf') {
      text = await extractPdfText(filePath);
      
      if (text) {
        // Erkenne Datum
        detectedDate = extractDateFromText(text);
        if (detectedDate) {
          const yearMatch = detectedDate.match(/^(\d{4})/);
          if (yearMatch) {
            detectedYear = parseInt(yearMatch[1]);
          }
        }
        
        // Erkenne Entität und Typ
        entity = detectEntity(text);
        docType = detectDocumentType(text);
        
        // Bessere Kategorisierung
        newCategory = categorizeByContent(text, entity, docType);
        
        console.log(`   📅 Erkanntes Jahr: ${detectedYear}`);
        console.log(`   🏢 Firma: ${entity || 'keine'}`);
        console.log(`   📋 Typ: ${docType}`);
        console.log(`   📁 Neue Kategorie: ${newCategory}`);
      }
    }
    
    // Generiere intelligenten Namen
    let newFilename = file;
    if (entity || docType !== 'Dokument') {
      const date = detectedDate || file.substring(0, 10);
      const entityPart = entity ? `_${entity}` : '';
      const typePart = docType !== 'Dokument' ? `_${docType}` : '';
      newFilename = sanitizeFilename(`${date}${typePart}${entityPart}${ext}`);
    }
    
    // Verschiebe in richtiges Jahr wenn nötig
    const targetDecade = detectedYear < 2010 ? 'Nuller' : 'Zwanziger';
    const targetYearPath = path.join(ARCHIVE, targetDecade, detectedYear.toString(), newCategory);
    
    fs.mkdirSync(targetYearPath, { recursive: true });
    
    // Handle Duplikate
    let targetPath = path.join(targetYearPath, newFilename);
    if (fs.existsSync(targetPath) && targetPath !== filePath) {
      let counter = 1;
      const base = path.basename(newFilename, ext);
      while (fs.existsSync(targetPath)) {
        const dupName = sanitizeFilename(`${base}_${counter}${ext}`);
        targetPath = path.join(targetYearPath, dupName);
        counter++;
      }
      newFilename = path.basename(targetPath);
    }
    
    // Verschiebe/Benenne um
    if (targetPath !== filePath) {
      fs.renameSync(filePath, targetPath);
      results.moved++;
      console.log(`   ✅ Verschoben: ${targetDecade}/${detectedYear}/${newCategory}/${newFilename}\n`);
    } else if (newFilename !== file) {
      results.renamed++;
      console.log(`   ✅ Umbenannt: ${newFilename}\n`);
    } else {
      results.unchanged++;
      console.log(`   ⏭️  Unverändert\n`);
    }
    
    results.analyzed++;
    
  } catch (error) {
    console.log(`   ❌ Fehler: ${error.message}\n`);
    results.errors.push({ file, error: error.message });
  }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n📊 ZUSAMMENFASSUNG\n');
console.log(`📄 Analysiert: ${results.analyzed}`);
console.log(`✅ Verschoben: ${results.moved}`);
console.log(`✏️  Umbenannt: ${results.renamed}`);
console.log(`⏭️  Unverändert: ${results.unchanged}`);
console.log(`❌ Fehler: ${results.errors.length}\n`);

console.log('✅ Intelligenter Scan abgeschlossen!\n');
