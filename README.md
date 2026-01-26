# MCP Document Intelligence Server

**Model Context Protocol Server with Batch Document Processing & Intelligent File Organization**

Automated document intelligence with batch processing: Scan entire folders, extract metadata from PDFs, DOCX, Pages, images and text files (with OCR for scanned documents), suggest intelligent filenames, and automatically organize documents into a structured folder hierarchy.

[![MCP](https://img.shields.io/badge/MCP-1.0.4-blue)](https://github.com/modelcontextprotocol)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-3.0.0-green)](https://github.com/AndreasDietzel/mcp-document-intelligence)

---

## 🎯 Features

### � Batch Document Processing (v3.0)
- **Folder Scanning**: Analyze entire folders in one operation
- **Batch Organization**: Rename and move multiple files automatically
- **Smart Folder Structure**: Auto-generate organized folder hierarchies
- **Workflow Automation**: Scan → Analyze → Organize in one go

### �📄 Multi-Format Document Intelligence
- **Text Extraction**: Extract text from PDF, DOCX, Pages, Images, TXT
- **OCR Support**: Tesseract.js for scanned documents
- **Smart Filename Suggestions**: Automatically extracts:
  - Scanner timestamps (preserves existing `2024-01-24_14-30-45` format)
  - Document dates (DD.MM.YYYY, YYYY-MM-DD)
  - Reference numbers (Invoice#, Customer#, Order#, Contract#)
  - Keywords (Invoice, Contract, Company names)

---

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/AndreasDietzel/mcp-document-intelligence.git
cd mcp-document-intelligence
npm install
npm run build
```

### Configuration

Add to your MCP client configuration (e.g., Perplexity, Claude Desktop):

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

### MCP Filesystem Integration

This server builds upon the official [MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) from the Model Context Protocol repository. The filesystem functionality is provided separately and should be configured alongside this server for complete document management capabilities.

To use both servers together:

```json
{
  "mcpServers": {
    "document-intelligence": {
      "command": "node",
      "args": ["/path/to/mcp-document-intelligence/build/index.js"]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/your/documents"
      ]
    }
  }
}
```

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

### `analyze_folder` ✨ NEW in v3.0

Analyzes ALL documents in a folder (batch processing).

**Input:**
```json
{
  "folderPath": "/path/to/folder"
}
```

**Output:**
```json
{
  "folderPath": "/path/to/folder",
  "totalFiles": 15,
  "documents": [
    { "originalPath": "...", "suggestedFilename": "...", "metadata": {...} },
    ...
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

### `batch_organize` ✨ NEW in v3.0

Executes batch renaming and moving of files.

**Input:**
```json
{
  "baseFolder": "/path/to/organized",
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
  "processed": 15,
  "failed": 0,
  "results": [...]
}
```

---

## 🔧 Use Cases

### Single Document Analysis
```
analyze_document with filePath: "/path/to/scanned_invoice.pdf"
```
→ Extracts invoice number, date, company name and suggests:
`2024-01-24_INV-2024-001_rechnung_telekom.pdf`

### Batch Document Organization (NEW v3.0)
```
1. analyze_folder with folderPath: "/path/to/Scans/Inbox"
   → Scans all documents, extracts metadata

2. suggest_folder_structure with documents from step 1
   → AI suggests: 2024/Rechnungen/Telekom, 2024/Vertraege/Vodafone, etc.

3. batch_organize with suggested structure
   → Renames all files and organizes into folders automatically
```

**Complete Workflow:**
1. Scanner saves to "Inbox" folder
2. AI analyzes ALL documents (batch)
3. AI suggests organized structure
4. User confirms → Files auto-organized in seconds

### Workflow Automation
- **Before**: Manual sorting of 100+ scanned documents
- **After**: One command → Complete organization in seconds
- **Perfect for**: Tax documents, invoices, contracts, receipts

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
