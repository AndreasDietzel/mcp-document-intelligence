#!/bin/bash
# Test-Dateien generieren für verschiedene Fehlerszenarien
# DATENSCHUTZ: Keine echten Dokumente, nur Test-Daten!

TEST_DIR="$(dirname "$0")"
cd "$TEST_DIR"

# 1. Sonderzeichen im Dateinamen
echo "Test: Sonderzeichen" > "Test_äöü_€_&_#_@_2025-01-26.txt"
echo "Test: Umlauts" > "Rechnung_für_Müller_Größe_XL.txt"
echo "Test: Spaces" > "Dokument mit vielen   Leerzeichen.txt"
echo "Test: Special" > "Invoice#123_&_Order@456.txt"

# 2. Sehr langer Dateiname (>255 Zeichen)
LONG_NAME=$(printf 'a%.0s' {1..250})
echo "Test: Long filename" > "${LONG_NAME}.txt"

# 3. Verschiedene Encodings (simuliert durch Content)
echo "UTF-8 Test: 日本語 中文 العربية עברית" > "utf8-test.txt"
echo -e "Latin-1: \xE4\xF6\xFC" > "latin1-test.txt"

# 4. Leere Datei
touch "empty-file.pdf"

# 5. Große Datei (10MB Text)
yes "This is test data for performance testing. Lorem ipsum dolor sit amet. " | head -c 10485760 > "large-file-10mb.txt"

# 6. Dateinamen mit problematischen Zeichen
echo "Test" > "file:with:colons.txt" 2>/dev/null || echo "Test" > "file-with-colons.txt"
echo "Test" > "file|with|pipes.txt" 2>/dev/null || echo "Test" > "file-with-pipes.txt"
echo "Test" > "file\"with\"quotes.txt" 2>/dev/null || echo "Test" > "file-with-quotes.txt"

# 7. Versteckte Datei
echo "Hidden test" > ".hidden-file.txt"

# 8. Datei mit NULL-Bytes (könnte OCR-Parser verwirren)
printf "Test\x00Data\x00With\x00Nulls" > "null-bytes.txt"

echo "✓ Test-Dateien erstellt in: $TEST_DIR"
ls -lah "$TEST_DIR"/*.txt 2>/dev/null | wc -l | xargs echo "Anzahl TXT-Dateien:"
