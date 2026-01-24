#!/bin/bash

echo "🧪 Iterativer Briefing-Server Test"
echo "===================================="
echo ""

echo "Test 1: Gibt es Kalender-Events?"
echo "---------------------------------"
osascript -e 'tell application "Calendar"
  set today to current date - (30 * days)
  set nextMonth to current date + (30 * days)
  set allCals to every calendar
  set totalEvents to 0
  repeat with cal in allCals
    try
      set events to (every event of cal whose start date ≥ today and start date ≤ nextMonth)
      set totalEvents to totalEvents + (count of events)
    end try
  end repeat
  return "Events in den letzten/nächsten 30 Tagen: " & totalEvents
end tell'
echo ""

echo "Test 2: Gibt es offene Erinnerungen?"
echo "-------------------------------------"
osascript -e 'tell application "Reminders"
  set allLists to every list
  set totalReminders to 0
  repeat with lst in allLists
    try
      set reminders to (every reminder of lst whose completed is false)
      set totalReminders to totalReminders + (count of reminders)
    end try
  end repeat
  return "Offene Erinnerungen gesamt: " & totalReminders
end tell'
echo ""

echo "Test 3: Wie viele ungelesene E-Mails gibt es?"
echo "----------------------------------------------"
osascript -e 'tell application "Mail"
  try
    set unreadCount to count of (every message of inbox whose read status is false)
    return "Ungelesene Mails: " & unreadCount
  on error errMsg
    return "Fehler: " & errMsg
  end try
end tell'
echo ""

echo "Test 4: MCP Server build check"
echo "-------------------------------"
if [ -f "build/index.js" ]; then
  echo "✅ build/index.js existiert"
  echo "Größe: $(ls -lh build/index.js | awk '{print $5}')"
else
  echo "❌ build/index.js fehlt"
fi
echo ""

echo "Teste den MCP Server direkt..."
echo ""