#!/bin/bash

echo "🧪 Performance-Test für Briefing MCP Server"
echo "=========================================="
echo ""

# Test Weather (sollte schnell sein - nur 1 AppleScript Call)
echo "🌤️ Testing get_weather..."
time echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_weather","arguments":{}}}' | /usr/local/bin/node /Users/andreasdietzel/Projects/briefing-mcp-server/build/index.js 2>/dev/null | grep -A 20 '"text"'
echo ""

# Test Reminders (sollte schnell sein - nur heute fällig)
echo "✅ Testing get_reminders (nur heute fällig)..."
time echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_reminders","arguments":{}}}' | /usr/local/bin/node /Users/andreasdietzel/Projects/briefing-mcp-server/build/index.js 2>/dev/null | grep -A 20 '"text"'
echo ""

# Test Mail (sollte schnell sein - nur 5 Mails)
echo "📧 Testing get_unread_mail (nur 5 Mails)..."
time echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_unread_mail","arguments":{}}}' | /usr/local/bin/node /Users/andreasdietzel/Projects/briefing-mcp-server/build/index.js 2>/dev/null | grep -A 20 '"text"'
echo ""

# Test Calendar (sollte schnell sein - nur 3 Kalender)
echo "📅 Testing get_calendar_events (nur 3 Kalender)..."
time echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_calendar_events","arguments":{"timeframe":"heute"}}}' | /usr/local/bin/node /Users/andreasdietzel/Projects/briefing-mcp-server/build/index.js 2>/dev/null | grep -A 20 '"text"'
echo ""

# Test News (curl-basiert, sollte schnell sein)
echo "📰 Testing get_news..."
time echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_news","arguments":{}}}' | /usr/local/bin/node /Users/andreasdietzel/Projects/briefing-mcp-server/build/index.js 2>/dev/null | grep -A 20 '"text"'
echo ""

# Full Briefing (alle Tools kombiniert)
echo "📋 Testing get_briefing (KOMPLETT - sollte jetzt deutlich schneller sein)..."
time echo '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_briefing","arguments":{"timeframe":"heute"}}}' | /usr/local/bin/node /Users/andreasdietzel/Projects/briefing-mcp-server/build/index.js 2>/dev/null | grep -A 50 '"text"'
echo ""

echo "=========================================="
echo "Performance-Test abgeschlossen!"
echo ""
echo "Erwartete Zeiten:"
echo "  - Einzelne Tools: 0.5-2 Sekunden"
echo "  - Komplettes Briefing: 3-5 Sekunden (vorher 8-12 Sek)"
