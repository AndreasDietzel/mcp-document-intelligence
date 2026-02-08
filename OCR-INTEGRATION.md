# 🔍 OCR-Integration im MCP Server

## Überblick

Ab Version 4.6.0 verwendet der MCP-Server **automatisch Tesseract OCR** für alle Dokumentenanalysen. Das bedeutet:

- ✅ **Gescannte PDFs** werden automatisch mit OCR verarbeitet
- ✅ **Bilder** (.jpg, .jpeg, .png) werden mit OCR analysiert
- ✅ **Deutsche Texte** werden korrekt erkannt (Tesseract mit `-l deu`)
- ✅ **Automatisches Fallback**: Wenn `pdftotext` wenig Text findet, wird OCR verwendet

## Voraussetzungen

### Installation (macOS)

```bash
# Tesseract mit deutscher Sprachunterstützung
brew install tesseract tesseract-lang

# Poppler für PDF-Verarbeitung
brew install poppler

# Prüfe Installation
tesseract --version
pdftotext -v
```

### Installation (Linux)

```bash
# Ubuntu/Debian
sudo apt-get install tesseract-ocr tesseract-ocr-deu poppler-utils

# Fedora
sudo dnf install tesseract tesseract-langpack-deu poppler-utils
```

## Funktionsweise

### 1. Automatisches OCR-Fallback für PDFs

```typescript
// Wenn pdftotext < 50 Zeichen findet → OCR
const text = await extractTextFromPDF(filePath);
// Intern:
// 1. Versuche pdftotext
// 2. Falls text.length < 50: Versuche Tesseract OCR
// 3. Gib besten Ergebnis zurück
```

### 2. Direkte OCR für Bilder

```typescript
// .jpg, .jpeg, .png werden direkt mit OCR verarbeitet
const text = await extractTextFromFile('scan.jpg');
// → Tesseract mit deutscher Sprache
```

### 3. Einheitliche Textextraktion

```typescript
extractTextFromFile(filePath) {
  if (isPDF) → extractTextFromPDF (mit OCR-Fallback)
  if (isImage) → extractOcrText (direkt)
  if (isText) → fs.readFileSync
}
```

## MCP-Tools mit OCR

### intelligent_rename

```json
{
  "archiveBasePath": "/pfad/zum/archiv",
  "dryRun": false
}
```

- Analysiert **PDFs UND Bilder**
- Extrahiert Text mit OCR
- Erkennt Firmen (ING, Hallesche, Vodafone, DHL, etc.)
- Erkennt Dokumenttypen (Rechnung, Vertrag, Rezept, etc.)
- Benennt Dateien intelligent um

### process_downloads

```json
{
  "downloadsPath": "/Users/name/Downloads",
  "archiveBasePath": "/pfad/zum/archiv",
  "autoMove": true
}
```

- Scannt Downloads-Ordner
- Verwendet OCR für gescannte PDFs und Bilder
- Kategorisiert basierend auf Textinhalt
- Verschiebt in richtige Kategorie

## Erkannte Entitäten

### Finanzen → 01_Finanzen
- ING, Postbank, Sparkasse, Commerzbank, Volksbank, Deutsche Bank, Comdirect

### Versicherungen → 04_Versicherungen
- Hallesche, HUK, AXA, Allianz, Generali, ERGO, UKV

### Gesundheit → 02_Gesundheit
- Arzt, Praxis, Apotheke, Krankenhaus, Klinik, AOK, Rezept

### Telekommunikation → 11_Telekommunikation
- **Vodafone, Telekom, O2, 1&1** (korrekt kategorisiert!)

### Post/Paket → 06_Post_Paket
- DHL, Paket, Sendung, Amazon

### Steuern → 05_Steuern
- Finanzamt, Steuer

### Auto → 09_Auto
- Auto, KFZ, Reparatur, Werkstatt

### Wohnen → 10_Wohnen
- Miete, Wohnung, Gas, Strom, Wasser, Eigentümerversammlung

## Erkannte Dokumenttypen

- **Rechnung** (Rechnung, Invoice, Bill)
- **Vertrag** (Vertrag, Contract)
- **Bescheid** (Bescheid, Notice)
- **Bestätigung** (Bestätigung, Confirmation)
- **Abrechnung** (Abrechnung, Statement)
- **Rezept** (Rezept, Verschreibung)
- **Kündigung** (Kündigung, Cancellation)
- **Mahnung** (Mahnung, Reminder)

