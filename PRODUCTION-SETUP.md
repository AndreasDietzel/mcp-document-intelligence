# MCP Document Intelligence Server - Produktiv-Konfiguration

## Installation

### Voraussetzungen

1. **Node.js** (v18+) installiert
2. **poppler-utils** für PDF-Analyse (für intelligent_rename):
   ```bash
   # macOS
   brew install poppler
   
   # Linux
   sudo apt-get install poppler-utils
   ```

### MCP Server konfigurieren

Füge folgende Konfiguration zu deiner Claude Desktop Config hinzu:

**Pfad:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "document-intelligence": {
      "command": "node",
      "args": [
        "/Users/andreasdietzel/Projects/mcp-document-intelligence/build/index.js"
      ]
    }
  }
}
```

### Server neustarten

1. Claude Desktop komplett beenden
2. Claude Desktop neu starten
3. In neuem Chat das 🔌-Symbol prüfen - "document-intelligence" sollte connected sein

## Verfügbare Tools

### Downloads automatisch sortieren

```
process_downloads
```
**Parameter:**
- `archiveBasePath`: `/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv`
- `autoMove`: `false` (nur Vorschau) oder `true` (tatsächlich verschieben)
- `downloadsPath`: Optional, Standard: `~/Downloads`

### Alte Ordnerstrukturen bereinigen

```
cleanup_old_structure
```
**Parameter:**
- `archiveBasePath`: Pfad zum Archiv

### Ordnerstruktur optimieren

```
optimize_folder_structure
```
Löscht leere Ordner und verschiebt Einzeldateien nach 99_Sonstiges.

### Intelligente PDF-Umbenennung

```
intelligent_rename
```
Analysiert PDF-Inhalte und benennt intelligent um.
**Parameter:**
- `dryRun`: `true` (Vorschau) oder `false` (ausführen)

### Lose Dateien kategorisieren

```
move_loose_files
```
Kategorisiert Dateien nach Dateinamen-Mustern.

## Test mit Perplexity/Claude

### Beispiel 1: Downloads analysieren (nur Vorschau)

```
Analysiere bitte meinen Downloads-Ordner und zeige mir, 
welche Dateien wohin sortiert würden:

Nutze process_downloads mit:
- archiveBasePath: /Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv
- autoMove: false

Zeige mir die Vorschau in einer übersichtlichen Tabelle.
```

### Beispiel 2: Downloads automatisch sortieren

```
Bitte sortiere jetzt alle Dateien aus meinem Downloads-Ordner 
automatisch ins Archiv:

Nutze process_downloads mit:
- archiveBasePath: /Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv
- autoMove: true

Berichte mir, wie viele Dateien verschoben wurden und in welche Ordner.
```

### Beispiel 3: Vollständige Archiv-Optimierung

```
Führe bitte eine vollständige Optimierung meines Archivs durch:

1. cleanup_old_structure (alte Strukturen bereinigen)
2. move_loose_files (lose Dateien kategorisieren)
3. optimize_folder_structure (leere Ordner löschen)

Archiv-Pfad: /Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv

Gib mir nach jedem Schritt eine Zusammenfassung.
```

## Troubleshooting

### Server startet nicht

```bash
# Prüfe ob Build existiert
ls /Users/andreasdietzel/Projects/mcp-document-intelligence/build/index.js

# Build neu erstellen
cd /Users/andreasdietzel/Projects/mcp-document-intelligence
npm run build
```

### pdftotext nicht gefunden

```bash
# Installiere poppler
brew install poppler

# Test
pdftotext --version
```

### Logs prüfen

```bash
# Claude Desktop Console öffnen
# Hilfe → Developer → Toggle Developer Tools
# Console-Tab zeigt MCP Server Logs
```
