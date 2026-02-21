```
 ██████╗  ██████╗  ██████╗    ██╗███╗   ██╗████████╗███████╗██╗     
 ██╔══██╗██╔═══██╗██╔════╝    ██║████╗  ██║╚══██╔══╝██╔════╝██║     
 ██║  ██║██║   ██║██║         ██║██╔██╗ ██║   ██║   █████╗  ██║     
 ██║  ██║██║   ██║██║         ██║██║╚██╗██║   ██║   ██╔══╝  ██║     
 ██████╔╝╚██████╔╝╚██████╗   ██║██║ ╚████║   ██║   ███████╗███████╗
 ╚═════╝  ╚═════╝  ╚═════╝   ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚══════╝
 ─────────────────── M C P   S E R V E R   v 5 . 0 ───────────────────
              D O C U M E N T   I N T E L L I G E N C E
```

A **Model Context Protocol** server for intelligent document analysis, OCR processing, AI-powered classification, and automated file organization.

Built for **Claude Desktop**, **VS Code Copilot**, and any MCP-compatible AI assistant.

---

## Features

| Feature | Description |
|---|---|
| **Multi-Format Extraction** | PDF, DOCX, DOC, Pages (IWA + legacy), TXT, RTF, ODT, images |
| **OCR Engine** | Tesseract + pdftoppm for scanned documents and images |
| **AI Classification** | Perplexity AI integration for intelligent categorization |
| **Smart Rename** | AI-powered filename generation from document content |
| **Batch Processing** | Organize entire folders with one command |
| **Undo / Rollback** | Every rename/move operation is tracked and reversible |
| **Downloads Sorting** | Scan ~/Downloads and auto-sort into archive folders |
| **ISO 25010 Security** | Input validation, path traversal protection, API key masking |
| **Duplicate Detection** | SHA-256 hash comparison across folder scans |

## Quick Start

### 1. Install

```bash
git clone https://github.com/AndreasDietzel/mcp-document-intelligence.git
cd mcp-document-intelligence
npm install
npm run build
```

### 2. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "document-intelligence": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-document-intelligence/build/server.js"]
    }
  }
}
```

### 3. Optional: AI Classification

Create `~/.mcp-doc-intel.json` for Perplexity AI support:

```json
{
  "enableAI": true,
  "perplexityApiKey": "pplx-xxxxxxxxxxxx"
}
```

### 4. Optional: OCR (macOS)

```bash
brew install tesseract tesseract-lang poppler
```

## Tools

### Core Analysis

| Tool | Purpose |
|---|---|
| `scan_directory` | List documents with content preview |
| `analyze_document` | Deep analysis: dates, references, keywords, AI classification |
| `analyze_folder` | Batch analysis with duplicate detection and performance metrics |

### File Operations

| Tool | Purpose |
|---|---|
| `rename_document` | Safe rename with collision protection |
| `move_document` | Move to target directory (auto-creates folder) |
| `smart_rename` | AI-powered intelligent rename based on content |
| `batch_organize` | Batch move/copy with backup |

### Organization

| Tool | Purpose |
|---|---|
| `auto_organize` | Autonomous folder organization (analyze + rename + move) |
| `process_downloads` | Scan downloads and sort into archive |
| `suggest_structure` | AI-generated folder structure recommendation |

### Utilities

| Tool | Purpose |
|---|---|
| `undo_operation` | Rollback last batch of operations |
| `export_metadata` | Export to JSON or CSV |
| `find_folder` | Fuzzy folder search with typo tolerance |

## Architecture

```
src/
├── server.ts        Main MCP server — 13 tools, request routing
├── config.ts        Configuration management (~/.mcp-doc-intel.json)
├── security.ts      ISO 25010 security module — validation, sanitization
├── extractor.ts     Multi-format text extraction with OCR fallback
├── ai-analysis.ts   Perplexity AI integration — classification, dates, keywords
└── undo.ts          Operation tracking and rollback
```

### ISO 25010 Quality Model

- **Functional Suitability** — Complete document lifecycle from scan to organize
- **Performance Efficiency** — Lazy-loaded optional deps, batch processing, streaming
- **Security** — Path traversal protection, input validation, API key masking, Unicode normalization
- **Reliability** — Graceful OCR/AI degradation, undo/rollback, error isolation per file
- **Maintainability** — Clean module separation, typed interfaces, zero circular deps

## Configuration

All settings in `~/.mcp-doc-intel.json`:

| Key | Type | Default | Description |
|---|---|---|---|
| `ocrLanguage` | string | `"deu+eng"` | Tesseract language codes |
| `ocrTimeout` | number | `30000` | OCR timeout in ms |
| `maxFileSize` | number | `52428800` | Max file size (50 MB) |
| `maxTextPreview` | number | `2000` | Text preview length |
| `enableAI` | boolean | `false` | Enable Perplexity AI |
| `perplexityApiKey` | string | `""` | Perplexity API key |
| `perplexityModel` | string | `"sonar"` | Perplexity model |
| `aiConfidenceThreshold` | number | `0.5` | Min AI confidence for rename |
| `birthDate` | string | `""` | Birth date to exclude from detection |
| `customCompanies` | string[] | `[]` | Additional company names for matching |

## Supported Formats

| Category | Extensions |
|---|---|
| Documents | `.pdf` `.docx` `.doc` `.pages` `.odt` `.rtf` `.txt` |
| Images (OCR) | `.jpg` `.jpeg` `.png` `.tiff` `.bmp` |
| Archives | `.zip` (text extraction from contained files) |

## Requirements

- **Node.js** 18+
- **macOS** recommended (textutil fallback for DOC/RTF/Pages)
- **Optional:** Tesseract + poppler for OCR
- **Optional:** Perplexity API key for AI classification

## License

MIT

---

*Built with the Model Context Protocol SDK*
