#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import mammoth from "mammoth";
import AdmZip from "adm-zip";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "canvas";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

// Konstanten für Validierung
const MAX_FILENAME_LENGTH = 255;
const MAX_FILE_SIZE_MB = 50;
const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".pages", ".png", ".jpg", ".jpeg", ".txt"];

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
  const suggestedFilename = hasNewInfo && parts.length > 0 
    ? parts.join("_") + fileExtension
    : originalName;
  
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
    // Verwende pdftoppm (Teil von poppler-utils) um PDF in Bilder zu konvertieren
    // Falls nicht installiert: brew install poppler
    const tempDir = `/tmp/pdf-ocr-${Date.now()}`;
    fs.mkdirSync(tempDir, { recursive: true });
    
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
    
    // Cleanup
    execSync(`rm -rf "${tempDir}"`, { stdio: 'pipe' });
    
    return allText.join('\n\n');
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
    
    // ISO25010: Performance - Warn bei vielen Dateien
    if (documentFiles.length > 100) {
      console.error(`⚠️  Performance Warning: ${documentFiles.length} Dateien - kann lange dauern`);
    }
    
    if (documentFiles.length === 0) {
      return JSON.stringify({ 
        message: "No supported documents found in folder",
        folderPath,
        recursive,
        filters: { fileTypes, keywords },
        supportedExtensions 
      }, null, 2);
    }
    
    // ISO25010: Reliability - Limit für Stabilität
    const maxFiles = 500;
    if (documentFiles.length > maxFiles) {
      return JSON.stringify({
        error: `Too many files (${documentFiles.length}). Maximum: ${maxFiles}`,
        suggestion: "Use filters (fileTypes, keywords) or process subfolders separately",
        folderPath
      }, null, 2);
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
        if (documentFiles.length > 20 && processedCount % 10 === 0) {
          console.error(`📊 Progress: ${processedCount}/${documentFiles.length} Dateien`);
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

const server = new Server(
  {
    name: "mcp-document-intelligence",
    version: "4.2.0",
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
    console.error("MCP Document Intelligence Server v4.2.0 running - All features enabled");
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
