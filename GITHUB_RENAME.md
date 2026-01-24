# GitHub Repository Umbenennung

## 🎯 Neuer Name

**perplexity-mcp-briefing**

Professioneller, klarer Name der zeigt:
- ✅ Für Perplexity
- ✅ Nutzt MCP Protokoll
- ✅ Zweck: Briefing

## 📋 Schritte

### 1. Auf GitHub umbenennen

1. Gehe zu https://github.com/AndreasDietzel/briefing
2. Klicke auf "Settings"
3. Unter "Repository name" eingeben: `perplexity-mcp-briefing`
4. Klicke "Rename"

### 2. Lokale Git-Config aktualisieren

```bash
cd /Users/andreasdietzel/Projects/briefing-mcp-server
git remote set-url origin https://github.com/AndreasDietzel/perplexity-mcp-briefing.git
```

### 3. Prüfen

```bash
git remote -v
# Sollte zeigen:
# origin  https://github.com/AndreasDietzel/perplexity-mcp-briefing.git (fetch)
# origin  https://github.com/AndreasDietzel/perplexity-mcp-briefing.git (push)
```

### 4. Änderungen pushen

```bash
npm run build  # Neu kompilieren
git add -A
git commit -m "chore: Rename to perplexity-mcp-briefing - professional naming

- Updated package.json: perplexity-mcp-briefing v1.0.0
- New README with professional structure
- Added badges and improved documentation
- Better keywords for discoverability"
git push
```

### 5. Perplexity Config aktualisieren

Ändere in `~/.config/perplexity/mcp.json`:

```json
{
  "mcpServers": {
    "briefing": {
      "type": "stdio",
      "command": "/usr/local/bin/node",
      "args": ["/Users/andreasdietzel/Projects/briefing-mcp-server/build/index.js"]
    }
  }
}
```

**Hinweis:** Pfad bleibt gleich, nur GitHub-Name ändert sich!

### 6. GitHub Repository Description

Unter Settings → About → Description:

```
Professional MCP Server for Perplexity: Automated daily briefings from macOS (Weather, Calendar, Reminders, Mail, News) - Optimized to ~1 second
```

Topics hinzufügen:
- `mcp`
- `model-context-protocol`
- `perplexity`
- `briefing`
- `macos`
- `productivity`
- `calendar`
- `weather`
- `typescript`

---

## ✅ Nach der Umbenennung

- [x] package.json aktualisiert
- [x] README professionell gestaltet
- [x] Version auf 1.0.0 erhöht
- [ ] GitHub umbenennen
- [ ] Lokale Git-Config anpassen
- [ ] Änderungen pushen
- [ ] GitHub Description setzen
