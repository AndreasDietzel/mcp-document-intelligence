# Mail AppleScript Fix

## Problem
AppleScript-Fehler in getUnreadMail():
```
execution error: „items 1 thru minimum of {1, 5}" kann nicht gelesen werden. (-1728)
```

## Lösung

In `src/index.ts` Zeile ~161 ändern:

**Vorher (fehlerhaft):**
```applescript
repeat with msg in (items 1 thru (minimum of {msgCount, 5}) of unreadMessages)
```

**Nachher (funktioniert):**
```applescript
-- Bestimme wie viele Mails wir durchgehen
set maxMails to 5
if msgCount < maxMails then
  set maxMails to msgCount
end if

-- Durchlaufe die ersten maxMails Nachrichten
repeat with i from 1 to maxMails
  set msg to item i of unreadMessages
  set msgSubject to subject of msg
  set msgSender to sender of msg
  set msgDate to date received of msg
  set output to output & msgSubject & " | Von: " & msgSender & " | " & (msgDate as string) & linefeed
end repeat
```

Danach: `npm run build`
