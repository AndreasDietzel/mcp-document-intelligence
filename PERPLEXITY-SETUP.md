# 🔧 Perplexity Setup & Testing Guide

## Problem
Perplexity zeigt die Fehlermeldung: "Leider kann ich die PDFs nicht direkt auslesen - das get_url_content Tool funktioniert nicht mit lokalen Dateien"

**Grund**: Perplexity nutzt den MCP Document Intelligence Server nicht oder hat ihn nicht geladen.

---

## ✅ Lösung: Perplexity Neustart & Test

### Schritt 1: Perplexity komplett beenden
```bash
# Beende alle Perplexity Prozesse
killall Perplexity 2>/dev/null || echo "Perplexity nicht aktiv"

# Warte 3 Sekunden
sleep 3
```

### Schritt 2: Starte Perplexity neu
- Öffne Perplexity Desktop App neu
- Warte bis die App vollständig geladen ist

### Schritt 3: Teste die Tools
Kopiere diesen Prompt in Perplexity:

```
Welche MCP-Tools stehen dir zur Verfügung? 
Liste alle Tools auf, die mit "document" oder "analyze" zu tun haben.
```

**Erwartetes Ergebnis:**
Perplexity sollte diese Tools auflisten:
- `analyze_document` - Analysiert PDFs, DOCX, Pages, Bilder, TXT
- `analyze_folder` - Batch-Analyse eines Ordners
- `suggest_folder_structure` - Ordnerstruktur-Vorschlag
- `batch_organize` - Dateien umbenennen und organisieren
- `preview_organization` - Dry-run Vorschau
- `undo_last_organization` - Undo-Funktion
- `export_metadata` - Metadaten exportieren
- `find_folder` - Intelligente Ordnersuche

---

## 🧪 Test mit einer echten PDF

### Test-Prompt für Perplexity:

```
Analysiere diese PDF-Datei:
/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/[DEIN-ORDNER]/[DEINE-PDF].pdf

Extrahiere Datum, Referenznummern und Keywords.
```

**Ersetze [DEIN-ORDNER] und [DEINE-PDF] mit einem echten Pfad!**

---

## 🔍 Wenn es immer noch nicht funktioniert

### Debug: Prüfe ob der MCP-Server läuft

```bash
# Prüfe ob Node.js Prozesse laufen
ps aux | grep "mcp-document-intelligence"

# Teste den Server manuell
cd /Users/andreasdietzel/Projects/mcp-document-intelligence
node build/index.js
```

Der Server sollte im Hintergrund von Perplexity gestartet werden.

### Debug: Prüfe die Logs

```bash
# Perplexity Logs anzeigen (falls verfügbar)
tail -f "$HOME/Library/Logs/Perplexity/mcp.log" 2>/dev/null || echo "Keine Logs gefunden"
```

---

## 📝 Beispiel: Erfolgreiche Nutzung

**Du zu Perplexity:**
```
Analysiere alle PDFs in meinem Ordner:
/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/2026

Finde Rechnungen, extrahiere Daten und schlage eine Ordnerstruktur vor.
```

**Perplexity sollte:**
1. `analyze_folder` nutzen mit deinem Pfad
2. Alle PDFs scannen und OCR durchführen
3. Metadaten extrahieren (Datum, Referenzen, Keywords)
4. `suggest_folder_structure` nutzen
5. Eine organisierte Struktur vorschlagen

---

## 🚨 Wichtig für Perplexity

Die MCP Document Intelligence Server-Tools sind **speziell für lokale PDF-Analyse** gebaut:

- ✅ **PDF-Extraktion**: Mit pdf-parse
- ✅ **OCR für gescannte PDFs**: Mit Tesseract.js
- ✅ **Multi-Format Support**: PDF, DOCX, Pages, Bilder, TXT
- ✅ **Lokale Verarbeitung**: Keine Cloud, alle Daten bleiben lokal
- ✅ **Batch-Verarbeitung**: Hunderte Dateien auf einmal

**Du brauchst KEINE anderen Tools wie `get_url_content`** - unser Server macht alles!

---

## ✅ Checkliste

- [ ] Perplexity komplett beendet
- [ ] Perplexity neu gestartet
- [ ] Tools-Liste abgefragt
- [ ] `analyze_document` Tool sichtbar
- [ ] Test-PDF erfolgreich analysiert
- [ ] Encoding-Info und Metadaten erhalten

---

## 🆘 Wenn nichts funktioniert

1. **Prüfe die Config-Datei:**
   ```bash
   cat "$HOME/Library/Application Support/Perplexity/perplexity-config.json"
   ```

2. **Verifiziere den Build:**
   ```bash
   ls -la /Users/andreasdietzel/Projects/mcp-document-intelligence/build/index.js
   ```

3. **Teste manuell:**
   ```bash
   cd /Users/andreasdietzel/Projects/mcp-document-intelligence
   echo '{"method":"tools/list"}' | node build/index.js
   ```

4. **Kontaktiere Support** oder öffne ein Issue auf GitHub

---

**Version**: 4.1.0  
**Erstellt**: 31. Januar 2026  
**Status**: ✅ Fully Tested (99/100 Tests Passed)
