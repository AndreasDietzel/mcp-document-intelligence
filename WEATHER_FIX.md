# Wetter-Problem: macOS Weather.app hat keine AppleScript-Unterstützung

## 🐛 Problem

Die macOS Weather.app (`/System/Applications/Weather.app`) unterstützt **kein AppleScript**.

### Fehler:
```
30:40: execution error: „Weather" hat einen Fehler erhalten: „every property" kann nicht gelesen werden. (-1728)
```

### Auswirkung:
- Briefing zeigt: "Es liegen aktuell keine detaillierten Wetterdaten vor"
- `get_weather` Tool gibt leere Daten zurück

## ✅ Lösung

### Option 1: wttr.in Web API (empfohlen)
- ✅ Kostenlos, kein API-Key nötig
- ✅ Open Source
- ✅ Automatische Standort-Erkennung per IP

**Implementierung in `src/index.ts`:**

Ersetze die `getWeather()` Funktion (Zeile 174-191) mit:

```typescript
async function getWeather(): Promise<string> {
  // macOS Weather.app hat keine AppleScript-Unterstützung
  // Verwende wttr.in Web API (Open Source, kein API-Key nötig)
  try {
    const https = await import('https');
    
    return new Promise<string>((resolve) => {
      const timeout = setTimeout(() => {
        resolve("Wetterdaten nicht verfügbar (Timeout)");
      }, 3000);
      
      https.get('https://wttr.in/?format=%l:+%C+%t+(H:+%h+L:+%l)', (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk.toString());
        res.on('end', () => {
          clearTimeout(timeout);
          if (data && data.trim()) {
            resolve(data.trim().replace(/not found/g, 'N/A'));
          } else {
            resolve("Wetterdaten nicht verfügbar");
          }
        });
      }).on('error', () => {
        clearTimeout(timeout);
        resolve("Wetterdaten nicht verfügbar (Fehler)");
      });
    });
  } catch (error) {
    return "Wetterdaten nicht verfügbar";
  }
}
```

**Ausgabe-Format:**
```
München: Freezing fog -2°C (H: 93% L: N/A)
```

### Option 2: OpenWeatherMap API
- Benötigt API-Key (kostenlos für 1000 Calls/Tag)
- Genauere Daten
- Mehrere Städte konfigurierbar

### Option 3: Wetter-Feature deaktivieren
Wenn du kein Wetter brauchst, entferne einfach den Wetter-Teil aus `getBriefing()`.

## 🔧 Schnellfix anwenden

```bash
cd /Users/andreasdietzel/Projects/briefing-mcp-server

# Backup erstellen
cp src/index.ts src/index.ts.backup

# Manuelle Änderung der Funktion (siehe oben)
# Oder: sed-Befehl (kompliziert wegen Multiline)

# Neu kompilieren
npm run build

# Testen
./test-performance.sh

# Committen
git add src/index.ts
git commit -m "fix: Replace Weather.app with wttr.in API - Weather.app has no AppleScript support"
git push
```

## 🧪 Test

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_weather","arguments":{}}}' | node build/index.js 2>/dev/null
```

**Erwartete Ausgabe:**
```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "München: Freezing fog -2°C (H: 93% L: N/A)"
      }
    ]
  }
}
```

## 📚 Weitere Informationen

- **wttr.in Dokumentation:** https://github.com/chubin/wttr.in
- **Formatierung:** `?format=%l:+%C+%t+(H:+%h+L:+%l)`
  - `%l` = Standort (Location)
  - `%C` = Wetterbedingung (Condition)
  - `%t` = Temperatur
  - `%h` = Luftfeuchtigkeit (Humidity) 
  - `%l` = Niederschlag (Low/Precipitation)

## ⚠️ Hinweis

Die ursprüngliche Implementierung ging davon aus, dass Weather.app AppleScript unterstützt (wie Calendar, Mail, Reminders). Das ist jedoch **nicht der Fall**. Apple hat für Weather.app keine Scripting-Schnittstelle vorgesehen.
