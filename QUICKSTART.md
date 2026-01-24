# 🚀 Quickstart Guide

## 1. Installation

```bash
cd /path/to/your/briefing-mcp-server
npm install
npm run build
```

## 2. Konfiguration für Perplexity / Claude Desktop

Füge in deiner MCP-Konfigurationsdatei hinzu:

**Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "briefing": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/YOUR/briefing-mcp-server/build/index.js"]
    }
  }
}
```

## 3. Berechtigungen

macOS wird nach Berechtigungen für folgende Apps fragen:
- ✅ **Kalender** - Zugriff erlauben
- ✅ **Erinnerungen** - Zugriff erlauben
- ✅ **Mail** - Zugriff erlauben

## 4. Test

Starte Claude Desktop / Perplexity neu und teste:

```
Erstelle mir ein Briefing für heute
```

Oder:

```
Zeige mir meine Termine für das Wochenende
```

## 5. Verfügbare Befehle

- **"Briefing für heute"** - Standard-Briefing
- **"Briefing für das Wochenende"** - Samstag bis Sonntag
- **"Briefing für die kommende Woche"** - Nächste 7 Tage
- **"Zeige meine Erinnerungen"** - Nur Erinnerungen
- **"Ungelesene E-Mails"** - Top 10 ungelesene Mails

## 6. Nächste Schritte

- [ ] Wetter-Integration hinzufügen
- [ ] News-API anbinden
- [ ] Geburtstage aus Kontakten
- [ ] MoneyMoney-Finanzübersicht
- [ ] Notizen (Notes.app)
