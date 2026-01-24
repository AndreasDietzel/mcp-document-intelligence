# 🔐 Security & Privacy Guidelines

## ✅ Was ist geschützt

### Automatisch ignoriert (`.gitignore`):
- ✅ **Environment-Variablen** (`.env`, `.env.local`)
- ✅ **Persönliche Configs** (`*-config.json`, außer `.example`)
- ✅ **Build-Outputs** (`build/`, `node_modules/`)
- ✅ **Logs** (`*.log`)

## 📋 Setup für neue User

### 1. Clone Repository
```bash
git clone https://github.com/YOUR_USERNAME/briefing.git
cd briefing
```

### 2. Installation
```bash
npm install
npm run build
```

### 3. Konfiguration für MCP Client
Passe den Pfad in deiner MCP-Config an:
```json
{
  "mcpServers": {
    "briefing": {
      "command": "node",
      "args": ["/DEIN/ABSOLUTER/PFAD/briefing-mcp-server/build/index.js"]
    }
  }
}
```

## 🛡️ Privatsphäre

### macOS Berechtigungen
Der Server greift auf folgende Mac-Dienste zu:
- 📅 **Kalender** (Calendar.app) - Nur lokaler Lesezugriff
- ✅ **Erinnerungen** (Reminders.app) - Nur lokaler Lesezugriff
- 📧 **Mail** (Mail.app) - Nur lokaler Lesezugriff

**Wichtig:** Alle Daten bleiben auf deinem Mac. Nichts wird ins Internet gesendet!

### Für Contributor
- ❌ Keine echten Kalendereinträge in Screenshots
- ❌ Keine persönlichen E-Mail-Adressen in Examples
- ✅ Nutze anonymisierte Demo-Daten

---

**Status:** ✅ Repo ist anonym und privacy-friendly
