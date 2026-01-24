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

const server = new Server(
  {
    name: "mcp-document-intelligence",
    version: "2.0.0",
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
  console.error("MCP Document Intelligence Server v2.0 running - Multi-format support enabled");
}

main().catch(console.error);
