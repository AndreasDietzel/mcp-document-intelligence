# Produktiv-Betrieb

✅ Der MCP Document Intelligence Server ist produktiv konfiguriert und einsatzbereit.

## Konfiguration

Perplexity Config: `~/Library/Application Support/Perplexity/perplexity-config.json`

## Verfügbares Tool

### analyze_pdf_and_suggest_filename
Analysiert PDFs (mit OCR) und schlägt intelligente Dateinamen vor.

**Features:**
- Scanner-Zeitstempel erhalten
- Dokumentdatum extrahieren  
- Referenznummern finden
- Keywords erkennen

## Server neu starten

Nach Code-Änderungen:
```bash
cd ~/Projects/briefing-mcp-server
npm run build
```

MCP Server starten automatisch on-demand.

## Repository

https://github.com/AndreasDietzel/mcp-document-intelligence
