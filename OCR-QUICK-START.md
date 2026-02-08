# 🚀 OCR Quick Start Guide

## Installation (2 Minuten)

```bash
# macOS
brew install tesseract tesseract-lang poppler

# Prüfe Installation
tesseract --version  # Sollte 5.x zeigen
pdftotext -v         # Sollte verfügbar sein
```

## Verwendung im MCP Server

### Der MCP-Server verwendet jetzt **automatisch** OCR!

Keine speziellen Befehle nötig - alle Tools nutzen OCR automatisch:

## Tool 1: intelligent_rename

**Analysiert und benennt Dateien intelligent um (mit OCR)**

```
Analysiere alle Dokumente im Archiv und benenne sie intelligent um.

Nutze das Tool "intelligent_rename" mit:
{
  "archiveBasePath": "/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv",
  "dryRun": true
}

Zeige mir Vorschau der Umbenennungen.
```

**Was passiert:**
- ✅ PDFs werden analysiert (mit OCR-Fallback)
- ✅ Bilder werden mit OCR gescannt
- ✅ Firmen werden erkannt (ING, Vodafone, DHL, etc.)
- ✅ Dokumenttypen erkannt (Rechnung, Vertrag, Rezept, etc.)
- ✅ Dateien werden intelligent umbenannt

## Tool 2: process_downloads

**Sortiert Downloads automatisch ins Archiv (mit OCR)**

```
Sortiere meinen Downloads-Ordner automatisch ins Archiv.

Nutze "process_downloads" mit:
{
  "downloadsPath": "/Users/andreasdietzel/Downloads",
  "archiveBasePath": "/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv",
  "autoMove": true,
  "maxFiles": 30
}

Berichte mir die Ergebnisse.
```

**Was passiert:**
- ✅ Gescannte PDFs werden mit OCR verarbeitet
- ✅ Bilder/Screenshots werden analysiert
- ✅ Automatische Kategorisierung (Finanzen, Gesundheit, Post, etc.)
- ✅ Dateien werden ins richtige Jahr/Kategorie verschoben

## Beispiel-Ergebnisse

### Vorher (ohne OCR)
```
Downloads/
  Scan_2026-01-15.pdf          → Übersprungen (kein Text)
  WhatsApp_Image_2026.jpg      → Ignoriert
  Vodafone_Vertrag.pdf         → 04_Versicherungen ❌
```

### Nachher (mit OCR v4.6.0)
```
Archiv/Zwanziger/2026/
  11_Telekommunikation/
    2026-01-15_Vertrag_Vodafone.pdf  ✅
  02_Gesundheit/
    2026-01-20_Rezept_Apotheke.jpg   ✅
  06_Post_Paket/
    2026-01-22_DHL.pdf               ✅
```

## Erkannte Kategorien

| Kategorie | Erkannte Entitäten |
|-----------|-------------------|
| **01_Finanzen** | ING, Sparkasse, Postbank, Commerzbank, Kontoauszug |
| **02_Gesundheit** | Arzt, Apotheke, AOK, Rezept, Krankenhaus |
| **04_Versicherungen** | Hallesche, HUK, AXA, Allianz, ERGO |
| **05_Steuern** | Finanzamt, Steuer, Bescheid |
| **06_Post_Paket** | DHL, Amazon, Paket, Sendung |
| **07_Beruf** | Lebenslauf, Bewerbung, Arbeitsvertrag, Gehalt |
| **09_Auto** | KFZ, Werkstatt, Reparatur |
| **10_Wohnen** | Miete, Eigentümerversammlung, Nebenkosten |
| **11_Telekommunikation** | **Vodafone**, Telekom, O2, 1&1 |
| **12_Behörden** | Amt, Wahl, Behörde |

## Dokumenttypen