## Performance & Limits

### OCR-Einstellungen

```bash
# Tesseract-Kommando
tesseract 'datei.jpg' stdout -l deu --psm 1 2>/dev/null | head -c 5000

# Parameter:
# -l deu        : Deutsche Sprache
# --psm 1       : Automatic page segmentation with OSD
# head -c 5000  : Max 5000 Zeichen (verhindert Memory-Overflow)
```

### Timeouts

- **OCR pro Datei**: 30 Sekunden
- **pdftotext**: 15 Sekunden
- **Gesamt**: Max 45 Sekunden pro Datei

### Graceful Degradation

```
1. Versuche pdftotext (schnell)
2. Falls < 50 Zeichen: Versuche OCR (langsamer, besser)
3. Falls OCR fehlschlägt: Leerer String (kein Crash)
```

## Beispiel: Vollständiger Archiv-Scan

```bash
# Script ausführen (scannt gesamtes Archiv)
node scripts/ocr-enhanced-scan.js

# Ergebnis:
# 📄 693 Dateien analysiert
# ✅ 559 Dateien verbessert
# ⏭️  2313 unverändert (bereits gut oder keine Inhalte)
# ❌ 2 Fehler
```

## Debugging

### OCR funktioniert nicht?

```bash
# Prüfe Tesseract-Installation
tesseract --version
tesseract --list-langs  # Sollte 'deu' zeigen

# Teste manuell
tesseract test.jpg stdout -l deu
```

### PDF-Extraktion schlägt fehl?

```bash
# Prüfe pdftotext
pdftotext -v
pdftotext -enc UTF-8 test.pdf -

# Teste mit OCR
tesseract test.pdf stdout -l deu
```

### MCP-Server-Logs

```bash
# Claude Desktop: Developer Tools → Console
# Suche nach "OCR" oder "tesseract"

# Terminal-Test
cd /pfad/zu/mcp-document-intelligence
npm run build
node build/index.js
```

## Tipps für beste Ergebnisse

### Bild-Qualität
- **Mindestens 300 DPI** für gute OCR-Erkennung
- **Gerade ausgerichtete** Dokumente (Tesseract korrigiert kleine Drehungen)
- **Kontrastreiche** Scans (schwarz auf weiß)

### Dokumenttypen
- ✅ **Sehr gut**: Moderne digitale Scans, klare Schrift
- ✅ **Gut**: Handy-Fotos von Dokumenten, ausreichend Licht
- ⚠️ **Mittel**: Alte Faxe, niedrige Auflösung
- ❌ **Schlecht**: Unscharfe Bilder, extreme Verzerrung, handschriftlicher Text

### Performance
- OCR dauert **2-5 Sekunden pro Datei**
- Bei 1000 Dateien: **~1 Stunde** (mit Parallelisierung schneller)
- Tipp: Erst mit `dryRun: true` testen!

## Verbesserungen zu v4.5.0

### Neu in v4.6.0

| Feature | v4.5.0 | v4.6.0 |
|---------|--------|--------|
| **Gescannte PDFs** | ❌ Übersprungen | ✅ Auto-OCR |
| **Bilder** | ❌ Ignoriert | ✅ OCR-Analyse |
| **Vodafone** | ❌ Versicherung | ✅ Telekommunikation |
| **Fallback-Strategie** | ❌ Keine | ✅ pdftotext → OCR |
| **Dokumenttypen** | 5 | 8 (+Rezept, Kündigung, Mahnung) |
| **Entitäten** | 23 | 35 (+Telekom, DHL, AOK) |

## Zusammenfassung

**Der MCP-Server verwendet jetzt automatisch OCR für alle Dokumente.**

- Keine manuellen OCR-Calls mehr nötig
- Alle Tools (`intelligent_rename`, `process_downloads`) profitieren
- Graceful Degradation: Funktioniert auch ohne OCR
- Vodafone wird korrekt als Telekommunikation erkannt
- 559 von 693 Dateien im Test-Archiv verbessert

🎉 **Einfach verwenden - OCR läuft im Hintergrund!**
