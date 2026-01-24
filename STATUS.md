# 🚧 Status & Bekannte Probleme

## ✅ Was funktioniert

### 📧 Mail-Integration
- ✅ Ungelesene E-Mails werden erfolgreich abgerufen
- ✅ Zeigt Betreff, Absender und Datum
- ✅ Limit auf Top 10

### 📅 Kalender-Integration  
- ✅ Zugriff auf alle Kalender (18 gefunden)
- ✅ Zeitraum-Filter funktioniert (heute, Wochenende, Woche)
- ⚠️ Aktuell keine Events für heute vorhanden (daher leere Ausgabe)

## ⚠️ Bekannte Probleme

### 1. Reminders-App Timeout
**Problem:** 
```
AppleEvent lieferte eine Zeitüberschreitung. (-1712)
```

**Ursache:**
- 14 Reminders-Listen vorhanden
- Das Abfragen aller Listen gleichzeitig ist zu umfangreich
- AppleScript-Timeout wird überschritten

**Lösung-Optionen:**

#### Option A: Nur wichtigste Listen (EMPFOHLEN)
```applescript
-- Nur die ersten 3 Listen abfragen
set maxLists to 3
set listCount to 0
repeat with lst in allLists
  -- Query nur von wenigen Listen
  set listCount to listCount + 1
  if listCount > maxLists then exit repeat
end repeat
```

#### Option B: Einzelne Liste explizit
```applescript
-- Nur "Aufgaben" oder "Erinnerungen" Liste
set targetList to list "Aufgaben"
set theReminders to (every reminder of targetList whose completed is false)
```

#### Option C: Async/Parallel Queries
- Mehrere separate AppleScript-Calls
- Jeder Call nur 1-2 Listen

## 🔧 Nächste Schritte

1. **Reminders-Integration fixen**
   - [ ] Wichtigste Listen identifizieren
   - [ ] Script anpassen (nur Top 3-5 Listen)
   - [ ] Testen

2. **Zusätzliche Features**
   - [ ] Wetter-API Integration
   - [ ] News-Feed hinzufügen
   - [ ] Notizen (Notes.app)
   - [ ] Geburtstage aus Kontakten

3. **Perplexity Support abwarten**
   - [ ] MCP-Support wird von Perplexity implementiert
   - [ ] Dann kann der Server direkt verwendet werden

## 🧪 Aktueller Test-Status

```bash
✅ Mail:      2 ungelesene E-Mails gefunden
✅ Kalender:  18 Kalender zugänglich (keine Events heute)
❌ Reminders: Timeout bei 14 Listen
```

## 💡 Workaround für Testing

**Claude Desktop verwenden:**
Da Claude Desktop bereits MCP unterstützt, kannst du dort testen:

1. Config: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Server hinzufügen
3. Claude Desktop neu starten
4. "Erstelle mir ein Briefing für heute"

---

**Letztes Update:** 24. Januar 2026  
**Status:** Mail + Kalender funktionieren, Reminders benötigt Optimierung
