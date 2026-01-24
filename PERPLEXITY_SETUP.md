# Perplexity Integration für Briefing MCP Server

## ✅ Setup abgeschlossen!

Der Briefing-Server wurde erfolgreich zur Perplexity MCP-Config hinzugefügt.

### Aktuelle Config (`~/.config/perplexity/mcp.json`):

```json
{
  "mcpServers": {
    "moneymoney": {
      "type": "stdio",
      "command": "/usr/local/bin/node",
      "args": ["/Users/andreasdietzel/Projects/moneymoney-mcp-server/dist/index.js"]
    },
    "briefing": {
      "type": "stdio",
      "command": "/usr/local/bin/node",
      "args": ["/Users/andreasdietzel/Projects/briefing-mcp-server/build/index.js"]
    }
  }
}
```

## 🚀 Jetzt testen

### 1. Perplexity neu starten

Schließe Perplexity komplett und starte es neu.

### 2. Test-Prompts

Probiere folgende Prompts:

```
Erstelle mir ein Briefing für heute
```

```
Welche E-Mails habe ich ungelesen?
```

```
Zeige mir meine Termine für heute
```

```
Was sind meine offenen Erinnerungen?
```

## ⚠️ Mögliche Probleme

### Problem: "Server lädt sehr lange"

**Ursache:** AppleScript-Aufrufe können einige Sekunden dauern

**Lösung:** 
- Warte 10-15 Sekunden auf erste Antwort
- Die Apps (Calendar, Reminders, Mail) müssen laufen

### Problem: "Keine Daten"

**Checks:**
1. Sind die Apps gestartet?
   - Kalender.app
   - Erinnerungen.app  
   - Mail.app

2. Server-Log prüfen:
```bash
# Test direkt im Terminal
cd /Users/andreasdietzel/Projects/briefing-mcp-server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_unread_mail","arguments":{}}}' | node build/index.js
```

3. Berechtigungen prüfen:
   - Systemeinstellungen → Datenschutz & Sicherheit
   - "Automation" → Perplexity erlauben

## 🔍 Debug: Server direkt testen

```bash
cd /Users/andreasdietzel/Projects/briefing-mcp-server

# Test Mail
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_unread_mail","arguments":{}}}' | node build/index.js 2>&1 | grep -A 20 result

# Test Kalender
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_calendar_events","arguments":{"timeframe":"heute"}}}' | node build/index.js 2>&1 | grep -A 20 result

# Test Erinnerungen
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_reminders","arguments":{}}}' | node build/index.js 2>&1 | grep -A 20 result
```

## 📊 Vergleich: MoneyMoney vs. Briefing

| Feature | MoneyMoney | Briefing |
|---------|-----------|----------|
| Output-Verzeichnis | `dist/` | `build/` |
| Entry Point | `dist/index.js` | `build/index.js` |
| Datenquellen | MoneyMoney.app | Kalender, Mail, Reminders |
| Performance | Schnell (lokale Dateien) | Langsamer (AppleScript) |

## ✅ Erwartete Performance

- **Mail:** ~2-3 Sekunden
- **Kalender:** ~3-5 Sekunden (je nach Anzahl Kalender)
- **Reminders:** ~2-3 Sekunden (nur erste Liste)
- **Komplettes Briefing:** ~8-12 Sekunden

Wenn Perplexity "sehr lange versucht", ist das normal für den ersten Aufruf. Die AppleScript-Aufrufe brauchen einfach Zeit.

---

**Hinweis:** Die lokale `perplexity-config.json` in diesem Repo ist nur als Referenz. Die **echte** Config muss in Perplexity's Application Support Ordner liegen.
