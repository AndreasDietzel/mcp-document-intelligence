# Perplexity Briefing MCP Server

Ein Model Context Protocol (MCP) Server für **Perplexity** und andere MCP-Clients, der personalisierte Briefings aus verschiedenen Mac-Datenquellen erstellt.

## 🎯 Ziel

Perplexity (und anderen MCP-fähigen AI-Clients) eine umfassende Zusammenfassung aus lokalen Mac-Datenquellen bereitzustellen:
- 📅 Kalender (Calendar.app)
- ✅ Erinnerungen (Reminders.app)
- 📧 Mail (ungelesen, wichtig)
- 📰 News aus dem Internet
- 🌤️ Wetter
- 💰 Finanzen (optional: MoneyMoney Integration)
- 🎂 Geburtstage
- 📝 Notizen

## ⏰ Zeiträume

Das Briefing kann sich beziehen auf:
- **Heute** (Standard)
- **Wochenende**
- **Kommende Woche**
- **Beliebiger Zeitraum** (definierbar)

## 🛠️ Installation

```bash
npm install
npm run build
```

## 🚀 Verwendung mit Perplexity / Claude Desktop

Konfiguration in der MCP-Settings-Datei (sobald Perplexity MCP unterstützt):

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

## 📋 Verfügbare Tools

- `get_briefing` - Hauptfunktion für personalisiertes Briefing
- `get_calendar_events` - Kalendereinträge für Zeitraum
- `get_reminders` - Fällige Erinnerungen/Aufgaben
- `get_unread_mail` - Ungelesene E-Mails
- `get_weather` - Wettervorhersage
- `get_news` - Aktuelle Nachrichten
- `get_birthdays` - Anstehende Geburtstage
- `get_notes` - Zuletzt bearbeitete Notizen

## 🔧 Technologie

- TypeScript
- Model Context Protocol (MCP)
- AppleScript für Mac-Integration
- Node.js

## 📝 Lizenz

MIT
