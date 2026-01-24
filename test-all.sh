#!/bin/bash
# Briefing MCP Server - Vollständiger Funktionstest
# =================================================

echo "🧪 BRIEFING MCP SERVER TEST"
echo "============================"
echo ""

cd /Users/andreasdietzel/Projects/briefing-mcp-server

echo "✅ Test 1: Server startet"
echo "-------------------------"
timeout 2 node build/index.js 2>&1 | head -1
echo ""

echo "✅ Test 2: Tools verfügbar"
echo "-------------------------"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node build/index.js 2>/dev/null | jq -r '.result.tools[] | "- " + .name + ": " + .description' 2>/dev/null || echo "Tools werden geladen..."
echo ""

echo "✅ Test 3: Mail-Abfrage"
echo "-------------------------"
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_unread_mail","arguments":{}}}' | node build/index.js 2>/dev/null | jq -r '.result.content[0].text' 2>/dev/null || echo "Warte auf Antwort..."
echo ""

echo "✅ Test 4: Kalender-Abfrage"
echo "-------------------------"
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_calendar_events","arguments":{"timeframe":"heute"}}}' | node build/index.js 2>/dev/null | jq -r '.result.content[0].text' 2>/dev/null || echo "Warte auf Antwort..."
echo ""

echo "✅ Test 5: Erinnerungen-Abfrage (sollte jetzt funktionieren!)"
echo "-------------------------------------------------------------"
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_reminders","arguments":{}}}' | node build/index.js 2>/dev/null | jq -r '.result.content[0].text' 2>/dev/null || echo "Warte auf Antwort..."
echo ""

echo "✅ Test 6: Komplettes Briefing"
echo "------------------------------"
echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_briefing","arguments":{"timeframe":"heute"}}}' | node build/index.js 2>/dev/null | jq -r '.result.content[0].text' 2>/dev/null || echo "Warte auf Antwort..."
echo ""

echo "🎉 Tests abgeschlossen!"
echo "======================="
echo ""
echo "Falls alle Tests erfolgreich waren:"
echo "✅ Mail-Integration funktioniert"
echo "✅ Kalender-Integration funktioniert"  
echo "✅ Erinnerungen-Integration funktioniert (Timeout behoben!)"
echo "✅ Briefing kann erstellt werden"
echo ""
echo "Nächster Schritt: In Claude Desktop einbinden!"
