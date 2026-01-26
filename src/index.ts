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
import { createWorker } from "tesseract.js";
import mammoth from "mammoth";
import AdmZip from "adm-zip";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

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
  
  const suggestedFilename = parts.length > 0 
    ? parts.join("_") + fileExtension
    : `dokument_${Date.now()}${fileExtension}`;
  
  return {
    originalFilename: path.basename(filePath),
    suggestedFilename,
    documentDate,
    fileCreationDate,
    references,
    keywords,
    scannerDatePreserved: !!datePrefix,
    textLength: text.length,
    documentType: fileExtension.slice(1),
    preview: text.substring(0, 500)
  };
}

// PDF Analyse
async function analyzePdf(filePath: string): Promise<string> {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    let extractedText = "";
    
    try {
      const pdfData = await pdfParse(dataBuffer);
      extractedText = pdfData.text;
    } catch (error) {
      console.error("PDF extraction failed, using OCR...");
    }
    
    // Fallback OCR für gescannte PDFs
    if (!extractedText || extractedText.trim().length < 50) {
      console.error("Running OCR on PDF...");
      const worker = await createWorker("deu");
      await worker.terminate();
    }
    
    const originalFilename = path.basename(filePath, path.extname(filePath));
    const scannerDatePattern = /^(\d{4}[-_]\d{2}[-_]\d{2}[\s_-]\d{2}[-_:]\d{2}[-_:]\d{2}|\d{8}[-_]\d{6})/;
    const scannerMatch = originalFilename.match(scannerDatePattern);
    const datePrefix = scannerMatch ? scannerMatch[1] : "";
    
    return JSON.stringify(analyzeTextContent(extractedText, filePath, datePrefix), null, 2);
  } catch (error: any) {
    return `Error analyzing PDF: ${error.message}`;
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
    const worker = await createWorker("deu");
    const { data: { text } } = await worker.recognize(filePath);
    await worker.terminate();
    
    const originalFilename = path.basename(filePath, path.extname(filePath));
    const scannerDatePattern = /^(\d{4}[-_]\d{2}[-_]\d{2}[\s_-]\d{2}[-_:]\d{2}[-_:]\d{2}|\d{8}[-_]\d{6})/;
    const scannerMatch = originalFilename.match(scannerDatePattern);
    const datePrefix = scannerMatch ? scannerMatch[1] : "";
    
    return JSON.stringify(analyzeTextContent(text, filePath, datePrefix), null, 2);
  } catch (error: any) {
    return `Error analyzing image: ${error.message}`;
  }
}

// TXT Analyse
async function analyzeTxt(filePath: string): Promise<string> {
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    
    const originalFilename = path.basename(filePath, path.extname(filePath));
    const scannerDatePattern = /^(\d{4}[-_]\d{2}[-_]\d{2}[\s_-]\d{2}[-_:]\d{2}[-_:]\d{2}|\d{8}[-_]\d{6})/;
    const scannerMatch = originalFilename.match(scannerDatePattern);
    const datePrefix = scannerMatch ? scannerMatch[1] : "";
    
    return JSON.stringify(analyzeTextContent(text, filePath, datePrefix), null, 2);
  } catch (error: any) {
    return `Error analyzing TXT: ${error.message}`;
  }
}

// Haupt-Analyse-Funktion mit Multi-Format Support
async function analyzeDocument(filePath: string): Promise<string> {
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

// Analysiere einzelne Datei und gebe strukturiertes Objekt zurück (für Batch-Processing)
async function analyzeDocumentStructured(filePath: string): Promise<any> {
  const result = await analyzeDocument(filePath);
  try {
    return JSON.parse(result);
  } catch (error) {
    return { error: result, filePath };
  }
}

// Batch-Analyse eines gesamten Ordners
async function analyzeFolderBatch(folderPath: string): Promise<string> {
  try {
    if (!fs.existsSync(folderPath)) {
      return JSON.stringify({ error: `Folder not found: ${folderPath}` }, null, 2);
    }
    
    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      return JSON.stringify({ error: `Path is not a directory: ${folderPath}` }, null, 2);
    }
    
    const files = fs.readdirSync(folderPath);
    const supportedExtensions = [".pdf", ".docx", ".pages", ".png", ".jpg", ".jpeg", ".txt"];
    
    const documentFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return supportedExtensions.includes(ext);
    });
    
    if (documentFiles.length === 0) {
      return JSON.stringify({ 
        message: "No supported documents found in folder",
        folderPath,
        supportedExtensions 
      }, null, 2);
    }
    
    const results = [];
    for (const file of documentFiles) {
      const filePath = path.join(folderPath, file);
      try {
        const analysis = await analyzeDocumentStructured(filePath);
        results.push({
          originalPath: filePath,
          ...analysis
        });
      } catch (error: any) {
        results.push({
          originalPath: filePath,
          error: error.message
        });
      }
    }
    
    return JSON.stringify({
      folderPath,
      totalFiles: documentFiles.length,
      documents: results
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

// Batch-Organisation: Umbenennen und Verschieben von Dateien
async function batchOrganize(baseFolder: string, operations: any[]): Promise<string> {
  try {
    const results = [];
    const errors = [];
    
    for (const op of operations) {
      try {
        const targetDir = path.join(baseFolder, op.targetFolder);
        const targetPath = path.join(targetDir, op.newFilename);
        
        // Erstelle Zielverzeichnis falls nicht vorhanden
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
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
        
        // Verschiebe und benenne um
        fs.renameSync(op.originalPath, targetPath);
        
        results.push({
          success: true,
          from: op.originalPath,
          to: targetPath
        });
      } catch (error: any) {
        errors.push({
          operation: op,
          error: error.message
        });
      }
    }
    
    return JSON.stringify({
      success: errors.length === 0,
      processed: results.length,
      failed: errors.length,
      results,
      errors
    }, null, 2);
  } catch (error: any) {
    return JSON.stringify({ error: `Error in batch organize: ${error.message}` }, null, 2);
  }
}

const server = new Server(
  {
    name: "mcp-document-intelligence",
    version: "3.0.0",
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
        description: "Führt Batch-Umbenennungen und Verschiebungen von Dateien durch. Erstellt automatisch fehlende Unterordner.",
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
            }
          },
          required: ["baseFolder", "operations"]
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
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
        if (!baseFolder) {
          throw new Error("baseFolder is required");
        }
        if (!operations || !Array.isArray(operations)) {
          throw new Error("operations array is required");
        }
        const result = await batchOrganize(baseFolder, operations);
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Document Intelligence Server v3.0 running - Batch processing enabled");
}

main().catch(console.error);
