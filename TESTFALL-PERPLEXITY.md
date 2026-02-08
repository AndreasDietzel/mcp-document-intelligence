# 🧪 Testfall: Downloads mit Perplexity/Claude analysieren und sortieren

## Vorbereitung

1. **Stelle sicher, dass der MCP Server läuft:**
   - Claude Desktop öffnen
   - 🔌-Symbol prüfen → "document-intelligence" sollte "connected" sein

2. **Test-Dateien in Downloads vorbereiten** (optional):
   - Ein paar PDFs in ~/Downloads legen
   - Z.B. Rechnungen, Verträge, Kontoauszüge

## Testfall 1: Nur Vorschau (empfohlen für ersten Test)

### Prompt für Perplexity/Claude:

```
Ich möchte meinen Downloads-Ordner analysieren und sehen, 
wie die Dateien ins Archiv sortiert würden, OHNE sie tatsächlich zu verschieben.

Nutze bitte das Tool "process_downloads" mit folgenden Parametern:
- archiveBasePath: /Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv
- autoMove: false
- maxFiles: 20

Zeige mir dann:
1. Wie viele Dateien wurden gefunden?
2. Welche Datei würde in welchen Zielordner verschoben?
3. Welche Dateinamen werden vorgeschlagen?

Bitte formatiere das Ergebnis übersichtlich als Tabelle.
```

### Erwartetes Ergebnis:

Claude/Perplexity ruft den MCP Server auf und zeigt dir eine Tabelle wie:

| Original-Datei | Erkanntes Datum | Kategorie | Ziel-Ordner | Neuer Dateiname |
|---|---|---|---|---|
| rechnung_123.pdf | 2026-01-15 | Finanzen | Zwanziger/2026/01_Finanzen | 2026-01-15_Rechnung_ING.pdf |
| vertrag.pdf | 2025-12-20 | Versicherungen | Zwanziger/2025/04_Versicherungen | 2025-12-20_Vertrag_Hallesche.pdf |
| ... | ... | ... | ... | ... |

## Testfall 2: Tatsächlich verschieben

**⚠️ ACHTUNG:** Dateien werden wirklich verschoben!

### Prompt:

```
Jetzt möchte ich die Dateien tatsächlich sortieren.

Nutze process_downloads mit:
- archiveBasePath: /Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv
- autoMove: true
- maxFiles: 20

Bitte berichte mir:
1. Wie viele Dateien wurden verschoben?
2. Wie viele Fehler gab es?
3. Eine Zusammenfassung der Zielordner
```

### Erwartetes Ergebnis:

```
✅ Downloads erfolgreich sortiert!

Statistik:
- 15 Dateien verarbeitet
- 12 erfolgreich verschoben
- 3 übersprungen (bereits vorhanden)
- 0 Fehler

Zielordner:
- Zwanziger/2026/01_Finanzen: 5 Dateien
- Zwanziger/2026/04_Versicherungen: 4 Dateien
- Zwanziger/2025/99_Sonstiges: 3 Dateien
```

## Testfall 3: Kompletter Workflow (Archiv optimieren + Downloads sortieren)

### Prompt:

```
Ich möchte mein Archiv optimieren und dann alle Downloads sortieren:

Schritt 1: Optimiere das Archiv
- cleanup_old_structure (alte Ordner bereinigen)
- move_loose_files (lose Dateien kategorisieren)  
- optimize_folder_structure (leere Ordner löschen)

Schritt 2: Downloads sortieren
- process_downloads mit autoMove: true

Archiv-Pfad: /Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv

Führe bitte alle Schritte nacheinander aus und gib mir 
nach jedem Schritt eine kurze Zusammenfassung.
```

### Erwartetes Ergebnis:

```
📋 Schritt 1: cleanup_old_structure
✅ 6 alte Unterordner nach 08_Bildung verschoben
✅ 4 alte Kategorien konsolidiert
⚠️ 50 lose Dateien gefunden

📋 Schritt 2: move_loose_files
✅ 50 lose Dateien kategorisiert
   - 15 → 01_Finanzen
   - 12 → 08_Bildung
   - 23 → 99_Sonstiges

📋 Schritt 3: optimize_folder_structure
✅ 25 leere Ordner gelöscht
✅ 8 Einzeldateien nach 99_Sonstiges verschoben

📋 Schritt 4: process_downloads
✅ 15 Dateien aus Downloads sortiert

🎉 Fertig! Archiv ist optimiert und Downloads sind sortiert.
```

## Fehlerbehandlung

### "pdftotext not found"

Das Tool `intelligent_rename` benötigt poppler. Installation:

```bash
brew install poppler
```

### "Tool not found: process_downloads"

MCP Server ist nicht verbunden. Prüfe:
1. Claude Desktop neu starten
2. Config prüfen: `~/Library/Application Support/Claude/claude_desktop_config.json`
3. Build existiert: `~/Projects/mcp-document-intelligence/build/index.js`

### "Permission denied"

Dateipfade prüfen und absolute Pfade verwenden:
```
/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv
```

## Tipps für beste Ergebnisse

1. **Starte immer mit Vorschau** (autoMove: false)
2. **Verarbeite in kleinen Batches** (maxFiles: 20-50)
3. **Prüfe die Vorschläge** bevor du autoMove aktivierst
4. **Nutze den kompletten Workflow** für beste Organisation

## Was soll Perplexity/Claude machen?

Die KI soll:
- ✅ Die richtigen MCP Tools aufrufen
- ✅ Die Parameter korrekt setzen
- ✅ Die Ergebnisse übersichtlich darstellen
- ✅ Dich bei Fehlern informieren
- ✅ Fragen stellen wenn Parameter unklar sind

## Next Steps

Nach erfolgreichem Test kannst du:
1. Eigene Workflows definieren
2. Regelmäßig Downloads automatisch sortieren lassen
3. Archiv kontinuierlich optimieren
4. Eigene Kategorisierungs-Regeln vorschlagen