- ✅ **Rechnung** (Invoice, Bill)
- ✅ **Vertrag** (Contract)
- ✅ **Bescheid** (Notice)
- ✅ **Bestätigung** (Confirmation)
- ✅ **Rezept** (Prescription)
- ✅ **Kündigung** (Cancellation)
- ✅ **Mahnung** (Reminder)
- ✅ **Abrechnung** (Statement)

## Tipps für beste Ergebnisse

### ✅ Gute OCR-Qualität
- Dokumente mit 300+ DPI scannen
- Kontrastreiche Scans (schwarz auf weiß)
- Gerade ausgerichtete Dokumente

### ⚠️ Eingeschränkte OCR-Qualität
- Handy-Fotos bei schlechtem Licht
- Alte Faxe mit niedriger Auflösung
- Stark verzerrte Dokumente

### ❌ OCR nicht möglich
- Handschriftliche Notizen
- Extreme Verzerrungen
- Sehr unscharfe Bilder

## Performance

| Dateityp | Verarbeitung | Zeit pro Datei |
|----------|--------------|----------------|
| **PDF mit Text** | pdftotext | ~0.5 Sekunden |
| **Gescanntes PDF** | OCR | ~3-5 Sekunden |
| **Bild (JPG/PNG)** | OCR | ~2-4 Sekunden |

**Bei 100 Dateien:**
- Nur PDFs mit Text: ~1 Minute
- Mix mit gescannten Docs: ~5-8 Minuten
- Nur Bilder: ~4-7 Minuten

## Troubleshooting

### "tesseract: command not found"

```bash
# macOS
brew install tesseract tesseract-lang

# Linux (Ubuntu/Debian)
sudo apt-get install tesseract-ocr tesseract-ocr-deu
```

### OCR erkennt keinen Text

**Mögliche Ursachen:**
1. **Schlechte Bildqualität** → Neu scannen mit höherer Auflösung
2. **Handschrift** → OCR funktioniert nur mit gedrucktem Text
3. **Falsche Sprache** → Server verwendet `-l deu` (Deutsch)

**Lösung:**
```bash
# Teste manuell
tesseract deine_datei.jpg stdout -l deu
```

### Vodafone wird falsch kategorisiert

**Gelöst in v4.6.0!** 
- Vodafone geht jetzt korrekt zu **11_Telekommunikation**
- Falls du alte Dateien hast: Führe `intelligent_rename` nochmal aus

## Vollständiger Test

```
Teste den MCP-Server mit OCR:

1. Analysiere eine einzelne Datei:
   Tool: analyze_document
   Datei: /pfad/zu/scan.pdf
   → Sollte Text mit OCR extrahieren

2. Analysiere Downloads:
   Tool: process_downloads
   autoMove: false (nur Preview!)
   → Sollte gescannte PDFs erkennen

3. Führe intelligent_rename aus:
   Tool: intelligent_rename
   dryRun: true
   → Sollte Bilder und gescannte PDFs umbenennen

Falls alles funktioniert: 🎉
Falls Fehler: Siehe OCR-INTEGRATION.md für Details
```

## Nächste Schritte

1. ✅ **MCP-Server neu bauen**: `npm run build`
2. ✅ **Claude Desktop neu starten**: CMD+Q → Neu öffnen
3. ✅ **Testfall ausführen**: Siehe [QUICK-TEST.md](QUICK-TEST.md)
4. ✅ **Produktiv nutzen**: Downloads automatisch sortieren!

## Weitere Dokumentation

- 📚 [OCR-INTEGRATION.md](OCR-INTEGRATION.md) - Vollständige technische Dokumentation
- 🧪 [QUICK-TEST.md](QUICK-TEST.md) - Copy-Paste Testfälle für Perplexity/Claude
- 🚀 [PRODUCTION-SETUP.md](PRODUCTION-SETUP.md) - Produktiv-Einrichtung
- 📋 [CHANGELOG.md](CHANGELOG.md) - Versions-Historie

---

**🎉 Viel Erfolg mit automatischer OCR-Verarbeitung!**
