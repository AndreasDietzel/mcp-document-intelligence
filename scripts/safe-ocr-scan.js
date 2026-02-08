#!/usr/bin/env node

/**
 * SAFE OCR Scan: Improved version that does NOT change years
 * - Only renames files within their CURRENT year folder
 * - Does not use "null" in filenames
 * - Preserves year structure completely
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

// PDF Text extrahieren
async function extractPdfText(filePath) {
  try {
    const escapedPath = filePath.replace(/'/g, "'\\''");
    const { stdout } = await execAsync(
      `pdftotext -enc UTF-8 -l 3 '${escapedPath}' - 2>/dev/null | head -c 5000`,
      { encoding: 'utf8', timeout: 15000 }
    );
    return stdout.trim();
  } catch (error) {
    return '';
  }
}

// OCR auf Bilder/Scans anwenden
async function extractOcrText(filePath) {
  try {
    const escapedPath = filePath.replace(/'/g, "'\\''");
    const { stdout } = await execAsync(
      `tesseract '${escapedPath}' stdout -l deu --psm 1 2>/dev/null | head -c 5000`,
      { encoding: 'utf8', timeout: 30000 }
    );
    return stdout.trim();
  } catch (error) {
    return '';
  }
}

// Extrahiere Datum aus Text (nur für Dokument-Name, NICHT für Jahr-Verschiebung!)
function extractDateFromText(text) {
  const patterns = [
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/g,
    /(\d{4})-(\d{2})-(\d{2})/g,
    /vom\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/gi,
    /Datum[:\s]+(\d{1,2})\.(\d{1,2})\.(\d{4})/gi,
  ];
  
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      const match = matches[0];
      if (match[0].includes('-')) {
        return match[0];
      } else {
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
    'AOK': /\bAOK\b/i,
    'Arzt': /\barzt|praxis\b/i,
    'Apotheke': /\bapotheke\b/i,
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
  if (/rezept/i.test(text)) return 'Rezept';
  if (/überweisung.*arzt/i.test(text)) return 'Überweisung';
  if (/vertrag|contract/i.test(text)) return 'Vertrag';
  if (/bescheid/i.test(text)) return 'Bescheid';
  if (/kündigung/i.test(text)) return 'Kündigung';
  if (/bestätigung|confirmation/i.test(text)) return 'Bestätigung';
  if (/mahnung/i.test(text)) return 'Mahnung';
  if (/angebot|offer/i.test(text)) return 'Angebot';
  if (/quittung|beleg/i.test(text)) return 'Quittung';
  if (/krankmeldung|arbeitsunfähigkeit/i.test(text)) return 'Krankmeldung';
  
  return 'Dokument';
}

// Kategorisiere basierend auf Inhalt
function categorizeByContent(text, entity, docType) {
  const lower = text.toLowerCase();
  
  // Gesundheit
  if (entity && ['AOK', 'Arzt', 'Apotheke'].includes(entity)) {
    return '02_Gesundheit';
  }
  if (docType === 'Rezept' || docType === 'Überweisung' || docType === 'Krankmeldung') {
    return '02_Gesundheit';
  }
  if (lower.includes('arzt') || lower.includes('apotheke') || lower.includes('rezept') || lower.includes('kranken')) {
    return '02_Gesundheit';
  }
  
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
  
  // Telekommunikation (FIX: Vodafone ist kein Versicherung!)
  if (entity && ['Telekom', 'Vodafone'].includes(entity)) {
    return '11_Telekommunikation';
  }
  
  // Post/Paket
  if (entity === 'DHL' || entity === 'Amazon' || lower.includes('paket') || lower.includes('sendung')) {
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
  if (lower.includes('lebenslauf') || lower.includes('bewerbung') || lower.includes('arbeitsvertrag') || lower.includes('gehalt')) {
    return '07_Beruf';
  }
  
  // Bildung
  if (lower.includes('hochschule') || lower.includes('universität') || lower.includes('studium')) {
    return '08_Bildung';
  }
  
  return '99_Sonstiges';
}

console.log('🔍 SAFE OCR SCAN - Improved Version\n');
console.log('📸 OCR mit Tesseract aktiviert (Deutsch)');
console.log('⚠️  WICHTIG: Jahre werden NICHT verändert!\n');

// Sammle alle Dateien die verbessert werden können
const allFiles = [];

function scanDirectory(dirPath, currentYear) {
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      if (item.startsWith('.')) continue;
      
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Prüfe ob es ein Jahr-Ordner ist
        if (/^\d{4}$/.test(item)) {
          scanDirectory(fullPath, item);
        } else {
          scanDirectory(fullPath, currentYear);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(item).toLowerCase();
        // Nur Dateien mit "Scan", "Dokument" oder schlechten Namen
        const needsImprovement = 
          item.includes('Scan') || 
          item.includes('Dokument') ||
          item.match(/^\d{4}-\d{2}-\d{2}\.(pdf|jpg|jpeg|png)$/i) || // Nur Datum, kein Name
          item.toLowerCase().includes('screenshot') ||
          ['.jpg', '.jpeg', '.png'].includes(ext);
        
        if (needsImprovement) {
          allFiles.push({
            file: item,
            path: fullPath,
            year: currentYear, // WICHTIG: Verwende Jahr aus Ordner!
            ext,
            dir: path.dirname(fullPath)
          });
        }
      }
    }
  } catch (error) {
    // Skip errors
  }
}

// Scanne gesamtes Archiv
const archiveDirs = fs.readdirSync(ARCHIVE).filter(d => {
  const fullPath = path.join(ARCHIVE, d);
  return !d.startsWith('.') && fs.statSync(fullPath).isDirectory();
});

for (const decade of archiveDirs) {
  console.log(`📂 Scanne ${decade}...`);
  scanDirectory(path.join(ARCHIVE, decade), null);
}

console.log(`\n📄 Zu analysierende Dateien: ${allFiles.length}\n`);

const results = {
  analyzed: 0,
  improved: 0,
  unchanged: 0,
  errors: []
};

for (const item of allFiles) {
  const { file, path: filePath, year, ext, dir } = item;
  
  // Skip bereits gut benannte Dateien
  if (file.match(/^\d{4}-\d{2}-\d{2}_\w+_\w+/)) {
    results.unchanged++;
    continue;
  }
  
  console.log(`📄 ${file}`);
  
  try {
    let text = '';
    
    // Extrahiere Text mit passender Methode
    if (ext === '.pdf') {
      console.log(`   📄 PDF-Analyse...`);
      text = await extractPdfText(filePath);
      
      // Falls PDF leer, versuche OCR (gescanntes PDF)
      if (!text || text.length < 50) {
        console.log(`   📸 PDF scheint gescannt zu sein, verwende OCR...`);
        text = await extractOcrText(filePath);
      }
    } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      console.log(`   📸 OCR-Analyse...`);
      text = await extractOcrText(filePath);
    } else {
      // Textdatei direkt lesen
      text = fs.readFileSync(filePath, 'utf8');
    }
    
    if (!text || text.length < 20) {
      console.log(`   ⚠️  Kein Text erkannt, überspringe\n`);
      results.unchanged++;
      continue;
    }
    
    console.log(`   ✅ Text extrahiert: ${text.length} Zeichen`);
    
    // Erkenne Datum, Entität, Typ
    const detectedDate = extractDateFromText(text);
    const entity = detectEntity(text);
    const docType = detectDocumentType(text);
    const category = categorizeByContent(text, entity, docType);
    
    console.log(`   📅 Datum: ${detectedDate || 'nicht gefunden'}`);
    console.log(`   🏢 Firma: ${entity || 'keine'}`);
    console.log(`   📋 Typ: ${docType}`);
    console.log(`   📁 Kategorie: ${category}`);
    
    // Generiere intelligenten Namen
    // WICHTIG: Verwende KEIN "null"!
    const dateForFilename = detectedDate || (year ? `${year}-01-01` : file.substring(0, 10));
    const typePart = docType !== 'Dokument' ? `_${docType}` : '';
    const entityPart = entity ? `_${entity}` : '';
    
    let newFilename = sanitizeFilename(`${dateForFilename}${typePart}${entityPart}${ext}`);
    
    // Falls Name leer wäre, verwende Fallback
    if (!newFilename || newFilename === `${ext}`) {
      newFilename = sanitizeFilename(`${dateForFilename}_Scan${ext}`);
    }
    
    // WICHTIG: Bleibt im SELBEN Jahr-Ordner!
    const targetDir = path.join(dir, category);
    
    fs.mkdirSync(targetDir, { recursive: true });
    
    // Handle Duplikate
    let targetPath = path.join(targetDir, newFilename);
    if (fs.existsSync(targetPath) && targetPath !== filePath) {
      let counter = 1;
      const base = path.basename(newFilename, ext);
      while (fs.existsSync(targetPath)) {
        const dupName = sanitizeFilename(`${base}_${counter}${ext}`);
        targetPath = path.join(targetDir, dupName);
        counter++;
      }
    }
    
    // Verschiebe (INNERHALB des selben Jahres!)
    if (targetPath !== filePath) {
      fs.renameSync(filePath, targetPath);
      console.log(`   ✅ Verschoben: ${category}/${path.basename(targetPath)}`);
      console.log(`   📁 Jahr bleibt: ${year}\n`);
      results.improved++;
    } else {
      console.log(`   ⏭️  Unverändert\n`);
      results.unchanged++;
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
console.log(`✅ Verbessert: ${results.improved}`);
console.log(`⏭️  Unverändert: ${results.unchanged}`);
console.log(`❌ Fehler: ${results.errors.length}\n`);

console.log('✅ Safe OCR Scan abgeschlossen!\n');
console.log('ℹ️  Alle Dateien blieben in ihren ursprünglichen Jahren.\n');
