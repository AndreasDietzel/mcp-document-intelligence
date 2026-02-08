# 🎯 Direkter Copy-Paste Testfall für Perplexity/Claude

## Voraussetzung

Der MCP Server muss in Claude Desktop konfiguriert sein.

**Schnellstart:**
1. Datei öffnen: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Folgendes einfügen:
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
3. Claude Desktop neu starten
4. 🔌-Symbol prüfen → "document-intelligence" = connected

---

## 📋 TESTFALL 1A: Einzelne Datei analysieren (Perplexity-freundlich)

✅ **Dieser Testfall funktioniert zuverlässig in Perplexity!**

```
Analysiere eine einzelne Testdatei aus dem Projekt.

Nutze das MCP Tool "analyze_document" mit:
{
  "filePath": "/Users/andreasdietzel/Projects/mcp-document-intelligence/test-data/Rechnung_für_Müller_Größe_XL.txt"
}

Zeige mir:
- Erkanntes Datum
- Extrahierte Referenznummern
- Gefundene Keywords
- Vorgeschlagenen Dateinamen
- Kategorisierungs-Vorschlag
```

---

## 📋 TESTFALL 1: Downloads analysieren (Copy & Paste)

⚠️ **WICHTIG für Perplexity:** Dieser Testfall funktioniert besser mit Claude Desktop!

⚠️ **Falls "Tool nicht gefunden"-Fehler:** Siehe Troubleshooting unten!

```
Analysiere meinen Downloads-Ordner und zeige mir Vorschläge (OHNE zu verschieben).

Nutze das MCP Tool "process_downloads" mit exakt diesen Parametern:
{
  "downloadsPath": "/Users/andreasdietzel/Downloads",
  "archiveBasePath": "/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv",
  "autoMove": false,
  "maxFiles": 10
}

Zeige mir das Ergebnis als Tabelle mit:
- Original-Dateiname
- Erkanntes Datum
- Kategorie
- Zielordner
- Neuer Dateiname

Zusammenfassung:
- Anzahl gefundener Dateien
- Anzahl analysierbarer Dateien  
- Verteilung nach Kategorien

Falls ein Fehler auftritt, zeige mir die komplette Fehlermeldung mit troubleshooting-Details.
```

---

## 📋 TESTFALL 2: Tatsächlich sortieren (Copy & Paste)

⚠️ **ACHTUNG:** Dateien werden wirklich verschoben!

```
Perfekt! Jetzt sortiere die Dateien tatsächlich.

Nutze "process_downloads" mit:
{
  "downloadsPath": "/Users/andreasdietzel/Downloads",
  "archiveBasePath": "/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv",
  "autoMove": true,
  "maxFiles": 30
}

Berichte mir:
1. Wie viele Dateien wurden verschoben?
2. Gab es Fehler?
3. Welche Ordner haben die meisten Dateien bekommen?
4. Auffälligkeiten?
```

---

## 📋 TESTFALL 3: Komplette Archiv-Optimierung (Copy & Paste)

```
Führe eine vollständige Archiv-Optimierung durch.

Archiv: /Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv

Schritt für Schritt (nutze die MCP Tools):

1. cleanup_old_structure
   Parameter: { "archiveBasePath": "..." }
   → Bereinige alte Ordnerstrukturen

2. move_loose_files
   Parameter: { "archiveBasePath": "..." }
   → Kategorisiere lose Dateien

3. optimize_folder_structure
   Parameter: { "archiveBasePath": "..." }
   → Lösche leere Ordner, konsolidiere Einzeldateien

4. process_downloads mit autoMove: true
   → Sortiere Downloads ins Archiv

Gib mir nach jedem Schritt eine Zusammenfassung.
Am Ende: Gesamt-Statistik aller Änderungen.
```

---

## 📋 TESTFALL 4: Nur PDFs intelligent umbenennen (Copy & Paste)

```
Analysiere alle PDFs im Archiv und benenne sie intelligent um.

Nutze das MCP Tool "intelligent_rename" mit:
{
  "archiveBasePath": "/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv",
  "dryRun": true
}

Das Tool soll:
- PDF-Inhalte mit pdftotext analysieren
- Firmen erkennen (ING, Hallesche, Sparkasse)
- Dokumenttypen finden (Rechnung, Vertrag, Bescheid)
- Intelligente Namen vorschlagen

Zeige mir 20 Beispiel-Umbenennungen.
```

