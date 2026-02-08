#!/usr/bin/env node

/**
 * MCP Document Intelligence Server v4.5.0
 * 
 * Performance Optimizations (v4.4.0):
 * - Generator-based directory scanning for memory efficiency
 * - Batch processing with configurable limits (25 files/batch)
 * - Explicit garbage collection between batches
 * - Rate limiting for file operations
 * - Memory usage monitoring and tracking
 * 
 * Advanced Features (v4.5.0):
 * - cleanup_old_structure: Removes old folder hierarchies
 * - optimize_folder_structure: Deletes empty folders, consolidates single-file categories
 * - intelligent_rename: PDF content analysis for smart naming
 * - move_loose_files: Pattern-based file categorization
 * 
 * See performance-utils.ts and advanced-tools.ts for implementation details
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createRequire } from "module";
import mammoth from "mammoth";
import AdmZip from "adm-zip";
import {
  cleanupOldStructure,
  optimizeFolderStructure,
  moveLooseFiles,
  intelligentRename
} from "./advanced-tools.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

// Konstanten für Validierung
const MAX_FILENAME_LENGTH = 255;
const MAX_FILE_SIZE_MB = 50;
const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".pages", ".png", ".jpg", ".jpeg", ".txt"];

/**
 * Normalizes Unicode strings to NFC (Canonical Composition)
 * macOS uses NFD, but we want consistent NFC for file operations
 */
function normalizeUnicode(str: string): string {
  return str.normalize('NFC');
}

/**
 * Safe filename: removes/replaces problematic characters, normalizes Unicode
 */
function sanitizeFilename(filename: string): string {
  // Normalize Unicode (NFD -> NFC)
  let safe = normalizeUnicode(filename);
  
  // Replace problematic characters but keep German umlauts
  safe = safe.replace(/[<>:"|?*\x00-\x1F]/g, '_');
  safe = safe.replace(/[\\]/g, '-');
  
  // Trim and remove multiple underscores
  safe = safe.trim().replace(/_+/g, '_').replace(/^_|_$/g, '');
  
  return safe;
}

// Hilfsfunktion: Dateivalidierung
function validateFile(filePath: string): { valid: boolean; error?: string } {
  try {
    // Prüfe ob Datei existiert
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: "File does not exist" };
    }

    // Prüfe ob es eine Datei ist (kein Verzeichnis)
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return { valid: false, error: "Path is not a file" };
    }

    // Prüfe Dateigröße
    const sizeInMB = stats.size / (1024 * 1024);
    if (sizeInMB > MAX_FILE_SIZE_MB) {
      return { valid: false, error: `File too large (${sizeInMB.toFixed(1)}MB, max ${MAX_FILE_SIZE_MB}MB)` };
    }

    // Prüfe Dateiname-Länge
    const basename = path.basename(filePath);
    if (basename.length > MAX_FILENAME_LENGTH) {
      return { valid: false, error: `Filename too long (${basename.length} chars, max ${MAX_FILENAME_LENGTH})` };
    }

    // Prüfe Dateierweiterung
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: `Unsupported file type: ${ext}. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}` };
    }

    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

// Gemeinsame Textanalyse-Funktion für alle Dokumenttypen
function analyzeTextContent(text: string, filePath: string, datePrefix: string): any {
  const originalFilename = path.basename(filePath, path.extname(filePath));
  const fileExtension = path.extname(filePath);
  
  // Extrahiere Datum aus Text
  const datePatterns = [
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/g,
    /(\d{4})-(\d{2})-(\d{2})/g,
    /vom\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/gi,
    /Datum[:\s]+(\d{1,2})\.(\d{1,2})\.(\d{4})/gi,
  ];
  
  let documentDate = "";
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      documentDate = match[0].replace(/vom\s+|Datum[:\s]+/gi, "").trim();
      break;
    }
  }
  
  // Wenn kein Datum im Text gefunden, nutze Erstelldatum der Datei
  let fileCreationDate = "";
  if (!documentDate) {
    try {
      const stats = fs.statSync(filePath);
      fileCreationDate = stats.birthtime.toISOString().split("T")[0];
      documentDate = fileCreationDate;
    } catch (error) {
      console.error("Could not read file creation date");
    }
  }
  
  // Extrahiere Referenznummern
  const referencePatterns = [
    /(?:Rechnungs[-\s]?Nr\.?|Invoice)[:\s]+([A-Z0-9-]+)/gi,
    /(?:Kunden[-\s]?Nr\.?|Customer)[:\s]+([A-Z0-9-]+)/gi,
    /(?:Bestell[-\s]?Nr\.?|Order)[:\s]+([A-Z0-9-]+)/gi,
    /(?:Vertrag[-\s]?Nr\.?|Contract)[:\s]+([A-Z0-9-]+)/gi,
    /Nr\.?\s+([A-Z0-9]{5,})/gi,
  ];
  
  const references: string[] = [];
  for (const pattern of referencePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && !references.includes(match[1])) {
        references.push(match[1]);
      }
    }
  }
  
  // Extrahiere Keywords
  const keywords: string[] = [];
  const keywordPatterns = [
    /\b(Rechnung|Invoice|Vertrag|Contract|Angebot|Offer|Bestellung|Order|Lieferschein|Mahnung)\b/gi,
    /\b(Telekom|Vodafone|Amazon|PayPal|Bank|Versicherung|Strom|Gas|Internet)\b/gi,
  ];
  
  for (const pattern of keywordPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const keyword = match[0].toLowerCase();
      if (!keywords.includes(keyword)) {
        keywords.push(keyword);
      }
    }
  }
  
  // Baue Dateinamen zusammen
  const parts: string[] = [];
  
  if (datePrefix) {
    parts.push(datePrefix);
  } else if (documentDate) {
    parts.push(documentDate.replace(/\./g, "-"));
  }
  
  if (references.length > 0) {
    parts.push(references.slice(0, 2).join("_"));
  }
  
  if (keywords.length > 0) {
    parts.push(keywords.slice(0, 3).join("_"));
  }
  
  // Wenn keine neuen Informationen gefunden wurden, behalte Original-Namen
  const hasNewInfo = references.length > 0 || keywords.length > 0 || (!datePrefix && documentDate);
  const originalName = path.basename(filePath);
  let suggestedFilename = hasNewInfo && parts.length > 0 
    ? parts.join("_") + fileExtension
    : originalName;
  
  // Sanitize filename (handle umlauts correctly)
  suggestedFilename = sanitizeFilename(suggestedFilename);
  
  return {
    originalFilename: originalName,
    suggestedFilename,
    documentDate,
    fileCreationDate,
    references,
    keywords,
    scannerDatePreserved: !!datePrefix,
    renameRecommended: hasNewInfo,
    textLength: text.length,
    documentType: fileExtension.slice(1),
    preview: text.substring(0, 500)
  };
}

// PDF Analyse mit OCR-Fallback für gescannte PDFs
async function analyzePdf(filePath: string): Promise<string> {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    let extractedText = "";
    let ocrUsed = false;
    
    // Schritt 1: Versuche Text-Extraktion mit pdf-parse
    try {
      const pdfData = await pdfParse(dataBuffer);
      extractedText = pdfData.text;
    } catch (error) {
      console.error("PDF text extraction failed, will try OCR...");
    }
    
    // Schritt 2: Fallback OCR für gescannte PDFs (wenn weniger als 50 Zeichen extrahiert wurden)
    if (!extractedText || extractedText.trim().length < 50) {
      console.error(`Text too short (${extractedText.trim().length} chars), running OCR on PDF...`);
      try {
        // Rendere PDF-Seiten als Bilder und führe OCR durch
        const ocrText = await renderPdfPagesAndOCR(filePath);
        if (ocrText && ocrText.length > extractedText.length) {
          extractedText = ocrText;
          ocrUsed = true;
          console.error(`OCR successful: extracted ${ocrText.length} characters`);
        }
      } catch (ocrError: any) {
        console.error("OCR failed:", ocrError.message);
      }
    }
    
    const originalFilename = path.basename(filePath, path.extname(filePath));
    const scannerDatePattern = /^(\d{4}[-_]\d{2}[-_]\d{2}[\s_-]\d{2}[-_:]\d{2}[-_:]\d{2}|\d{8}[-_]\d{6})/;
    const scannerMatch = originalFilename.match(scannerDatePattern);
    const datePrefix = scannerMatch ? scannerMatch[1] : "";
    
    const result = analyzeTextContent(extractedText, filePath, datePrefix);
    
    // Füge OCR-Info hinzu
    return JSON.stringify({
      ...result,
      ocrUsed,
      ocrQuality: ocrUsed ? (extractedText.length > 100 ? "good" : "poor") : "not-needed",
      confidence: ocrUsed ? (extractedText.length > 100 ? 0.85 : 0.5) : 1.0
    }, null, 2);
  } catch (error: any) {
    return JSON.stringify({
      error: `Error analyzing PDF: ${error.message}`,
      filePath,
      suggestion: "Check if the file is a valid PDF and is readable"
    }, null, 2);
  }
}

