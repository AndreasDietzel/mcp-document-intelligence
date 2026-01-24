#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('🧪 MCP Server Function Tests\n');

// Test 1: Wetter
console.log('=== TEST 1: WETTER (Open-Meteo) ===');
try {
  const weather = execSync(
    'curl -s "https://api.open-meteo.com/v1/forecast?latitude=51.05&longitude=13.74&current=temperature_2m,relative_humidity_2m,weather_code&temperature_unit=celsius&timezone=auto"',
    { encoding: 'utf-8', timeout: 8000 }
  );
  const data = JSON.parse(weather);
  console.log('✅ Open-Meteo API funktioniert!');
  console.log(`   Temperatur: ${data.current.temperature_2m}°C`);
  console.log(`   Luftfeuchtigkeit: ${data.current.relative_humidity_2m}%`);
  console.log(`   Weather Code: ${data.current.weather_code}\n`);
} catch (e) {
  console.log('❌ Wetter-Fehler:', e.message, '\n');
}

// Test 2: Kalender
console.log('=== TEST 2: KALENDER ===');
try {
  const calendars = execSync(
    'osascript -e \'tell application "Calendar" to get name of every calendar\'',
    { encoding: 'utf-8', timeout: 3000 }
  );
  const calList = calendars.trim().split(', ');
  console.log('✅ Kalender-Zugriff funktioniert!');
  console.log(`   Gefundene Kalender: ${calList.length}`);
  console.log(`   Namen: ${calList.slice(0, 5).join(', ')}...\n`);
} catch (e) {
  console.log('❌ Kalender-Fehler:', e.message, '\n');
}

// Test 3: Mail
console.log('=== TEST 3: MAIL ===');
try {
  const mailCount = execSync(
    'osascript -e \'tell application "Mail" to return count of messages of inbox\'',
    { encoding: 'utf-8', timeout: 5000 }
  );
  console.log('✅ Mail-Zugriff funktioniert!');
  console.log(`   Mails in Inbox: ${mailCount.trim()}\n`);
} catch (e) {
  console.log('❌ Mail-Fehler:', e.message, '\n');
}

// Test 4: News (Tagesschau RSS)
console.log('=== TEST 4: NEWS (Tagesschau RSS) ===');
try {
  const rss = execSync(
    'curl -s "https://www.tagesschau.de/xml/rss2/"',
    { encoding: 'utf-8', timeout: 5000 }
  );
  
  if (rss.includes('<rss') && rss.includes('<title>')) {
    const titles = rss.match(/<title>(.*?)<\/title>/g);
    if (titles && titles.length > 1) {
      console.log('✅ Tagesschau RSS funktioniert!');
      console.log(`   Gefundene Items: ${titles.length}`);
      console.log(`   Beispiel: ${titles[1].replace(/<\/?title>/g, '')}\n`);
    }
  } else {
    console.log('⚠️ RSS liefert unerwartete Daten\n');
  }
} catch (e) {
  console.log('❌ News-Fehler:', e.message, '\n');
}

console.log('✅ ALLE TESTS ABGESCHLOSSEN');
