# 🛠️ Reparatur nach OCR-Scan Problemen

## Was ist passiert?

Das ursprüngliche OCR-Script (`ocr-enhanced-scan.js`) hatte zwei Probleme:

1. **"null" in Dateinamen**: Wenn keine Entity/Typ erkannt wurde, wurde `_null` in den Dateinamen eingefügt
2. **Falsche Jahr-Verschiebungen**: Dateien wurden zwischen Jahren verschoben basierend auf erkannten Daten im Text

## Was wurde repariert?

### ✅ Phase 1: "null"-Problem behoben

Script: `scripts/repair-after-ocr-scan.js`

**Ergebnis:**
- 19 Dateien mit "null" im Namen gefunden
- Alle umbenannt zu "Dokument" oder "Bild"
- Dateien blieben in ihren aktuellen Ordnern

**Beispiel:**
```
❌ Vorher: 2026-01-01_null.pdf
✅ Nachher: 2026-01-01_Dokument.pdf
```

### ✅ Phase 2: Jahr-Verschiebungen rückgängig gemacht

Script: `scripts/undo-year-moves.js`

**Ergebnis:**
- 45 falsche Jahr-Verschiebungen gefunden (aus Log-Datei)
- Alle Dateien zurück in ihre ursprünglichen Jahre verschoben

**Beispiele:**
```
✅ 2003 → 2004: 2003-11-05.pdf (zurückverschoben)
✅ 1979 → 2013: 1979-06-22_Vertrag.pdf (zurückverschoben)
✅ 2023 → 2024: 2023-12-31_Rechnung.pdf (zurückverschoben)
```

## Neues sicheres Script

### safe-ocr-scan.js

Ein verbessertes OCR-Script mit folgenden Fixes:

✅ **Keine Jahr-Änderungen**
- Dateien bleiben in ihrem aktuellen Jahresordner
- Jahr wird nur aus Ordnerstruktur übernommen, nicht aus Textinhalt

✅ **Kein "null" mehr**
- Fallback zu "Dokument" oder "Scan" wenn keine Entity erkannt
- Immer sinnvolle Dateinamen

✅ **Vodafone korrekt kategorisiert**
- Vodafone → 11_Telekommunikation (nicht Versicherung)

✅ **Sichere Datums-Verwendung**
- Datum nur für Dateiname, nicht für Jahr-Verschiebung
- Fallback: Jahr aus Ordner + 01-01

## Verwendung der Repair-Scripts

### 1. "null"-Problem beheben

```bash
node scripts/repair-after-ocr-scan.js
```

**Was passiert:**
- Sucht alle Dateien mit "null" im Namen
- Benennt sie um zu sinnvollen Namen
- Bleibt im selben Ordner

### 2. Jahr-Verschiebungen rückgängig machen

```bash
node scripts/undo-year-moves.js
```

**Voraussetzung:**
- Log-Datei vom OCR-Scan muss existieren
- Log wird analysiert um ursprüngliche Jahre zu finden

**Was passiert:**
- Liest `ocr-full-scan-*.log`
- Findet alle Jahr-Änderungen
- Verschiebt Dateien zurück

### 3. Sicherer OCR-Scan (neu)

```bash
node scripts/safe-ocr-scan.js
```

**Unterschied zum alten Script:**
- ✅ KEINE Jahr-Verschiebungen
- ✅ KEIN "null" in Namen
- ✅ Vodafone korrekt kategorisiert

## Statistik der Reparatur

| Aktion | Anzahl | Status |
|--------|--------|--------|
| "null"-Dateien repariert | 19 | ✅ Erledigt |
| Jahr-Verschiebungen rückgängig | 45 | ✅ Erledigt |
| Gesamte Dateien betroffen | 64 | ✅ Alle repariert |

## Lessons Learned

### ❌ Was schiefging im alten Script

1. **Jahr aus Text extrahiert**
   ```javascript
   // FALSCH: Verwendete erkanntes Datum für Jahr-Zuordnung
   const year = detectedDate.match(/^(\d{4})/)[1];
   ```
   Problem: Alte Dokumente mit historischen Daten wurden falsch einsortiert

2. **"null" bei fehlenden Infos**
   ```javascript
   // FALSCH: Verwendete string "null"
   const entityPart = entity ? `_${entity}` : '_null';
   ```
   Problem: Dateinamen wie "2026-01-01_null.pdf"

3. **Keine Jahr-Konservierung**
   ```javascript
   // FALSCH: Erstellte neue Jahr-Pfade
   const targetPath = path.join(ARCHIVE, decade, detectedYear, category);
   ```
   Problem: Dateien zwischen Jahren verschoben

### ✅ Was jetzt richtig ist

1. **Jahr aus Ordner übernehmen**
   ```javascript
   // RICHTIG: Jahr aus aktuellem Pfad
   const year = currentYear; // Aus Ordnerstruktur
   const targetPath = path.join(dir, category); // Selber Jahr-Ordner
   ```

2. **Sinnvolle Fallbacks**
   ```javascript
   // RICHTIG: Fallback zu "Dokument"
   const typePart = docType !== 'Dokument' ? `_${docType}` : '';
   const entityPart = entity ? `_${entity}` : '';
   ```

3. **Datum nur für Dateinamen**
   ```javascript
   // RICHTIG: Datum aus Text NUR für Dateiname
   const dateForFilename = detectedDate || `${year}-01-01`;
   // Jahr kommt aus Ordner, nicht aus Datum!
   ```

## Empfehlung für Zukunft

1. **Verwende `safe-ocr-scan.js`** statt dem alten Script
2. **Immer erst Dry-Run** mit wenigen Dateien testen
3. **Log-Dateien aufheben** für potentielle Reparaturen
4. **Backup vor großen Operationen** erstellen

## Kommandos für Wiederherstellung

Falls es nochmal passiert:

```bash
# 1. "null"-Problem beheben
node scripts/repair-after-ocr-scan.js

# 2. Jahr-Verschiebungen rückgängig (benötigt Log)
node scripts/undo-year-moves.js

# 3. Alternative: Manuelles Verschieben
# Finde alle Dateien mit falschem Jahr:
find /pfad/zum/archiv/Zwanziger/2026 -name "2025-*.pdf" -o -name "2024-*.pdf"

# Verschiebe manuell:
# mv "Zwanziger/2026/Kategorie/2025-XX-XX_File.pdf" "Zwanziger/2025/Kategorie/"
```

## Status

✅ **Alle Probleme behoben**
- Keine "null"-Dateien mehr
- Alle Dateien in ihren ursprünglichen Jahren
- Neues sicheres Script verfügbar

🎉 **Archiv ist wieder konsistent!**
