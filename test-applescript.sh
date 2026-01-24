#!/bin/bash
# Briefing Server Test Suite

echo "🧪 BRIEFING MCP SERVER TEST"
echo "============================="
echo ""

# Test 1: Kalender
echo "📅 Test 1: Kalender-Zugriff"
osascript -e 'tell application "Calendar"
  set allCalendars to every calendar
  return "Anzahl Kalender: " & (count of allCalendars)
end tell' 2>&1
echo ""

# Test 2: Kalender Events heute
echo "📅 Test 2: Heutige Events"
osascript -e 'tell application "Calendar"
  set today to current date
  set startOfDay to today
  set time of startOfDay to 0
  set endOfDay to today
  set time of endOfDay to 86399
  
  set allEvents to {}
  set allCalendars to every calendar
  repeat with cal in allCalendars
    set events to (every event of cal whose start date ≥ startOfDay and start date ≤ endOfDay)
    set allEvents to allEvents & events
  end repeat
  
  if (count of allEvents) = 0 then
    return "Keine Events heute gefunden"
  else
    return "Gefundene Events: " & (count of allEvents)
  end if
end tell' 2>&1
echo ""

# Test 3: Erinnerungen
echo "✅ Test 3: Erinnerungen-Zugriff"
osascript -e 'tell application "Reminders"
  set allLists to every list
  return "Anzahl Listen: " & (count of allLists)
end tell' 2>&1
echo ""

# Test 4: Offene Erinnerungen
echo "✅ Test 4: Offene Erinnerungen"
osascript -e 'tell application "Reminders"
  set allLists to every list
  set reminderCount to 0
  repeat with lst in allLists
    set incompleteReminders to (every reminder of lst whose completed is false)
    set reminderCount to reminderCount + (count of incompleteReminders)
  end repeat
  return "Offene Erinnerungen: " & reminderCount
end tell' 2>&1
echo ""

# Test 5: Mail
echo "📧 Test 5: Mail-Zugriff"
osascript -e 'tell application "Mail"
  return "Mail läuft: " & (application "Mail" is running)
end tell' 2>&1
echo ""

# Test 6: Ungelesene Mails
echo "📧 Test 6: Ungelesene Mails"
osascript -e 'tell application "Mail"
  try
    set unreadMessages to (every message of inbox whose read status is false)
    return "Ungelesene Mails: " & (count of unreadMessages)
  on error errMsg
    return "Fehler: " & errMsg
  end try
end tell' 2>&1
echo ""

echo "✅ Tests abgeschlossen"
