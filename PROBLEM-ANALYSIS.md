# 🔍 Ursachenanalyse: Warum Perplexity PDFs nicht lesen kann

## 📋 Zusammenfassung

**Hauptproblem**: Deine PDFs sind **gescannte Bilder ohne Text-Layer** (image-based PDFs)

## 🔎 Diagnose der PDFs

### Getestete Dateien:
- `2026-01-31_Scan_1.pdf` (1,39 MB)
- `2026-01-31_Scan_2.pdf` (1,79 MB)

### Ergebnis:
```
Text extrahiert: nur 2 Zeichen ("\n\n")
Dateigröße: 1,39 MB bzw. 1,79 MB
Typ: Gescannte Bilder ohne OCR-Text-Layer
```

## ⚠️ Das Problem

### 1. Perplexity nutzt die MCP-Tools nicht
**Symptom**: Perplexity sagt "PDF-Tools funktionieren nicht" und schaut nur auf Dateigröße/Datum

**Ursache**: 
- Perplexity erkennt die Tools nicht oder wählt sie nicht aus
- Möglicherweise wurde der Server nicht geladen

**Lösung**: 
```bash
# Beende Perplexity komplett
killall Perplexity

# Starte neu und teste:
"Welche MCP-Tools hast du? Zeige mir alle mit 'analyze'"
```

### 2. PDFs sind gescannte Bilder (keine Texte)
**Symptom**: Der Server extrahiert nur 2 Zeichen Text

**Ursache**: 
- Scanner erstellt Bild-PDFs (wie fotografierte Seiten)
- Kein OCR-Text-Layer vorhanden
- pdf-parse kann nur Text extrahieren, keine Bilder lesen

**Technische Details**:
```
Normale PDF mit Text:     Scanner liest Text → Text-Layer vorhanden
Gescannte PDF (deine):    Scanner macht Foto → Nur Bild, kein Text
PDF mit OCR:              Scanner macht Foto → OCR → Text-Layer hinzugefügt
```

### 3. OCR-Fallback für PDFs nicht implementiert
**Symptom**: Server meldet "OCR requires image conversion"

**Ursache**: 
- Tesseract.js kann direkt Bilder (.png, .jpg) lesen
- PDFs müssen erst in Bilder konvertiert werden
- Diese Konvertierung ist noch nicht implementiert

## ✅ Was FUNKTIONIERT

### Der MCP-Server kann:
1. ✅ **PDFs mit Text-Layer** lesen (normale PDFs)
2. ✅ **Bilder direkt** per OCR lesen (.png, .jpg, .jpeg)
3. ✅ **DOCX, Pages, TXT** Dateien analysieren
4. ✅ **Batch-Verarbeitung** von Ordnern
5. ✅ **Metadaten** extrahieren (Datum, Referenzen, Keywords)

### Was NICHT funktioniert:
1. ❌ **Gescannte PDFs** (Bild-PDFs ohne Text-Layer)
2. ❌ **OCR für PDF-Bilder** (benötigt PDF → Bild Konvertierung)

## 🛠️ Lösungen

### Option 1: Scanner-Einstellungen ändern (EMPFOHLEN)
**Aktiviere OCR beim Scannen:**

1. Öffne deine Scanner-Software
2. Suche nach "OCR" oder "Texterkennung"
3. Aktiviere: "PDF mit durchsuchbarem Text" oder "PDF/A"
4. Sprache: Deutsch

**Ergebnis**: Scanner erstellt PDFs mit Text-Layer → Server kann sie lesen

### Option 2: Bilder statt PDFs scannen
**Wenn Scanner kein OCR hat:**

1. Scanne als `.jpg` oder `.png` statt `.pdf`
2. Unser Server hat OCR für Bilder bereits implementiert
3. Tesseract.js liest dann den Text

**Beispiel**:
```
Statt: 2026-01-31_Scan_1.pdf (kann nicht gelesen werden)
Nutze: 2026-01-31_Scan_1.jpg (wird per OCR gelesen)
```

### Option 3: PDFs nachträglich mit OCR versehen
**Mit macOS Vorschau oder Adobe Acrobat:**

1. Öffne PDF in Vorschau/Acrobat
2. Exportiere als "PDF mit OCR"
3. Oder nutze Online-Tools wie OCRmyPDF

### Option 4: Manuelle Organisation (AKTUELL)
**Bis OCR für PDFs implementiert ist:**

Da der Server den Inhalt nicht lesen kann, nutzt Perplexity nur:
- Dateiname: `2026-01-31_Scan_X.pdf`
- Erstelldatum: 31.01.2026
- Dateigröße: 1,39 MB / 1,79 MB

**Manuelle Einordnung erforderlich**:
```
Du musst dem Server/Perplexity sagen:
"Scan_1 ist eine Rechnung von Telekom"
"Scan_2 ist ein Vertrag von Vodafone"

Dann kann er sie richtig einordnen.
```

## 🚀 Roadmap: PDF-OCR Implementation

### Was fehlt:
```typescript
// Benötigt: PDF → Bild Konvertierung
1. npm install pdf-poppler  // oder pdf2pic
2. PDF in einzelne Seiten/Bilder konvertieren
3. Jedes Bild per Tesseract.js scannen
4. Text aus allen Seiten kombinieren
```

### Geschätzte Implementierungszeit:
- **Einfache Version**: 2-3 Stunden
- **Production-ready**: 1 Tag (mit Error Handling, Caching, Progress)

## 📊 Test-Ergebnis

```json
{
  "originalFilename": "2026-01-31_Scan_1.pdf",
  "textLength": 2,
  "documentType": "pdf",
  "preview": "\n\n",
  "ocrAttempted": true,
  "ocrSuccess": false,
  "warning": "PDF appears to be scanned without text layer. OCR for PDFs requires image conversion."
}
```

## ✅ Sofort-Lösung für dich

### Teste mit Bildern:
```bash
# Wenn du ein Testbild hast:
"Analysiere diese Bilddatei:
/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/test.jpg

Extrahiere Text per OCR."
```

### Oder mit Text-PDFs:
```bash
# Falls du PDFs mit Text-Layer hast:
"Analysiere diese PDF (normale, keine gescannte):
/pfad/zur/normalen.pdf"
```

### Für deine gescannten PDFs:
```
1. Option: Scanne neu mit OCR-Funktion aktiviert
2. Option: Scanne als .jpg statt .pdf
3. Option: Nutze OCRmyPDF oder Acrobat Pro
4. Option: Warte auf PDF-OCR Implementation im Server
```

---

**Status**: ✅ Problem identifiziert, Workarounds verfügbar  
**Update**: 31. Januar 2026  
**Version**: 4.1.0
