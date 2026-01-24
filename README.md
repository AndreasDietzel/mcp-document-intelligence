# Perplexity MCP Briefing

**Professional Model Context Protocol Server for automated daily briefings**

Get instant, personalized briefings from your macOS data sources directly in Perplexity. Weather, calendar, reminders, emails, and news - all in under 1 second.

[![Performance](https://img.shields.io/badge/Performance-~1s-brightgreen)](PERFORMANCE.md)
[![MCP](https://img.shields.io/badge/MCP-1.0.4-blue)](https://github.com/modelcontextprotocol)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ⚡ Performance

**~1 second** for complete briefing with all data sources

See [PERFORMANCE.md](PERFORMANCE.md) for optimization details.

---

## ✨ Features

| Feature | Source | Speed |
|---------|--------|-------|
| 🌤️ **Weather** | macOS Weather App | 0.52s |
| 📅 **Calendar** | Calendar.app (top 3 calendars) | 0.37s |
| ✅ **Reminders** | Reminders.app (today's due) | 0.38s |
| 📧 **Mail** | Mail.app Inbox (top 5 unread) | 0.66s |
| 📰 **News** | Tagesschau RSS (configurable) | 0.48s |

---

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/AndreasDietzel/perplexity-mcp-briefing.git
cd perplexity-mcp-briefing
npm install
npm run build
```

### Configuration

Add to `~/.config/perplexity/mcp.json`:

```json
{
  "mcpServers": {
    "briefing": {
      "type": "stdio",
      "command": "/usr/local/bin/node",
      "args": ["/ABSOLUTE/PATH/TO/perplexity-mcp-briefing/build/index.js"]
    }
  }
}
```

### Usage

Restart Perplexity and ask:

```
Erstelle mir ein Briefing für heute
```

or

```
Give me a weekend briefing
```

---

## 📋 Available Tools

### `get_briefing`
Complete briefing with all data sources (~1s)

**Parameters:**
- `timeframe`: "heute" | "wochenende" | "woche" (default: "heute")

### `get_weather`
Current weather from macOS Weather App (0.52s)

### `get_calendar_events`
Calendar events for timeframe (0.37s)

**Parameters:**
- `timeframe`: "heute" | "wochenende" | "woche"

### `get_reminders`
Today's due reminders (0.38s)

### `get_unread_mail`
Top 5 unread emails from Inbox (0.66s)

### `get_news`
Latest news headlines (0.48s)

**Parameters:**
- `source`: "tagesschau" (default) or custom RSS feed

---

## 🎯 Optimizations

### Before
- ❌ 8-12 seconds for complete briefing
- ❌ Querying all 18 calendars
- ❌ All open reminders
- ❌ Top 10 emails from all mailboxes

### After
- ✅ ~1 second for complete briefing
- ✅ Top 3 calendars only
- ✅ Only today's due reminders
- ✅ Top 5 emails from Inbox only

**Result: 8-12x faster!**

---

## 🔒 Privacy & Security

All data stays local on your Mac:
- ✅ No external API calls for personal data
- ✅ No data storage or logging
- ✅ Direct AppleScript integration
- ✅ News only from public RSS feeds

See [SECURITY.md](SECURITY.md) for details.

---

## 📝 Example Output

```
📋 BRIEFING FÜR HEUTE (2026-01-24)

🌤️ WETTER:
München | 5°C | Bewölkt | H: 8°C L: 2°C

📅 KALENDER:
Team Meeting | Fr 24. Jan 2026 14:00 | Office
Dentist Appointment | Fr 24. Jan 2026 16:30 | Downtown

✅ HEUTE FÄLLIG:
• Finish presentation | Fr 24. Jan 2026 12:00
• Buy groceries | Fr 24. Jan 2026 18:00

📧 UNGELESENE E-MAILS:
Project Update | Von: boss@company.com | Fr 24. Jan 2026 09:15
Invoice #123 | Von: billing@service.com | Fr 24. Jan 2026 10:30

📰 NACHRICHTEN (Tagesschau):
• Breaking: Major policy announcement
• Economy: Markets show positive trend
• Technology: New AI breakthrough
```

---

## 🛠️ Development

### Build
```bash
npm run build
```

### Watch Mode
```bash
npm run watch
```

### Performance Test
```bash
./test-performance.sh
```

---

## 🌐 Use Cases

- **Morning Briefing**: Get daily overview before starting work
- **Weekend Planning**: See upcoming events and tasks
- **Quick Check**: Ask Perplexity for updates anytime
- **Travel Prep**: Check weather and appointments
- **Productivity**: Stay on top of tasks and emails

---

## 🤝 Contributing

Contributions welcome! Areas for improvement:

- [ ] Additional news sources (ARD, Spiegel, BBC)
- [ ] Configurable calendar selection
- [ ] Multiple reminder lists support
- [ ] Notes.app integration
- [ ] Birthdays from Contacts
- [ ] Caching for weather/news (target: <0.5s)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🙏 Acknowledgments

- Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol)
- Designed for [Perplexity](https://www.perplexity.ai/)
- Optimized for macOS

---

**Made with ❤️ for productive mornings**