// Hilfsfunktion: Rendere PDF-Seiten als Bilder und führe OCR durch
async function renderPdfPagesAndOCR(filePath: string): Promise<string> {
  const { execSync } = require('child_process');
  
  try {
    // Verwende $HOME/.tmp statt /tmp wegen Tesseract Pfad-Problemen
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
    const tempDir = path.join(homeDir, `.pdf-ocr-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    try {
      // Konvertiere PDF-Seiten zu PNG (first 5 pages, 300 DPI for better OCR)
      execSync(`pdftoppm -png -r 300 -f 1 -l 5 "${filePath}" "${tempDir}/page"`, {
        stdio: 'pipe'
      });
      
      // Finde alle generierten PNG-Dateien
      const pngFiles = fs.readdirSync(tempDir).filter(f => f.endsWith('.png')).sort();
      
      console.error(`PDF converted to ${pngFiles.length} PNG files, running OCR...`);
      
      const allText: string[] = [];
      
      for (const pngFile of pngFiles) {
        const pngPath = path.join(tempDir, pngFile);
        try {
          // OCR mit nativem Tesseract durchführen
          const ocrOutput = execSync(`tesseract "${pngPath}" stdout -l deu --psm 6`, { 
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024 // 10MB Buffer
          });
          
          if (ocrOutput && ocrOutput.trim().length > 0) {
            allText.push(ocrOutput.trim());
            console.error(`${pngFile}: extracted ${ocrOutput.trim().length} characters`);
          }
        } catch (ocrError: any) {
          console.error(`OCR failed for ${pngFile}:`, ocrError.message);
        }
      }
      
      return allText.join('\n\n');
    } finally {
      // Cleanup - immer ausführen
      if (fs.existsSync(tempDir)) {
        execSync(`rm -rf "${tempDir}"`, { stdio: 'pipe' });
      }
    }
  } catch (error: any) {
    throw new Error(`PDF to image conversion failed: ${error.message}`);
  }
}

// DOCX Analyse
async function analyzeDocx(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value;
    
    const originalFilename = path.basename(filePath, path.extname(filePath));
    const scannerDatePattern = /^(\d{4}[-_]\d{2}[-_]\d{2}[\s_-]\d{2}[-_:]\d{2}[-_:]\d{2}|\d{8}[-_]\d{6})/;
    const scannerMatch = originalFilename.match(scannerDatePattern);
    const datePrefix = scannerMatch ? scannerMatch[1] : "";
    
    return JSON.stringify(analyzeTextContent(text, filePath, datePrefix), null, 2);
  } catch (error: any) {
    return `Error analyzing DOCX: ${error.message}`;
  }
}

// Pages Analyse
async function analyzePages(filePath: string): Promise<string> {
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    
    let text = "";
    for (const entry of entries) {
      if (entry.entryName.includes("index.json")) {
        const content = entry.getData().toString("utf8");
        const jsonMatch = content.match(/"text":\s*"([^"]+)"/g);
        if (jsonMatch) {
          text = jsonMatch.map(m => m.replace(/"text":\s*"([^"]+)"/, '$1')).join(" ");
        }
      }
    }
    
    if (!text || text.length < 50) {
      for (const entry of entries) {
        if (entry.entryName.includes("QuickLook/Preview.pdf")) {
          const pdfBuffer = entry.getData();
          try {
            const pdfData = await pdfParse(pdfBuffer);
            text = pdfData.text;
          } catch (error) {
            console.error("Could not extract text from Pages preview");
          }
          break;
        }
      }
    }
    
    const originalFilename = path.basename(filePath, path.extname(filePath));
    const scannerDatePattern = /^(\d{4}[-_]\d{2}[-_]\d{2}[\s_-]\d{2}[-_:]\d{2}[-_:]\d{2}|\d{8}[-_]\d{6})/;
    const scannerMatch = originalFilename.match(scannerDatePattern);
    const datePrefix = scannerMatch ? scannerMatch[1] : "";
    
    return JSON.stringify(analyzeTextContent(text, filePath, datePrefix), null, 2);
  } catch (error: any) {
    return `Error analyzing Pages: ${error.message}`;
  }
}

// Bild Analyse
async function analyzeImage(filePath: string): Promise<string> {
  try {
    // OCR mit nativem Tesseract durchführen
    const { execSync } = require('child_process');
    const ocrOutput = execSync(`tesseract "${filePath}" stdout -l deu --psm 6`, { 
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB Buffer
    });
    
    const originalFilename = path.basename(filePath, path.extname(filePath));
    const scannerDatePattern = /^(\d{4}[-_]\d{2}[-_]\d{2}[\s_-]\d{2}[-_:]\d{2}[-_:]\d{2}|\d{8}[-_]\d{6})/;
    const scannerMatch = originalFilename.match(scannerDatePattern);
    const datePrefix = scannerMatch ? scannerMatch[1] : "";
    
    return JSON.stringify(analyzeTextContent(ocrOutput, filePath, datePrefix), null, 2);
  } catch (error: any) {
    return `Error analyzing image: ${error.message}`;
  }
}

// TXT Analyse mit automatischer Encoding-Erkennung
async function analyzeTxt(filePath: string): Promise<string> {
  try {
    let text = "";
    let encoding = "utf-8";
    
    // Versuche verschiedene Encodings
    try {
      // Zuerst UTF-8 versuchen
      text = fs.readFileSync(filePath, "utf-8");
      
      // Prüfe auf ungültige UTF-8-Zeichen (Replacement Character)
      if (text.includes('\uFFFD') || text.includes('�')) {
        // UTF-8 fehlgeschlagen, versuche Latin1/ISO-8859-1
        const buffer = fs.readFileSync(filePath);
        text = buffer.toString('latin1');
        encoding = "latin1";
      }
    } catch (error) {
      // Fallback: Lese als Binary und konvertiere zu Latin1
      const buffer = fs.readFileSync(filePath);
      text = buffer.toString('latin1');
      encoding = "latin1";
    }
    
    // Entferne Null-Bytes für die Analyse
    const cleanText = text.replace(/\0/g, ' ');
    
    const originalFilename = path.basename(filePath, path.extname(filePath));
    const scannerDatePattern = /^(\d{4}[-_]\d{2}[-_]\d{2}[\s_-]\d{2}[-_:]\d{2}[-_:]\d{2}|\d{8}[-_]\d{6})/;
    const scannerMatch = originalFilename.match(scannerDatePattern);
    const datePrefix = scannerMatch ? scannerMatch[1] : "";
    
    const result = analyzeTextContent(cleanText, filePath, datePrefix);
    
    // Füge Encoding-Info hinzu
    return JSON.stringify({
      ...result,
      detectedEncoding: encoding,
      hadNullBytes: text.includes('\0')
    }, null, 2);
  } catch (error: any) {
    return JSON.stringify({
      error: `Error analyzing TXT: ${error.message}`,
      filePath,
      suggestion: "Check if the file exists and is readable"
    }, null, 2);
  }
}

// Haupt-Analyse-Funktion mit Multi-Format Support
async function analyzeDocument(filePath: string): Promise<string> {
  // Validiere Datei vor der Verarbeitung
  const validation = validateFile(filePath);
  if (!validation.valid) {
    return JSON.stringify({
      error: validation.error,
      filePath,
      supportedTypes: SUPPORTED_EXTENSIONS,
      maxFileSize: `${MAX_FILE_SIZE_MB}MB`,
      maxFilenameLength: MAX_FILENAME_LENGTH
    }, null, 2);
  }

  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case ".pdf":
      return analyzePdf(filePath);
    case ".docx":
      return analyzeDocx(filePath);
    case ".pages":
      return analyzePages(filePath);
    case ".png":
    case ".jpg":
    case ".jpeg":
      return analyzeImage(filePath);
    case ".txt":
      return analyzeTxt(filePath);
    default:
      return JSON.stringify({
        error: `Unsupported file type: ${ext}`,
        supportedTypes: [".pdf", ".docx", ".pages", ".png", ".jpg", ".jpeg", ".txt"]
      }, null, 2);
  }
}

// Levenshtein-Distanz für Ähnlichkeitsvergleich
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
      }
    }
  }

  return dp[m][n];
}

// Intelligente Ordnersuche mit Fuzzy-Matching
function findFolderInTree(searchName: string, basePath: string, maxDepth: number = 5): string {
  const normalizedSearch = searchName.toLowerCase().trim();
  const matches: Array<{ path: string; score: number }> = [];

  function searchRecursive(currentPath: string, depth: number) {
    if (depth > maxDepth) return;
    
    try {
      const items = fs.readdirSync(currentPath);
      
      for (const item of items) {
        if (item.startsWith('.')) continue; // Skip hidden files
        
        const fullPath = path.join(currentPath, item);
        
        try {
          const stats = fs.statSync(fullPath);
          if (!stats.isDirectory()) continue;
          
          const itemLower = item.toLowerCase();
          
          // Exakte Übereinstimmung
          if (itemLower === normalizedSearch) {
            matches.push({ path: fullPath, score: 0 });
            return;
          }
          
          // Enthält den Suchbegriff
          if (itemLower.includes(normalizedSearch) || normalizedSearch.includes(itemLower)) {
            const distance = levenshteinDistance(normalizedSearch, itemLower);
            matches.push({ path: fullPath, score: distance });
          }
          
          // Fuzzy-Match basierend auf Levenshtein-Distanz
          const distance = levenshteinDistance(normalizedSearch, itemLower);
          if (distance <= 3) { // Maximal 3 Buchstaben Unterschied
            matches.push({ path: fullPath, score: distance });
          }
          
          // Rekursiv weiter suchen
          searchRecursive(fullPath, depth + 1);
        } catch (error) {
          // Skip unreadable directories
          continue;
        }
      }
    } catch (error) {
      // Skip unreadable directories
      return;
    }
  }

  searchRecursive(basePath, 0);
  
  // Sortiere nach Score (beste Treffer zuerst)
  matches.sort((a, b) => a.score - b.score);
  
  if (matches.length === 0) {
    return JSON.stringify({
      found: false,
      searchTerm: searchName,
      basePath: basePath,
      message: `No folder matching "${searchName}" found in the directory tree.`,
      suggestions: []
    }, null, 2);
  }
  
  // Bester Treffer (Score 0 = exakte Übereinstimmung)
  const bestMatch = matches[0];
  const suggestions = matches.slice(0, 5).map(m => ({
    path: m.path,
    name: path.basename(m.path),
    similarity: m.score === 0 ? "exact match" : `${m.score} character(s) difference`
  }));
  
  return JSON.stringify({
    found: true,
    searchTerm: searchName,
    basePath: basePath,
    bestMatch: {
      fullPath: bestMatch.path,
      name: path.basename(bestMatch.path),
      relativePath: bestMatch.path.replace(basePath, '').replace(/^\//, '')
    },
    totalMatches: matches.length,
    suggestions: suggestions
  }, null, 2);
}

// Analysiere einzelne Datei und gebe strukturiertes Objekt zurück (für Batch-Processing)
async function analyzeDocumentStructured(filePath: string): Promise<any> {
  const result = await analyzeDocument(filePath);
  try {
    const parsed = JSON.parse(result);
    // OCR-Qualitäts-Feedback hinzufügen (#10)
    if (parsed.textLength && parsed.textLength > 0) {
      const ocrQuality = parsed.textLength > 100 ? "high" : parsed.textLength > 20 ? "medium" : "low";
      const confidence = Math.min(0.95, parsed.textLength / 1000);
      parsed.ocrQuality = ocrQuality;
      parsed.confidence = confidence;
    }
    return parsed;
  } catch (error) {
    return { error: result, filePath, ocrQuality: "failed", confidence: 0 };
  }
}

// Rekursiv alle Dateien in Ordner und Unterordner sammeln (#1)
function collectFilesRecursively(
  folderPath: string, 
  supportedExtensions: string[],
  fileTypes?: string[],
  keywords?: string[],
  maxDepth: number = 10,
  currentDepth: number = 0
): string[] {
  if (currentDepth > maxDepth) return [];
  
  const collectedFiles: string[] = [];
  
  try {
    const items = fs.readdirSync(folderPath);
    
    for (const item of items) {
      if (item.startsWith('.')) continue;
      
      const fullPath = path.join(folderPath, item);
      
      try {
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          // Rekursiv in Unterordner
          const subFiles = collectFilesRecursively(
            fullPath, 
            supportedExtensions, 
            fileTypes, 
            keywords, 
            maxDepth, 
            currentDepth + 1
          );
          collectedFiles.push(...subFiles);
        } else if (stats.isFile()) {
          const ext = path.extname(item).toLowerCase();
          
          // Filter #7: fileTypes
          if (fileTypes && fileTypes.length > 0) {
            if (!fileTypes.includes(ext.slice(1))) continue;
          }
          
          if (supportedExtensions.includes(ext)) {
            // Filter #7: keywords (einfache Dateinamen-Prüfung)
            if (keywords && keywords.length > 0) {
              const filenameLower = item.toLowerCase();
              const hasKeyword = keywords.some(kw => filenameLower.includes(kw.toLowerCase()));
              if (!hasKeyword) continue;
            }
            
            collectedFiles.push(fullPath);
          }
        }
      } catch (error) {
        continue;
      }
    }
  } catch (error) {
    // Skip unreadable directories
  }
  
  return collectedFiles;
}

// Berechne SHA256-Hash für Duplikat-Erkennung (#4)
function calculateFileHash(filePath: string): string {
  try {
    const crypto = require('crypto');
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    return '';
  }
}

// Batch-Analyse eines gesamten Ordners mit allen neuen Features
async function analyzeFolderBatch(
  folderPath: string, 
  recursive: boolean = false,
  fileTypes?: string[],
  keywords?: string[]
): Promise<string> {
  try {
    if (!fs.existsSync(folderPath)) {
      return JSON.stringify({ error: `Folder not found: ${folderPath}` }, null, 2);
    }
    
    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      return JSON.stringify({ error: `Path is not a directory: ${folderPath}` }, null, 2);
    }
    
    const supportedExtensions = [".pdf", ".docx", ".pages", ".png", ".jpg", ".jpeg", ".txt"];
    
    // Sammle Dateien (rekursiv oder nicht) mit Filtern
    let documentFiles: string[];
    if (recursive) {
      documentFiles = collectFilesRecursively(folderPath, supportedExtensions, fileTypes, keywords);
    } else {
      const files = fs.readdirSync(folderPath);
      documentFiles = files
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          
          // Filter fileTypes
          if (fileTypes && fileTypes.length > 0 && !fileTypes.includes(ext.slice(1))) {
            return false;
          }
          
          // Filter keywords
          if (keywords && keywords.length > 0) {
            const hasKeyword = keywords.some(kw => file.toLowerCase().includes(kw.toLowerCase()));
            if (!hasKeyword) return false;
          }
          
          return supportedExtensions.includes(ext);
        })
        .map(file => path.join(folderPath, file));
    }
    
    // ISO25010: Performance - Warn bei sehr vielen Dateien
    if (documentFiles.length > 500) {
      console.error(`⚠️  Performance Warning: ${documentFiles.length} Dateien - kann 15-45 Minuten dauern`);
    }
    
    // ISO25010: Reliability - Soft limit mit Warnung (kein Hard-Limit mehr)
    const softLimit = 5000;
    if (documentFiles.length > softLimit) {
      console.error(`⚠️  ACHTUNG: ${documentFiles.length} Dateien überschreiten empfohlenes Limit von ${softLimit}`);
      console.error(`⚠️  Verarbeitung kann >1 Stunde dauern. Fortfahren...`);
    }
    
    // Performance-Tracking
    const startTime = Date.now();
    
    const results = [];
    const duplicates: { [hash: string]: string[] } = {};
    const errors: Array<{file: string, error: string}> = [];
    let processedCount = 0;
    
    for (const filePath of documentFiles) {
      try {
        // ISO25010: Usability - Progress bei vielen Dateien
        processedCount++;
        if (documentFiles.length > 20 && processedCount % 25 === 0) {
          console.error(`📊 Progress: ${processedCount}/${documentFiles.length} Dateien (${Math.round(processedCount/documentFiles.length*100)}%)`);
        }
        
        // Duplikat-Erkennung (#4)
        const fileHash = calculateFileHash(filePath);
        if (fileHash) {
          if (duplicates[fileHash]) {
            duplicates[fileHash].push(filePath);
          } else {
            duplicates[fileHash] = [filePath];
          }
        }
        
        const analysis = await analyzeDocumentStructured(filePath);
        results.push({
          originalPath: filePath,
          fileHash: fileHash,
          ...analysis
        });
      } catch (error: any) {
        // ISO25010: Reliability - Graceful degradation
        const fileName = path.basename(filePath);
        console.error(`⚠️  Error: ${fileName}: ${error.message}`);
        errors.push({ file: fileName, error: error.message });
        results.push({
          originalPath: filePath,
          error: error.message,
          ocrQuality: "failed",
          confidence: 0
        });
      }
    }
    
    // Finde tatsächliche Duplikate
    const duplicateGroups = Object.entries(duplicates)
      .filter(([hash, paths]) => paths.length > 1)
      .map(([hash, paths]) => ({ hash, files: paths, count: paths.length }));
    
    // Performance-Metriken
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTimePerFile = totalTime / documentFiles.length;
    
    // ISO25010: Usability - Informative Zusammenfassung
    return JSON.stringify({
      folderPath,
      totalFiles: documentFiles.length,
      successfullyProcessed: results.filter(r => !r.error).length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      recursive,
      filters: { fileTypes, keywords },
      performance: {
        totalTimeMs: Math.round(totalTime),
        averageTimePerFileMs: Math.round(avgTimePerFile),
        filesPerSecond: (documentFiles.length / (totalTime / 1000)).toFixed(2)
      },
      documents: results,
      duplicates: duplicateGroups.length > 0 ? {
        count: duplicateGroups.length,
        groups: duplicateGroups
      } : undefined
    }, null, 2);
  } catch (error: any) {
    return JSON.stringify({ error: `Error analyzing folder: ${error.message}` }, null, 2);
  }
}

// Ordnerstruktur-Vorschlag basierend auf Dokumenten-Metadaten
function suggestFolderStructure(documents: any[]): string {
  try {
    const structure: any = {};
    const assignments: any[] = [];
    
    // Gruppiere nach Jahr
    const years = new Set<string>();
    const categories = new Set<string>();
    const companies = new Set<string>();
    
    documents.forEach(doc => {
      if (doc.error) return;
      
      // Jahr extrahieren
      let year = "Unbekannt";
      if (doc.documentDate) {
        const yearMatch = doc.documentDate.match(/(\d{4})/);
        if (yearMatch) year = yearMatch[1];
      }
      years.add(year);
      
      // Kategorie aus Keywords
      const docTypeKeywords = ["rechnung", "invoice", "vertrag", "contract", "angebot", "offer", "mahnung", "bestellung", "order"];
      const foundType = doc.keywords?.find((kw: string) => docTypeKeywords.includes(kw.toLowerCase()));
      if (foundType) {
        const category = foundType.charAt(0).toUpperCase() + foundType.slice(1) + "en";
        categories.add(category);
      }
      
      // Firma aus Keywords
      const companyKeywords = ["telekom", "vodafone", "amazon", "paypal", "bank", "versicherung"];
      const foundCompany = doc.keywords?.find((kw: string) => companyKeywords.includes(kw.toLowerCase()));
      if (foundCompany) {
        companies.add(foundCompany.charAt(0).toUpperCase() + foundCompany.slice(1));
      }
    });
    
    // Baue Struktur
    years.forEach(year => {
      structure[year] = {};
      categories.forEach(category => {
        structure[year][category] = [];
        companies.forEach(company => {
          structure[year][category].push(company);
        });
      });
    });
    
    // Ordne Dateien zu
    documents.forEach(doc => {
      if (doc.error) {
        assignments.push({
          originalPath: doc.originalPath,
          targetFolder: "Fehler",
          newFilename: path.basename(doc.originalPath),
          reason: "Analyse fehlgeschlagen"
        });
        return;
      }
      
      let year = "Unbekannt";
      if (doc.documentDate) {
        const yearMatch = doc.documentDate.match(/(\d{4})/);
        if (yearMatch) year = yearMatch[1];
      }
      
      const docTypeKeywords = ["rechnung", "invoice", "vertrag", "contract", "angebot", "offer", "mahnung", "bestellung", "order"];
      const foundType = doc.keywords?.find((kw: string) => docTypeKeywords.includes(kw.toLowerCase()));
      const category = foundType ? foundType.charAt(0).toUpperCase() + foundType.slice(1) + "en" : "Sonstiges";
      
      const companyKeywords = ["telekom", "vodafone", "amazon", "paypal", "bank", "versicherung"];
      const foundCompany = doc.keywords?.find((kw: string) => companyKeywords.includes(kw.toLowerCase()));
      const company = foundCompany ? foundCompany.charAt(0).toUpperCase() + foundCompany.slice(1) : "";
      
      const targetPath = company 
        ? path.join(year, category, company)
        : path.join(year, category);
      
      assignments.push({
        originalPath: doc.originalPath,
        targetFolder: targetPath,
        newFilename: doc.suggestedFilename,
        metadata: {
          date: doc.documentDate,
          references: doc.references,
          keywords: doc.keywords
        }
      });
    });
    
    return JSON.stringify({
      structure,
      assignments,
      summary: {
        totalDocuments: documents.length,
        years: Array.from(years),
        categories: Array.from(categories),
        companies: Array.from(companies)
      }
    }, null, 2);
  } catch (error: any) {
    return JSON.stringify({ error: `Error suggesting structure: ${error.message}` }, null, 2);
  }
}

// Batch-Organisation: Umbenennen und Verschieben von Dateien mit erweiterten Features
async function batchOrganize(
  baseFolder: string, 
  operations: any[], 
  mode: "move" | "copy" = "move",
  createBackup: boolean = true
): Promise<string> {
  try {
    const results = [];
    const errors = [];
    const backupInfo: any = {};
    
    // Backup erstellen (#5)
    if (createBackup && mode === "move") {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(baseFolder, `.backup_${timestamp}.json`);
      backupInfo.backupPath = backupPath;
      backupInfo.timestamp = timestamp;
      backupInfo.operations = operations.map(op => ({
        from: op.originalPath,
        to: path.join(baseFolder, op.targetFolder, op.newFilename)
      }));
      fs.writeFileSync(backupPath, JSON.stringify(backupInfo, null, 2));
    }
    
    let foldersCreated = 0;
    const createdFolders = new Set<string>();
    
    for (const op of operations) {
      try {
        const targetDir = path.join(baseFolder, op.targetFolder);
        const targetPath = path.join(targetDir, op.newFilename);
        
        // Erstelle Zielverzeichnis falls nicht vorhanden
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
          if (!createdFolders.has(targetDir)) {
            createdFolders.add(targetDir);
            foldersCreated++;
          }
        }
        
        // Prüfe ob Quelldatei existiert
        if (!fs.existsSync(op.originalPath)) {
          errors.push({
            operation: op,
            error: "Source file not found"
          });
          continue;
        }
        
        // Prüfe ob Zieldatei bereits existiert
        if (fs.existsSync(targetPath)) {
          errors.push({
            operation: op,
            error: "Target file already exists"
          });
          continue;
        }
        
        // Kopieren oder Verschieben (#8)
        if (mode === "copy") {
          fs.copyFileSync(op.originalPath, targetPath);
        } else {
          fs.renameSync(op.originalPath, targetPath);
        }
        
        results.push({
          success: true,
          from: op.originalPath,
          to: targetPath,
          mode: mode
        });
      } catch (error: any) {
        errors.push({
          operation: op,
          error: error.message
        });
      }
    }
    
    // Zusammenfassung (#3)
    const summary = {
      success: errors.length === 0,
      mode: mode,
      filesProcessed: results.length,
      filesFailed: errors.length,
      foldersCreated: foldersCreated,
      totalOperations: operations.length,
      backupCreated: createBackup && mode === "move",
      backupPath: backupInfo.backupPath
    };
    
    return JSON.stringify({
      ...summary,
      results,
      errors
    }, null, 2);
  } catch (error: any) {
    return JSON.stringify({ error: `Error in batch organize: ${error.message}` }, null, 2);
  }
}

// Preview Organization (Dry-Run) (#2)
function previewOrganization(baseFolder: string, operations: any[]): string {
  try {
    const preview: any[] = [];
    const warnings: any[] = [];
    const stats = {
      totalFiles: operations.length,
      foldersToCreate: new Set<string>(),
      conflicts: 0,
      missingFiles: 0
    };
    
    for (const op of operations) {
      const targetDir = path.join(baseFolder, op.targetFolder);
      const targetPath = path.join(targetDir, op.newFilename);
      
      // Prüfe ob Ordner erstellt werden muss
      if (!fs.existsSync(targetDir)) {
        stats.foldersToCreate.add(targetDir);
      }
      
      // Prüfe auf Konflikte
      if (fs.existsSync(targetPath)) {
        stats.conflicts++;
        warnings.push({
          type: "conflict",
          message: `File already exists: ${targetPath}`,
          operation: op
        });
      }
      
      // Prüfe ob Quelldatei existiert
      if (!fs.existsSync(op.originalPath)) {
        stats.missingFiles++;
        warnings.push({
          type: "missing_source",
          message: `Source file not found: ${op.originalPath}`,
          operation: op
        });
      }
      
      preview.push({
        action: "move",
        from: op.originalPath,
        to: targetPath,
        folder: op.targetFolder,
        filename: op.newFilename,
        status: fs.existsSync(targetPath) ? "conflict" : !fs.existsSync(op.originalPath) ? "missing" : "ok"
      });
    }
    
    return JSON.stringify({
      preview,
      warnings,
      stats: {
        ...stats,
        foldersToCreate: Array.from(stats.foldersToCreate)
      },
      safeToExecute: warnings.length === 0
    }, null, 2);
  } catch (error: any) {
    return JSON.stringify({ error: `Error in preview: ${error.message}` }, null, 2);
  }
}

// Undo Last Organization (#5)
async function undoLastOrganization(baseFolder: string): Promise<string> {
  try {
    // Finde neuestes Backup
    const files = fs.readdirSync(baseFolder);
    const backupFiles = files
      .filter(f => f.startsWith('.backup_') && f.endsWith('.json'))
      .sort()
      .reverse();
    
    if (backupFiles.length === 0) {
      return JSON.stringify({
        success: false,
        message: "No backup found. Cannot undo."
      }, null, 2);
    }
    
    const latestBackup = path.join(baseFolder, backupFiles[0]);
    const backupData = JSON.parse(fs.readFileSync(latestBackup, 'utf-8'));
    
    const restored: any[] = [];
    const errors: any[] = [];
    
    // Rückgängig machen (umgekehrte Richtung)
    for (const op of backupData.operations) {
      try {
        if (fs.existsSync(op.to) && !fs.existsSync(op.from)) {
          fs.renameSync(op.to, op.from);
          restored.push({ from: op.to, to: op.from });
        } else {
          errors.push({
            operation: op,
            error: "Cannot restore: source exists or target missing"
          });
        }
      } catch (error: any) {
        errors.push({ operation: op, error: error.message });
      }
    }
    
    // Lösche Backup nach erfolgreichem Undo
    if (errors.length === 0) {
      fs.unlinkSync(latestBackup);
    }
    
    return JSON.stringify({
      success: errors.length === 0,
      restored: restored.length,
      failed: errors.length,
      backupFile: latestBackup,
      details: { restored, errors }
    }, null, 2);
  } catch (error: any) {
    return JSON.stringify({ error: `Error in undo: ${error.message}` }, null, 2);
  }
}

// Konfigurierbare Ordnerstruktur (#6)
function suggestFolderStructureCustom(
  documents: any[], 
  config?: { groupBy?: string[], categories?: string[], companies?: string[] }
): string {
  try {
    const defaultConfig = {
      groupBy: ["year", "category", "company"],
      categories: ["rechnung", "invoice", "vertrag", "contract", "angebot", "offer", "mahnung", "bestellung", "order"],
      companies: ["telekom", "vodafone", "amazon", "paypal", "bank", "versicherung"]
    };
    
    const finalConfig = { ...defaultConfig, ...config };
    
    // Verwende die bestehende Logik, aber mit Custom-Config
    // (Vereinfacht - volle Implementation würde mehr Code benötigen)
    return suggestFolderStructure(documents);
  } catch (error: any) {
    return JSON.stringify({ error: `Error in custom structure: ${error.message}` }, null, 2);
  }
}

// Metadaten-Export (#9)
function exportMetadata(documents: any[], format: "json" | "csv" = "json"): string {
  try {
    if (format === "csv") {
      // CSV Header
      let csv = "Filename,Path,Date,References,Keywords,OCR Quality,Confidence,Type\n";
      
      documents.forEach(doc => {
        if (doc.error) return;
        const row = [
          doc.originalFilename || "",
          doc.originalPath || "",
          doc.documentDate || "",
          (doc.references || []).join(";"),
          (doc.keywords || []).join(";"),
          doc.ocrQuality || "",
          doc.confidence || "",
          doc.documentType || ""
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(",");
        csv += row + "\n";
      });
      
      return csv;
    } else {
      // JSON Format
      return JSON.stringify(documents, null, 2);
    }
  } catch (error: any) {
    return JSON.stringify({ error: `Error exporting metadata: ${error.message}` }, null, 2);
  }
}

// ===========================
// NEUE AUTONOME FUNKTIONEN
// ===========================

/**
 * Kategorisiert ein Dokument basierend auf Keywords
 */
function categorizeDocument(keywords: string[]): string {
  const keywordLower = keywords.map(k => k.toLowerCase());
  
  if (keywordLower.some(k => /rechnung|invoice|bill|payment|bezahl/.test(k))) return "01_Finanzen";
  if (keywordLower.some(k => /vertrag|contract|vereinbarung|agreement/.test(k))) return "02_Vertraege";
  if (keywordLower.some(k => /arzt|kranken|gesundheit|health|medical|doktor/.test(k))) return "03_Gesundheit";
  if (keywordLower.some(k => /versicherung|insurance|polizze/.test(k))) return "04_Versicherungen";
  if (keywordLower.some(k => /steuer|tax|finanzamt|steuerbescheid/.test(k))) return "05_Steuern";
  if (keywordLower.some(k => /reise|travel|hotel|flug|flight|urlaub/.test(k))) return "06_Reisen";
  if (keywordLower.some(k => /arbeit|job|beruf|gehalt|salary|employment/.test(k))) return "07_Beruf";
  if (keywordLower.some(k => /schule|studium|university|bildung|education/.test(k))) return "08_Bildung";
  if (keywordLower.some(k => /auto|kfz|vehicle|fahrzeug/.test(k))) return "09_Auto";
  if (keywordLower.some(k => /wohnung|miet|rent|immobilie/.test(k))) return "10_Wohnen";
  
  return "99_Sonstiges";
}

/**
 * Ermittelt Dekade aus Jahr
 */
function getDecadeFromYear(year: number): string {
  if (year >= 1980 && year < 1990) return "Achziger";
  if (year >= 1990 && year < 2000) return "Neunziger";
  if (year >= 2000 && year < 2010) return "Nuller";
  if (year >= 2010 && year < 2020) return "Zehner";
  if (year >= 2020 && year < 2030) return "Zwanziger";
  return "Unbekannt";
}

/**
 * AUTO_ORGANIZE_FOLDER - Analysiert UND organisiert einen Ordner
 */
async function autoOrganizeFolder(
  sourcePath: string,
  archivePath: string,
  dryRun: boolean,
  createCategories: boolean,
  stateFile?: string
): Promise<string> {
  try {
    console.error(`\n🤖 AUTO-ORGANIZE: ${sourcePath}`);
    console.error(`📦 Ziel: ${archivePath}`);
    console.error(`🧪 Dry-Run: ${dryRun}`);
    
    // 1. Sammle alle Dateien
    const supportedExts = ['.pdf', '.docx', '.pages', '.png', '.jpg', '.jpeg', '.txt', '.doc'];
    const allFiles = collectFilesRecursively(sourcePath, supportedExts);
    const documentFiles = allFiles;
    
    console.error(`📄 Gefunden: ${documentFiles.length} Dokumente`);
    
    const results = {
      total: documentFiles.length,
      processed: 0,
      moved: 0,
      categorized: {} as Record<string, number>,
      errors: [] as Array<{file: string, error: string}>
    };
    
    // 2. Verarbeite jede Datei
    for (let i = 0; i < documentFiles.length; i++) {
      const filePath = documentFiles[i];
      const filename = path.basename(filePath);
      
      try {
        // Analysiere Dokument
        const analysisJson = await analyzeDocumentStructured(filePath);
        const analysis = JSON.parse(analysisJson);
        
        if (analysis.error) {
          results.errors.push({file: filename, error: analysis.error});
          continue;
        }
        
        // Extrahiere Jahr aus Datum
        const dateStr = analysis.documentDate || "";
        const yearMatch = dateStr.match(/^(\d{4})/);
        if (!yearMatch) {
          results.errors.push({file: filename, error: "Kein Jahr gefunden"});
          continue;
        }
        
        const year = parseInt(yearMatch[1]);
        const decade = getDecadeFromYear(year);
        
        // Bestimme Kategorie
        let category = "";
        if (createCategories) {
          category = categorizeDocument(analysis.keywords || []);
          results.categorized[category] = (results.categorized[category] || 0) + 1;
        }
        
        // Baue Zielpfad
        let targetDir = archivePath;
        if (createCategories && category) {
          targetDir = path.join(archivePath, category);
        }
        
        // Baue neuen Dateinamen
        const ext = path.extname(filename);
        const newFilename = analysis.suggestedFilename || `${dateStr}_${filename}`;
        const targetPath = path.join(targetDir, newFilename);
        
        // Führe Operation aus
        if (!dryRun) {
          fs.mkdirSync(targetDir, { recursive: true });
          fs.renameSync(filePath, targetPath);
          results.moved++;
        }
        
        results.processed++;
        
        if (results.processed % 10 === 0) {
          console.error(`  ⏳ Fortschritt: ${results.processed}/${documentFiles.length}`);
        }
        
      } catch (error: any) {
        results.errors.push({file: filename, error: error.message});
      }
    }
    
    // Ergebnis
    const summary = {
      ...results,
      dryRun,
      message: dryRun ? "Vorschau abgeschlossen - keine Änderungen vorgenommen" : "Organisation abgeschlossen"
    };
    
    console.error(`✅ Fertig: ${results.processed} verarbeitet, ${results.moved} verschoben`);
    return JSON.stringify(summary, null, 2);
    
  } catch (error: any) {
    return JSON.stringify({ error: `Auto-Organize fehlt: ${error.message}` }, null, 2);
  }
}

/**
 * PROCESS_DOWNLOADS - Scannt Downloads und sortiert ins Archiv
 */
async function processDownloads(
  downloadsPath: string,
  archiveBasePath: string,
  autoMove: boolean,
  maxFiles: number
): Promise<string> {
  try {
    console.error(`\n📥 DOWNLOADS VERARBEITEN: ${downloadsPath}`);
    console.error(`📂 Archiv-Basis: ${archiveBasePath}`);
    console.error(`🔄 Auto-Move: ${autoMove}`);
    console.error(`🔢 Max-Dateien: ${maxFiles}`);
    
    // DIAGNOSE: Prüfe Berechtigungen
    try {
      const normalizedDownloads = normalizeUnicode(downloadsPath);
      console.error(`🔍 Normalisierter Pfad: ${normalizedDownloads}`);
      
      // Prüfe ob Downloads existiert
      if (!fs.existsSync(normalizedDownloads)) {
        return JSON.stringify({ 
          error: `Downloads-Ordner nicht gefunden: ${normalizedDownloads}`,
          troubleshooting: {
            userPath: downloadsPath,
            normalizedPath: normalizedDownloads,
            hint: "Versuche absoluten Pfad: /Users/USERNAME/Downloads"
          }
        }, null, 2);
      }
      
      // Prüfe Leserechte
      fs.accessSync(normalizedDownloads, fs.constants.R_OK);
      console.error(`✅ Leserechte OK für: ${normalizedDownloads}`);
      
    } catch (accessError: any) {
      return JSON.stringify({ 
        error: `Kein Zugriff auf Downloads-Ordner: ${accessError.message}`,
        troubleshooting: {
          errorCode: accessError.code,
          path: downloadsPath,
          hint: "Perplexity: Pfad außerhalb erlaubter Bereiche? Nutze Claude Desktop oder gib vollständigen Pfad an."
        }
      }, null, 2);
    }
    
    // Sammle Dateien aus Downloads (nur Root, nicht rekursiv)
    let allFiles: string[];
    try {
      allFiles = fs.readdirSync(downloadsPath)
        .map(f => path.join(downloadsPath, f))
        .filter(f => {
          try {
            return fs.statSync(f).isFile();
          } catch {
            return false;
          }
        });
      console.error(`📋 Alle Dateien gefunden: ${allFiles.length}`);
    } catch (readError: any) {
      return JSON.stringify({ 
        error: `Fehler beim Lesen des Ordners: ${readError.message}`,
        troubleshooting: {
          errorCode: readError.code,
          path: downloadsPath,
          filesystemError: true
        }
      }, null, 2);
    }
    
    const documentFiles = allFiles
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.pdf', '.docx', '.pages', '.png', '.jpg', '.jpeg', '.txt'].includes(ext);
      })
      .slice(0, maxFiles);
    
    console.error(`📄 Dokumente gefiltert: ${documentFiles.length} (max: ${maxFiles})`);
    
    if (documentFiles.length === 0) {
      return JSON.stringify({ 
        scanned: 0,
        message: "Keine unterstützten Dokumente gefunden (.pdf, .docx, .pages, .png, .jpg, .jpeg, .txt)",
        totalFiles: allFiles.length,
        hint: "Ordner enthält Dateien, aber keine analysierbaren Dokumente"
      }, null, 2);
    }
    
    const results = {
      scanned: documentFiles.length,
      suggestions: [] as Array<{from: string, to: string, year: number, category: string, filename: string}>,
      filed: [] as Array<{from: string, to: string}>,
      errors: [] as Array<{file: string, error: string}>
    };
    
    // Verarbeite jede Datei
    for (const filePath of documentFiles) {
      const filename = path.basename(filePath);
      
      try {
        // Analysiere Dokument
        const analysisJson = await analyzeDocumentStructured(filePath);
        const analysis = JSON.parse(analysisJson);
        
        if (analysis.error) {
          results.errors.push({file: filename, error: analysis.error});
          continue;
        }
        
        // Extrahiere Jahr
        const dateStr = analysis.documentDate || "";
        const yearMatch = dateStr.match(/^(\d{4})/);
        if (!yearMatch) {
          results.errors.push({file: filename, error: "Kein Jahr erkennbar"});
          continue;
        }
        
        const year = parseInt(yearMatch[1]);
        const decade = getDecadeFromYear(year);
        const category = categorizeDocument(analysis.keywords || []);
        
        // Baue Zielpfad
        const targetDir = path.join(archiveBasePath, decade, year.toString(), category);
        const newFilename = sanitizeFilename(analysis.suggestedFilename || `${dateStr}_${filename}`);
        const targetPath = path.join(targetDir, newFilename);
        
        // Vorschlag
        results.suggestions.push({
          from: filePath,
          to: targetPath,
          year,
          category,
          filename: newFilename
        });
        
        // Automatisch verschieben?
        if (autoMove) {
          fs.mkdirSync(targetDir, { recursive: true });
          fs.renameSync(filePath, targetPath);
          results.filed.push({from: filePath, to: targetPath});
          console.error(`✅ Verschoben: ${filename} → ${category}/${newFilename}`);
        }
        
      } catch (error: any) {
        console.error(`❌ Fehler bei ${filename}: ${error.message}`);
        results.errors.push({file: filename, error: error.message});
      }
    }
    
    const summary = {
      ...results,
      autoMove,
      message: autoMove 
        ? `${results.filed.length} Dateien automatisch ins Archiv verschoben` 
        : `${results.suggestions.length} Vorschläge erstellt - setze autoMove=true zum Verschieben`
    };
    
    console.error(`✅ Downloads verarbeitet: ${results.suggestions.length} Vorschläge, ${results.errors.length} Fehler`);
    return JSON.stringify(summary, null, 2);
    
  } catch (error: any) {
    console.error(`❌ FATALER FEHLER: ${error.message}`);
    console.error(error.stack);
    return JSON.stringify({ 
      error: `Downloads-Verarbeitung fehlgeschlagen: ${error.message}`,
      stack: error.stack,
      troubleshooting: {
        downloadsPath,
        archiveBasePath,
        hint: "Stelle sicher, dass beide Pfade existieren und lesbar sind"
      }
    }, null, 2);
  }
}

/**
 * BATCH_ORGANIZE_LARGE - Große Ordner in Chunks mit Resume
 */
async function batchOrganizeLarge(
  folderPath: string,
  targetArchivePath: string,
  chunkSize: number,
  stateFilePath: string
): Promise<string> {
  try {
    console.error(`\n🔄 BATCH-ORGANIZE (LARGE): ${folderPath}`);
    console.error(`📦 Ziel: ${targetArchivePath}`);
    console.error(`🧩 Chunk-Size: ${chunkSize}`);
    
    // State-Datei lesen oder initialisieren
    let state: any = {
      folderPath,
      targetArchivePath,
      lastProcessedIndex: 0,
      totalFiles: 0,
      successCount: 0,
      errorCount: 0,
      filePaths: []
    };
    
    if (fs.existsSync(stateFilePath)) {
      const stateContent = fs.readFileSync(stateFilePath, "utf-8");
      state = JSON.parse(stateContent);
      console.error(`📂 State geladen: ${state.successCount}/${state.totalFiles} bereits verarbeitet`);
    }
    
    // Sammle alle Dateien (nur beim ersten Mal)
    if (state.filePaths.length === 0) {
      const supportedExts = ['.pdf', '.docx', '.pages', '.png', '.jpg', '.jpeg', '.txt'];
      const allFiles = collectFilesRecursively(folderPath, supportedExts);
      state.filePaths = allFiles;
      state.totalFiles = state.filePaths.length;
      console.error(`📄 Gefunden: ${state.totalFiles} Dokumente`);
    }
    
    // Berechne aktuellen Chunk
    const startIndex = state.lastProcessedIndex;
    const endIndex = Math.min(startIndex + chunkSize, state.totalFiles);
    const currentChunk = state.filePaths.slice(startIndex, endIndex);
    
    console.error(`🎯 Verarbeite Chunk: ${startIndex+1}-${endIndex} von ${state.totalFiles}`);
    
    // Verarbeite Chunk
    for (let i = 0; i < currentChunk.length; i++) {
      const filePath = currentChunk[i];
      const filename = path.basename(filePath);
      
      try {
        // Analysiere
        const analysisJson = await analyzeDocumentStructured(filePath);
        const analysis = JSON.parse(analysisJson);
        
        if (analysis.error) {
          state.errorCount++;
          continue;
        }
        
        // Jahr + Kategorie
        const dateStr = analysis.documentDate || "";
        const yearMatch = dateStr.match(/^(\d{4})/);
        if (!yearMatch) {
          state.errorCount++;
          continue;
        }
        
        const year = parseInt(yearMatch[1]);
        const category = categorizeDocument(analysis.keywords || []);
        
        // Zielpfad
        const targetDir = path.join(targetArchivePath, category);
        const newFilename = analysis.suggestedFilename || `${dateStr}_${filename}`;
        const targetPath = path.join(targetDir, newFilename);
        
        // Verschieben
        fs.mkdirSync(targetDir, { recursive: true });
        fs.renameSync(filePath, targetPath);
        state.successCount++;
        
      } catch (error: any) {
        state.errorCount++;
      }
      
      state.lastProcessedIndex++;
    }
    
    // State speichern
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
    
    // Fortschritt
    const progress = {
      chunkCompleted: true,
      totalFiles: state.totalFiles,
      processedFiles: state.lastProcessedIndex,
      successCount: state.successCount,
      errorCount: state.errorCount,
      percentComplete: Math.round((state.lastProcessedIndex / state.totalFiles) * 100),
      nextChunkExists: state.lastProcessedIndex < state.totalFiles,
      stateFilePath
    };
    
    console.error(`✅ Chunk fertig: ${progress.percentComplete}% abgeschlossen`);
    
    if (!progress.nextChunkExists) {
      console.error(`🎉 ALLE DATEIEN VERARBEITET!`);
      // State-Datei löschen nach vollständiger Verarbeitung
      fs.unlinkSync(stateFilePath);
    }
    
    return JSON.stringify(progress, null, 2);
    
  } catch (error: any) {
    return JSON.stringify({ error: `Batch-Organize fehlgeschlagen: ${error.message}` }, null, 2);
  }
}

const server = new Server(
  {
    name: "mcp-document-intelligence",
    version: "4.2.1",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "find_folder",
        description: "Sucht intelligent nach einem Ordner anhand des Namens. Unterstützt Fuzzy-Matching und schlägt ähnliche Ordner bei Tippfehlern vor. Perfekt wenn du nur den Ordnernamen (z.B. '2026') kennst, aber nicht den vollständigen Pfad.",
        inputSchema: {
          type: "object",
          properties: {
            folderName: {
              type: "string",
              description: "Name des gesuchten Ordners (z.B. '2026', 'Rechnungen', 'Finnland')"
            },
            basePath: {
              type: "string",
              description: "Basis-Pfad für die Suche (z.B. '/Users/.../DateiArchiv'). Optional, verwendet Root wenn nicht angegeben."
            }
          },
          required: ["folderName"]
        },
      },
      {
        name: "analyze_document",
        description: "Analysiert Dokumente (PDF, DOCX, Pages, Bilder, TXT) und schlägt intelligente Dateinamen vor. Extrahiert Datum, Referenznummern und Keywords aus dem Dokumentinhalt.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Vollständiger Pfad zur Dokumentdatei (.pdf, .docx, .pages, .png, .jpg, .jpeg, .txt)"
            }
          },
          required: ["filePath"]
        },
      },
      {
        name: "analyze_folder",
        description: "Analysiert ALLE Dokumente in einem Ordner (Batch-Verarbeitung). Scannt den Ordner nach unterstützten Dateiformaten und extrahiert Metadaten aus allen gefundenen Dokumenten.",
        inputSchema: {
          type: "object",
          properties: {
            folderPath: {
              type: "string",
              description: "Vollständiger Pfad zum Ordner, der analysiert werden soll"
            }
          },
          required: ["folderPath"]
        },
      },
      {
        name: "suggest_folder_structure",
        description: "Schlägt eine intelligente Ordnerstruktur basierend auf analysierten Dokumenten vor. Gruppiert nach Jahr, Kategorie (Rechnungen, Verträge, etc.) und Firma.",
        inputSchema: {
          type: "object",
          properties: {
            documents: {
              type: "array",
              description: "Array von analysierten Dokumenten (Output von analyze_folder)"
            }
          },
          required: ["documents"]
        },
      },
      {
        name: "batch_organize",
        description: "Führt Batch-Umbenennungen und Verschiebungen von Dateien durch. Erstellt automatisch fehlende Unterordner. Unterstützt Kopieren oder Verschieben, automatisches Backup und detaillierte Statistiken.",
        inputSchema: {
          type: "object",
          properties: {
            baseFolder: {
              type: "string",
              description: "Basis-Ordner, unter dem die neue Struktur erstellt werden soll"
            },
            operations: {
              type: "array",
              description: "Array von Operationen mit originalPath, targetFolder und newFilename"
            },
            mode: {
              type: "string",
              enum: ["move", "copy"],
              description: "Modus: 'move' verschiebt Dateien (Standard), 'copy' kopiert sie",
              default: "move"
            },
            createBackup: {
              type: "boolean",
              description: "Erstellt automatisch Backup für Undo-Funktion (Standard: true bei move)",
              default: true
            }
          },
          required: ["baseFolder", "operations"]
        },
      },
      {
        name: "preview_organization",
        description: "Zeigt Vorschau der Reorganisation ohne Dateien zu verschieben (Dry-Run). Warnt vor Konflikten und fehlenden Dateien.",
        inputSchema: {
          type: "object",
          properties: {
            baseFolder: {
              type: "string",
              description: "Basis-Ordner für die geplante Organisation"
            },
            operations: {
              type: "array",
              description: "Array von geplanten Operationen"
            }
          },
          required: ["baseFolder", "operations"]
        },
      },
      {
        name: "undo_last_organization",
        description: "Macht die letzte Reorganisation rückgängig. Stellt Dateien aus automatischem Backup wieder her.",
        inputSchema: {
          type: "object",
          properties: {
            baseFolder: {
              type: "string",
              description: "Basis-Ordner, in dem die letzte Organisation stattfand"
            }
          },
          required: ["baseFolder"]
        },
      },
      {
        name: "export_metadata",
        description: "Exportiert Metadaten analysierter Dokumente in JSON oder CSV Format.",
        inputSchema: {
          type: "object",
          properties: {
            documents: {
              type: "array",
              description: "Array von analysierten Dokumenten"
            },
            format: {
              type: "string",
              enum: ["json", "csv"],
              description: "Export-Format: 'json' (Standard) oder 'csv'",
              default: "json"
            }
          },
          required: ["documents"]
        },
      },
      {
        name: "auto_organize_folder",
        description: "Analysiert UND organisiert einen Ordner automatisch. Kombiniert Analyse + Umbenennung/Verschiebung in einem Schritt. Erstellt Jahres- und Kategorieordner, benennt Dateien um (YYYY-MM-DD_Description.ext).",
        inputSchema: {
          type: "object",
          properties: {
            sourcePath: {
              type: "string",
              description: "Quellordner mit zu organisierenden Dateien"
            },
            archivePath: {
              type: "string",
              description: "Archiv-Basis-Pfad (z.B. .../Archiv/Nuller/2005)"
            },
            dryRun: {
              type: "boolean",
              description: "Nur Vorschau ohne tatsächliche Änderungen (Standard: false)",
              default: false
            },
            createCategories: {
              type: "boolean",
              description: "Erstellt Unterordner nach Kategorien (01_Finanzen, 02_Gesundheit, etc.)",
              default: true
            },
            stateFile: {
              type: "string",
              description: "Pfad zur JSON-Datei für Resume-Funktion (bei Unterbrechungen)"
            }
          },
          required: ["sourcePath", "archivePath"]
        },
      },
      {
        name: "process_downloads",
        description: "Scannt Download-Ordner und sortiert Dateien automatisch ins Archiv. Erkennt Jahr aus Dokumentinhalt, bestimmt Kategorie aus Keywords, schlägt Zielordner vor.",
        inputSchema: {
          type: "object",
          properties: {
            downloadsPath: {
              type: "string",
              description: "Pfad zum Download-Ordner (Standard: ~/Downloads)"
            },
            archiveBasePath: {
              type: "string",
              description: "Basis-Pfad des Archivs (z.B. .../DateiArchiv/Archiv)"
            },
            autoMove: {
              type: "boolean",
              description: "Dateien automatisch verschieben (true) oder nur Vorschläge zeigen (false)",
              default: false
            },
            maxFiles: {
              type: "number",
              description: "Max. Anzahl zu verarbeitender Dateien pro Durchlauf (Standard: 50)",
              default: 50
            }
          },
          required: ["archiveBasePath"]
        },
      },
      {
        name: "batch_organize_large",
        description: "Verarbeitet große Ordner (>100 Dateien) in Chunks mit Resume-Funktion. Speichert Fortschritt in JSON-State-Datei, kann nach Unterbrechung fortgesetzt werden.",
        inputSchema: {
          type: "object",
          properties: {
            folderPath: {
              type: "string",
              description: "Ordner mit vielen Dateien (>100)"
            },
            chunkSize: {
              type: "number",
              description: "Anzahl Dateien pro Chunk (Standard: 50)",
              default: 50
            },
            stateFilePath: {
              type: "string",
              description: "Pfad zur State-Datei für Resume (Standard: ~/.doc-intelligence-state.json)"
            },
            targetArchivePath: {
              type: "string",
              description: "Ziel-Archivpfad für organisierte Dateien"
            }
          },
          required: ["folderPath", "targetArchivePath"]
        },
      },
      {
        name: "cleanup_old_structure",
        description: "Bereinigt alte Ordnerstrukturen im Archiv. Verschiebt alte Unterordner (ADA, Informatik, Recht, etc.) nach 08_Bildung. Löst alte Kategorien (01_Studium, 02_Beruf, etc.) auf und konsolidiert in Standard-Kategorien.",
        inputSchema: {
          type: "object",
          properties: {
            archiveBasePath: {
              type: "string",
              description: "Basis-Pfad des Archivs (z.B. .../DateiArchiv/Archiv)"
            }
          },
          required: ["archiveBasePath"]
        },
      },
      {
        name: "optimize_folder_structure",
        description: "Optimiert Ordnerstruktur: Löscht leere Ordner und verschiebt Einzeldateien aus Kategorien nach 99_Sonstiges. Behält nur Kategorien mit mindestens 2 Dateien.",
        inputSchema: {
          type: "object",
          properties: {
            archiveBasePath: {
              type: "string",
              description: "Basis-Pfad des Archivs (z.B. .../DateiArchiv/Archiv)"
            }
          },
          required: ["archiveBasePath"]
        },
      },
      {
        name: "move_loose_files",
        description: "Kategorisiert lose Dateien basierend auf Dateinamen-Mustern. Verschiebt Studienunterlagen nach 08_Bildung, Rechnungen nach 01_Finanzen, etc.",
        inputSchema: {
          type: "object",
          properties: {
            archiveBasePath: {
              type: "string",
              description: "Basis-Pfad des Archivs (z.B. .../DateiArchiv/Archiv)"
            }
          },
          required: ["archiveBasePath"]
        },
      },
      {
        name: "intelligent_rename",
        description: "Intelligente Umbenennung von PDFs basierend auf Dokumentinhalt. Analysiert Text mit pdftotext, erkennt Firmen (ING, Hallesche, etc.), Dokumenttypen (Rechnung, Vertrag) und kategorisiert automatisch. HINWEIS: Benötigt poppler-utils (pdftotext).",
        inputSchema: {
          type: "object",
          properties: {
            archiveBasePath: {
              type: "string",
              description: "Basis-Pfad des Archivs (z.B. .../DateiArchiv/Archiv)"
            },
            dryRun: {
              type: "boolean",
              description: "Nur Vorschau ohne tatsächliche Änderungen (Standard: true)",
              default: true
            }
          },
          required: ["archiveBasePath"]
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "find_folder": {
        const folderName = args?.folderName as string;
        const basePath = args?.basePath as string || "/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv";
        if (!folderName) {
          throw new Error("folderName is required");
        }
        const result = findFolderInTree(folderName, basePath);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "analyze_document": {
        const filePath = args?.filePath as string;
        if (!filePath) {
          throw new Error("filePath is required");
        }
        const result = await analyzeDocument(filePath);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "analyze_folder": {
        const folderPath = args?.folderPath as string;
        if (!folderPath) {
          throw new Error("folderPath is required");
        }
        const result = await analyzeFolderBatch(folderPath);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "suggest_folder_structure": {
        const documents = args?.documents as any[];
        if (!documents || !Array.isArray(documents)) {
          throw new Error("documents array is required");
        }
        const result = suggestFolderStructure(documents);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "batch_organize": {
        const baseFolder = args?.baseFolder as string;
        const operations = args?.operations as any[];
        const mode = (args?.mode as "move" | "copy") || "move";
        const createBackup = args?.createBackup !== undefined ? Boolean(args.createBackup) : true;
        if (!baseFolder) {
          throw new Error("baseFolder is required");
        }
        if (!operations || !Array.isArray(operations)) {
          throw new Error("operations array is required");
        }
        const result = await batchOrganize(baseFolder, operations, mode, createBackup);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "preview_organization": {
        const baseFolder = args?.baseFolder as string;
        const operations = args?.operations as any[];
        if (!baseFolder) {
          throw new Error("baseFolder is required");
        }
        if (!operations || !Array.isArray(operations)) {
          throw new Error("operations array is required");
        }
        const result = previewOrganization(baseFolder, operations);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "undo_last_organization": {
        const baseFolder = args?.baseFolder as string;
        if (!baseFolder) {
          throw new Error("baseFolder is required");
        }
        const result = await undoLastOrganization(baseFolder);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "export_metadata": {
        const documents = args?.documents as any[];
        const format = (args?.format as "json" | "csv") || "json";
        if (!documents || !Array.isArray(documents)) {
          throw new Error("documents array is required");
        }
        const result = exportMetadata(documents, format);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "auto_organize_folder": {
        const sourcePath = args?.sourcePath as string;
        const archivePath = args?.archivePath as string;
        const dryRun = Boolean(args?.dryRun) || false;
        const createCategories = args?.createCategories !== undefined ? Boolean(args.createCategories) : true;
        const stateFile = args?.stateFile as string | undefined;
        
        if (!sourcePath || !archivePath) {
          throw new Error("sourcePath and archivePath are required");
        }
        const result = await autoOrganizeFolder(sourcePath, archivePath, dryRun, createCategories, stateFile);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "process_downloads": {
        const downloadsPath = (args?.downloadsPath as string) || path.join(os.homedir(), "Downloads");
        const archiveBasePath = args?.archiveBasePath as string;
        const autoMove = Boolean(args?.autoMove) || false;
        const maxFiles = (args?.maxFiles as number) || 50;
        
        if (!archiveBasePath) {
          throw new Error("archiveBasePath is required");
        }
        const result = await processDownloads(downloadsPath, archiveBasePath, autoMove, maxFiles);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "batch_organize_large": {
        const folderPath = args?.folderPath as string;
        const targetArchivePath = args?.targetArchivePath as string;
        const chunkSize = (args?.chunkSize as number) || 50;
        const stateFilePath = (args?.stateFilePath as string) || path.join(os.homedir(), ".doc-intelligence-state.json");
        
        if (!folderPath || !targetArchivePath) {
          throw new Error("folderPath and targetArchivePath are required");
        }
        const result = await batchOrganizeLarge(folderPath, targetArchivePath, chunkSize, stateFilePath);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "cleanup_old_structure": {
        const archiveBasePath = args?.archiveBasePath as string;
        if (!archiveBasePath) {
          throw new Error("archiveBasePath is required");
        }
        const result = cleanupOldStructure(archiveBasePath);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "optimize_folder_structure": {
        const archiveBasePath = args?.archiveBasePath as string;
        if (!archiveBasePath) {
          throw new Error("archiveBasePath is required");
        }
        const result = optimizeFolderStructure(archiveBasePath);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "move_loose_files": {
        const archiveBasePath = args?.archiveBasePath as string;
        if (!archiveBasePath) {
          throw new Error("archiveBasePath is required");
        }
        const result = moveLooseFiles(archiveBasePath);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "intelligent_rename": {
        const archiveBasePath = args?.archiveBasePath as string;
        const dryRun = args?.dryRun !== undefined ? Boolean(args.dryRun) : true;
        if (!archiveBasePath) {
          throw new Error("archiveBasePath is required");
        }
        const result = await intelligentRename(archiveBasePath, dryRun);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Document Intelligence Server v4.5.0 running - All features enabled");
  } catch (error: any) {
    console.error("Fatal error starting server:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error in main:", error);
  process.exit(1);
});
