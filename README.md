# Perplexity Briefing MCP Server

Ein Model Context Protocol (MCP) Server für **Perplexity** und andere MCP-Clients, der personalisierte Briefings aus verschiedenen Mac-Datenquellen erstellt.

**⚡ Performance:** ~1 Sekunde für komplettes Briefing (dramatisch optimiert!)

## ✨ Features

- 🌤️ **Wetter**: Aktuelle Wetterdaten von macOS Wetter-App
- 📅 **Kalender**: Termine aus deinen wichtigsten Kalendern (3 Hauptkalender)
- ✅ **Erinnerungen**: Heute fällige Aufgaben
- 📧 **E-Mails**: Top 5 ungelesene Nachrichten aus der Inbox
- 📰 **Nachrichten**: Aktuelle News von der Tagesschau

**Siehe [PERFORMANCE.md](PERFORMANCE.md) für Details zur Optimierung.**

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

- `get_briefing` - Komplettes Briefing (Wetter + Kalender + Erinnerungen + Mail + News)
- `get_weather` - Aktuelles Wetter von macOS Wetter-App
- `get_calendar_events` - Kalendereinträge für Zeitraum (3 Hauptkalender)
- `get_reminders` - Heute fällige Erinnerungen
- `get_unread_mail` - Top 5 ungelesene E-Mails aus Inbox
- `get_news` - Aktuelle Nachrichten (Tagesschau oder andere Quelle)
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
