# MCP Document Intelligence Server

**Model Context Protocol Server with Advanced Batch Processing & Intelligent Document Organization**

🎯 **Designed for [Perplexity Desktop](https://www.perplexity.ai/) and [Claude Desktop](https://claude.ai/download)** – Supercharge your AI assistant with enterprise-grade document intelligence.

Fully automated document intelligence with advanced batch processing: Recursively scan folders, detect duplicates, extract metadata from PDFs, DOCX, Pages, images and text files (with OCR for scanned documents), preview changes before execution, backup/undo operations, export metadata, and automatically organize documents with intelligent folder structures.

[![MCP](https://img.shields.io/badge/MCP-1.0.4-blue)](https://github.com/modelcontextprotocol)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-4.0.1-green)](https://github.com/AndreasDietzel/mcp-document-intelligence)
[![Perplexity](https://img.shields.io/badge/Perplexity-Compatible-purple)](https://www.perplexity.ai/)
[![Claude](https://img.shields.io/badge/Claude-Compatible-orange)](https://claude.ai/)

---

## 🎯 Features

### 🚀 v4.0 - Enterprise Features
- **🔍 Recursive Scanning**: Deep folder analysis up to 10 levels
- **👥 Duplicate Detection**: SHA256-based file deduplication
- **👁️ Preview Mode**: Dry-run operations before execution
- **⏮️ Backup & Undo**: Automatic backups with one-click restore
- **📊 Metadata Export**: Export analysis results to JSON/CSV
- **🎯 Smart Filters**: Filter by file type and keywords
- **📋 Copy Mode**: Copy files instead of moving them
- **⚙️ Configurable Rules**: Custom folder organization patterns
- **🎨 OCR Quality Feedback**: Confidence scores for scanned documents
- **📈 Detailed Statistics**: Comprehensive operation summaries

### 📦 Batch Document Processing
- **Folder Scanning**: Analyze entire folders recursively in one operation
- **Batch Organization**: Rename and move multiple files automatically
- **Smart Folder Structure**: Auto-generate organized folder hierarchies
- **Workflow Automation**: Scan → Analyze → Preview → Organize → Undo

### �📄 Multi-Format Document Intelligence
- **Text Extraction**: Extract text from PDF, DOCX, Pages, Images, TXT
- **OCR Support**: Tesseract.js for scanned documents with quality scoring
- **Smart Filename Suggestions**: Automatically extracts:
  - Scanner timestamps (preserves existing `2024-01-24_14-30-45` format)
  - Document dates (DD.MM.YYYY, YYYY-MM-DD)
  - Reference numbers (Invoice#, Customer#, Order#, Contract#)
  - Keywords (Invoice, Contract, Company names)

---

## 🚀 Quick Start

### Prerequisites

You need one of these AI desktop clients:
- **[Perplexity Desktop App](https://www.perplexity.ai/)** (macOS/Windows)
- **[Claude Desktop App](https://claude.ai/download)** (macOS/Windows)

Both support the Model Context Protocol (MCP) for extending AI capabilities with custom tools.

### Installation

```bash
git clone https://github.com/AndreasDietzel/mcp-document-intelligence.git
cd mcp-document-intelligence
npm install
npm run build
```

### Configuration

Add to your MCP client configuration:

**For Perplexity Desktop:**
Location: `~/Library/Application Support/Perplexity/perplexity-config.json` (macOS)

```json
{
  "mcpServers": {
    "document-intelligence": {
      "command": "node",
      "args": ["/path/to/mcp-document-intelligence/build/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**For Claude Desktop:**
Location: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

```json
{
  "mcpServers": {
    "document-intelligence": {
      "command": "node",
      "args": ["/path/to/mcp-document-intelligence/build/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Restart your AI client** after updating the configuration.

### MCP Filesystem Integration

This server works best alongside the official [MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem), which provides file browsing and management capabilities to your AI assistant.

**Recommended Setup for Perplexity/Claude:**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/your/documents"
      ]
    },
    "document-intelligence": {
      "command": "node",
      "args": ["/path/to/mcp-document-intelligence/build/index.js"]
    }
  }
}
```

With both servers configured, you can:
1. **Ask your AI** to find documents in your folders (filesystem server)
2. **Analyze and organize** them automatically (document-intelligence server)
3. **Complete workflow** handled by natural conversation with Perplexity/Claude

---

## 📋 Available Tools

### `analyze_document`

Analyzes a single document and suggests an intelligent filename.

**Input:**
```json
{
  "filePath": "/path/to/document.pdf"
}
```

**Output Example:**
```json
{
  "originalFilename": "20240124_143045_scan.pdf",
  "suggestedFilename": "20240124_143045_RE-2024-1234_rechnung_telekom.pdf",
  "documentDate": "24.01.2024",
  "references": ["RE-2024-1234"],
  "keywords": ["rechnung", "telekom"],
  "scannerDatePreserved": true,
  "textLength": 2450,
  "preview": "Rechnung Nr. RE-2024-1234..."
}
```

### `analyze_folder` ✨ Enhanced in v4.0

Analyzes ALL documents in a folder (batch processing with recursive scanning, duplicate detection, and filtering).

**Input:**
```json
{
  "folderPath": "/path/to/folder",
  "recursive": true,
  "fileTypes": ["invoice", "contract"],
  "keywords": ["telekom", "vodafone"]
}
```

**Output:**
```json
{
  "folderPath": "/path/to/folder",
  "totalFiles": 15,
  "duplicateGroups": [
    {
      "hash": "abc123...",
      "count": 3,
      "files": ["doc1.pdf", "doc1_copy.pdf", "duplicate.pdf"]
    }
  ],
  "documents": [
    { 
      "originalPath": "...", 
      "suggestedFilename": "...", 
      "ocrQuality": "good",
      "confidence": 0.95,
      "metadata": {...} 
    }
  ]
}
```

### `suggest_folder_structure` ✨ NEW in v3.0

Suggests intelligent folder organization based on analyzed documents.

**Input:**
```json
{
  "documents": [ /* array from analyze_folder */ ]
}
```

**Output:**
```json
{
  "structure": {
    "2024": {
      "Rechnungen": ["Telekom", "Vodafone"],
      "Vertraege": ["..."]
    }
  },
  "assignments": [
    {
      "originalPath": "/path/scan001.pdf",
      "targetFolder": "2024/Rechnungen/Telekom",
      "newFilename": "2024-01-24_RE-123_rechnung_telekom.pdf"
    }
  ]
}
```

### `batch_organize` ✨ Enhanced in v4.0

Executes batch renaming and moving/copying of files with automatic backup.

**Input:**
```json
{
  "baseFolder": "/path/to/organized",
  "mode": "move",
  "createBackup": true,
  "operations": [
    {
      "originalPath": "/path/scan001.pdf",
      "targetFolder": "2024/Rechnungen/Telekom",
      "newFilename": "2024-01-24_RE-123_rechnung_telekom.pdf"
    }
  ]
}
```

**Output:**
```json
{
  "success": true,
  "mode": "move",
  "filesProcessed": 15,
  "filesFailed": 0,
  "foldersCreated": 5,
  "backupCreated": true,
  "backupPath": "/path/.backup_2024-01-24T10-30-00.json",
  "results": [...]
}
```

### `preview_organization` ✨ NEW in v4.0

Shows a dry-run preview of what would happen without making changes.

**Input:**
```json
{
  "baseFolder": "/path/to/organized",
  "operations": [ /* same as batch_organize */ ]
}
```

**Output:**
```json
{
  "preview": [
    {
      "action": "move",
      "from": "/path/scan001.pdf",
      "to": "/path/organized/2024/Rechnungen/Telekom/2024-01-24_RE-123.pdf",
      "status": "ok"
    }
  ],
  "warnings": [],
  "stats": {
    "totalFiles": 15,
    "foldersToCreate": ["2024/Rechnungen/Telekom"],
    "conflicts": 0,
    "missingFiles": 0
  },
  "safeToExecute": true
}
```

### `undo_last_organization` ✨ NEW in v4.0

Restores the last organization operation from automatic backup.

**Input:**
```json
{
  "baseFolder": "/path/to/organized"
}
```

**Output:**
```json
{
  "success": true,
  "restored": 15,
  "failed": 0,
  "backupFile": "/path/.backup_2024-01-24T10-30-00.json"
}
```

### `export_metadata` ✨ NEW in v4.0

Exports analyzed document metadata to JSON or CSV format.

**Input:**
```json
{
  "documents": [ /* array from analyze_folder */ ],
  "format": "csv"
}
```

**Output (CSV):**
```csv
Filename,Path,Date,References,Keywords,OCR Quality,Confidence,Type
scan001.pdf,/path/scan001.pdf,24.01.2024,RE-2024-1234,rechnung;telekom,good,0.95,invoice
...
```

---

## 🔧 Use Cases

### Single Document Analysis
```
analyze_document with filePath: "/path/to/scanned_invoice.pdf"
```
→ Extracts invoice number, date, company name and suggests:
`2024-01-24_INV-2024-001_rechnung_telekom.pdf`

### Advanced Batch Organization (v4.0)

**Example conversation with Perplexity or Claude:**

```
You: "Analyze all documents recursively in my 2026 folder, find duplicates"

AI (using analyze_folder with recursive=true):
   → Scanned 10 levels deep
   → Found 150 documents
   → Detected 12 duplicates (3 groups)
   → Extracted: dates, invoice numbers, companies
   → OCR quality: 95% confidence average

AI (using suggest_folder_structure):
   → Proposes: 2026/Rechnungen/Telekom, 2026/Vertraege/Vodafone, etc.
   → Shows: Complete list of file renames and target folders

AI (using preview_organization):
   → Preview: 150 files will be moved
   → Folders to create: 8
   → Conflicts: 0
   → Safe to execute: YES

AI: "I found 150 documents (12 duplicates). Should I organize them into 
     2026/Rechnungen, 2026/Vertraege with smart filenames?"

You: "Yes, but copy instead of moving"

AI (using batch_organize with mode="copy", createBackup=true):
   → Copies all files (originals preserved)
   → Creates folder structure
   → Backup created for undo
   → Processes everything automatically

AI: "Done! Organized 150 documents, created 8 folders, backup saved.
     15 files processed, 0 failed. Type 'undo' to revert."

You: "Export the metadata as CSV"

AI (using export_metadata with format="csv"):
   → Exports all document metadata
   → Includes: filename, date, references, keywords, OCR quality

AI: "CSV exported with all metadata for 150 documents."
```

**Complete Workflow v4.0:**
1. Scanner saves to "Inbox" folder
2. Tell Perplexity/Claude to analyze recursively + find duplicates
3. Preview changes before execution
4. Confirm with copy or move mode
5. Files auto-organized with automatic backup
6. Export metadata for records
7. Undo anytime if needed

### Workflow Automation
- **Before**: Manual sorting of 100+ scanned documents
- **After**: One command → Preview → Organization in seconds
- **Safety**: Automatic backups, preview mode, undo function
- **Perfect for**: Tax documents, invoices, contracts, receipts, archives

---

## 🛠️ Technical Details

### Dependencies
- **pdf-parse**: PDF text extraction
- **mammoth**: DOCX document processing
- **adm-zip**: Pages document extraction
- **tesseract.js**: OCR for scanned documents and images
- **@modelcontextprotocol/sdk**: MCP protocol implementation

### File Structure
```
mcp-document-intelligence/
├── src/
│   └── index.ts          # Main server implementation
├── build/                # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

### Filename Pattern Recognition

The analyzer recognizes:
- **Scanner timestamps**: `YYYY-MM-DD_HH-MM-SS` or `YYYYMMDD_HHMMSS`
- **Document dates**: `DD.MM.YYYY`, `YYYY-MM-DD`
- **Reference patterns**:
  - `Rechnungs-Nr: XXX` / `Invoice: XXX`
  - `Kunden-Nr: XXX` / `Customer: XXX`
  - `Bestell-Nr: XXX` / `Order: XXX`
  - `Vertrag-Nr: XXX` / `Contract: XXX`
- **Keywords**: Invoice, Contract, Offer, Order, common company names

### Folder Structure Generation

Automatically groups documents by:
- **Year**: Extracted from document date
- **Category**: Rechnungen, Verträge, Angebote, Mahnungen, etc.
- **Company**: Telekom, Vodafone, Amazon, PayPal, Banks, etc.

---

## 🔒 Privacy & Security

- ✅ **All data stays local** - No external API calls for personal data
- ✅ **OCR processing on-device** - Tesseract.js runs locally
- ✅ **No data transmission** - All processing happens locally
- ✅ **No logging of document content**

---

## 🚀 Roadmap

- [x] Multi-format document support (PDF, DOCX, Pages, Images, TXT)
- [x] Batch processing support
- [x] Auto-filing to folders based on content
- [x] Recursive folder scanning
- [x] Duplicate detection with SHA256
- [x] Preview mode (dry-run)
- [x] Backup & Undo functionality
- [x] Metadata export (JSON/CSV)
- [x] Copy vs Move modes
- [x] OCR quality feedback
- [ ] Configurable naming templates
- [ ] Custom reference number patterns
- [ ] Excel/CSV document support
- [ ] Integration with document management systems
- [ ] Machine learning for improved categorization

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🙏 Acknowledgments

- Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol)
- Inspired by and based on concepts from [MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- PDF parsing by [pdf-parse](https://www.npmjs.com/package/pdf-parse)
- OCR by [Tesseract.js](https://tesseract.projectnaptha.com/)

---

**Made for intelligent document workflows** 📄✨