---

## ✅ Erwartete Antwort von Claude/Perplexity

Die KI sollte:
1. ✅ Das richtige MCP Tool aufrufen
2. ✅ Die Parameter korrekt setzen
3. ✅ Das Ergebnis übersichtlich formatieren
4. ✅ Eine verständliche Zusammenfassung geben
5. ✅ Bei Problemen Lösungsvorschläge machen

---

## 🔧 Troubleshooting

### ❌ "Tool not found" / "process_downloads nicht verfügbar"

**Ursache:** MCP Server nicht verbunden oder nicht in der Config.

**Lösung:**
1. **Config prüfen:** `cat ~/Library/Application\ Support/Claude/claude_desktop_config.json`
   - Sollte enthalten: `"document-intelligence"` unter `mcpServers`
   - Pfad korrekt? `/Users/andreasdietzel/Projects/mcp-document-intelligence/build/index.js`

2. **Claude Desktop NEU STARTEN** (wichtig!)
   - CMD+Q zum Beenden (nicht nur Fenster schließen!)
   - Claude Desktop neu öffnen

3. **Verbindung prüfen:**
   - 🔌-Symbol in Claude Desktop → "document-intelligence" sollte als "Connected" erscheinen
   - Falls nicht: Developer Tools öffnen (Hilfe → Developer → Toggle Developer Tools)
   - Console-Tab prüfen auf MCP-Fehler

4. **Alternative Testmethode:**
```
Welche MCP Tools stehen dir zur Verfügung? 
Liste alle Tools auf, die mit "document" oder "archive" zu tun haben.
```
   → Sollte u.a. zeigen: `process_downloads`, `cleanup_old_structure`, `intelligent_rename`

### ❌ "Downloads-Ordner außerhalb des freigegebenen Pfads"

**Ursache:** Pfad-Berechtigung in Perplexity (bei Claude nicht relevant).

**Lösung für Perplexity:**
1. **Testfall 1A: Analysiere einzelne Datei** (funktioniert besser in Perplexity):
```
Nutze das MCP Tool "analyze_document" mit einer einzelnen Datei:
{
  "filePath": "/Users/andreasdietzel/Downloads/DATEINAME.pdf"
}

Zeige mir die Analyse-Ergebnisse.
```

2. **Alternative: Testdaten-Ordner nutzen** (ist im Projekt freigegeben):
```
Nutze "analyze_folder" mit:
{
  "folderPath": "/Users/andreasdietzel/Projects/mcp-document-intelligence/test-data"
}

Analysiere alle Testdateien und zeige mir die Ergebnisse.
```

3. **Beste Lösung: Claude Desktop nutzen** (keine Pfad-Einschränkungen)
   - Siehe Schnellstart oben für Claude Desktop Config
   - Claude Desktop hat vollen Dateisystem-Zugriff

### ❌ "pdftotext not found" 

**Ursache:** poppler-utils nicht installiert.

**Lösung:**
```bash
brew install poppler
```

### ❌ "Permission denied"

**Ursache:** Kein Zugriff auf Archiv-Pfad.

**Lösung:**
- Prüfe Pfad mit: `ls "/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv"`
- Falls iCloud noch synct: Warte bis Download abgeschlossen
- Absoluten Pfad verwenden (keine `~` Tilde)

### 🔍 Server-Logs prüfen (Claude Desktop)

1. Hilfe → Developer → Toggle Developer Tools
2. Console-Tab öffnen
3. Nach "mcp" oder "document-intelligence" filtern
4. Fehlermeldungen zeigen genaue Ursache

### 🔍 MCP Server manuell testen (Terminal)

```bash
cd /Users/andreasdietzel/Projects/mcp-document-intelligence
npm run build
node build/index.js
```
→ Sollte starten ohne Fehler. Mit `Ctrl+C` beenden.

---

## 🎉 Was passiert danach?

Nach erfolgreichem Test kannst du:
- ✅ Downloads automatisch sortieren lassen (täglich/wöchentlich)
- ✅ Archiv kontinuierlich optimieren
- ✅ Eigene Workflows mit mehreren Tools kombinieren
- ✅ Kategorisierungs-Regeln anpassen lassen
