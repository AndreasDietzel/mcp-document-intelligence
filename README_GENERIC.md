# MCP Document Intelligence Server

**Model Context Protocol Server with PDF OCR, intelligent filename generation, and macOS data integration**

Combines filesystem access with intelligent document processing: Extract text from PDFs (including OCR for scanned documents), suggest smart filenames, and integrate macOS data sources (Calendar, Mail, Reminders).

[![MCP](https://img.shields.io/badge/MCP-1.0.4-blue)](https://github.com/modelcontextprotocol)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🎯 Features

### 📄 PDF Document Intelligence
- **Text Extraction**: Extract text from PDFs using pdf-parse
- **OCR Support**: Tesseract.js for scanned documents
- **Smart Filename Suggestions**: Automatically extracts:
  - Scanner timestamps (preserves existing `2024-01-24_14-30-45` format)
  - Document dates (DD.MM.YYYY, YYYY-MM-DD)
  - Reference numbers (Invoice#, Customer#, Order#, Contract#)
  - Keywords (Invoice, Contract, Company names)

### 📅 macOS Integration
- **Calendar**: Events from Calendar.app
- **Reminders**: Due reminders from Reminders.app
- **Mail**: Inbox messages
- **Weather**: Open-Meteo API (no API key required)
- **News**: RSS feed integration

---

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/mcp-document-intelligence.git
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
      "args": ["/ABSOLUTE/PATH/TO/mcp-document-intelligence/build/index.js"],
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

### `analyze_pdf_and_suggest_filename`

Analyzes a PDF document and suggests an intelligent filename.

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

### macOS Data Tools

- `get_briefing` - Complete briefing with all data sources
- `get_weather` - Current weather information
- `get_calendar_events` - Calendar events for timeframe
- `get_reminders` - Today's due reminders
- `get_unread_mail` - Inbox messages
- `get_news` - Current news headlines

---

## 🔧 Use Cases

### Document Management
```
analyze_pdf_and_suggest_filename with filePath: "/path/to/scanned_invoice.pdf"
```
→ Extracts invoice number, date, company name and suggests:
`2024-01-24_INV-2024-001_rechnung_telekom.pdf`

### Daily Briefing
```
Create a briefing for today
```
→ Weather, appointments, reminders, emails, news

### Workflow Automation
1. Scan document → Save with timestamp
2. AI analyzes PDF → Extracts metadata
3. AI suggests structured filename
4. Optional: Auto-rename or file to folder

---

## 🛠️ Architecture

### Dependencies
- **pdf-parse**: PDF text extraction
- **tesseract.js**: OCR for scanned documents
- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **Open-Meteo API**: Free weather data (no API key)

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

---

## 🔒 Privacy & Security

- ✅ **All data stays local** - No external API calls for personal data
- ✅ **OCR processing on-device** - Tesseract.js runs locally
- ✅ **macOS permissions required** - Calendar, Reminders, Mail access
- ✅ **No logging of document content**

---

## 🤝 Contributing

Contributions welcome! Areas for improvement:

- [ ] Additional document types (Word, Excel, Images)
- [ ] More reference number patterns
- [ ] Configurable naming templates
- [ ] Batch processing support
- [ ] Auto-filing to folders based on content
- [ ] Integration with document management systems

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🙏 Acknowledgments

- Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol)
- Filesystem foundation from [MCP Servers](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- PDF parsing by [pdf-parse](https://www.npmjs.com/package/pdf-parse)
- OCR by [Tesseract.js](https://tesseract.projectnaptha.com/)
- Weather data from [Open-Meteo](https://open-meteo.com/)

---

**Made for intelligent document workflows** 📄✨
