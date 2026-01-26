#!/usr/bin/env node
/**
 * ISO 25010 Quality Test Suite
 * Testet Reliability, Performance Efficiency, Usability nach ISO25010
 * DATENSCHUTZ: Verwendet nur lokale Test-Daten, keine sensiblen Pfade
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TEST_DIR = __dirname;
const SERVER_PATH = path.join(__dirname, '..', 'build', 'index.js');

console.log('🧪 ISO 25010 Quality Test Suite\n');

// Helper: Send MCP request
function sendMCPRequest(method, params) {
  const request = JSON.stringify({
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params
  });
  
  try {
    const result = execSync(`echo '${request}' | node "${SERVER_PATH}"`, {
      encoding: 'utf-8',
      timeout: 30000, // 30s timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    // Parse nur JSON Responses (ignoriere stderr logs)
    const lines = result.split('\n').filter(l => l.trim().startsWith('{'));
    if (lines.length > 0) {
      return JSON.parse(lines[lines.length - 1]);
    }
    return null;
  } catch (error) {
    return { error: error.message, timeout: error.code === 'ETIMEDOUT' };
  }
}

// Test 1: Reliability - Sonderzeichen im Dateinamen
function testSpecialCharacters() {
  console.log('📋 Test 1: Reliability - Sonderzeichen');
  
  const testFiles = [
    'Test_äöü_€_&_#_@_2025-01-26.txt',
    'Rechnung_für_Müller_Größe_XL.txt',
    'Invoice#123_&_Order@456.txt'
  ];
  
  let passed = 0;
  testFiles.forEach(file => {
    const filePath = path.join(TEST_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠️  Datei nicht gefunden: ${file}`);
      return;
    }
    
    const response = sendMCPRequest('tools/call', {
      name: 'analyze_document',
      arguments: { filePath }
    });
    
    if (response && !response.error && response.result) {
      console.log(`  ✅ ${file}`);
      passed++;
    } else {
      console.log(`  ❌ ${file}: ${response?.error || 'Kein Result'}`);
    }
  });
  
  console.log(`  Ergebnis: ${passed}/${testFiles.length} bestanden\n`);
  return passed === testFiles.length;
}

// Test 2: Performance - Große Datei
function testLargeFile() {
  console.log('📋 Test 2: Performance - Große Datei (10MB)');
  
  const filePath = path.join(TEST_DIR, 'large-file-10mb.txt');
  if (!fs.existsSync(filePath)) {
    console.log('  ⚠️  Große Test-Datei nicht gefunden\n');
    return false;
  }
  
  const start = Date.now();
  const response = sendMCPRequest('tools/call', {
    name: 'analyze_document',
    arguments: { filePath }
  });
  const duration = Date.now() - start;
  
  if (response?.timeout) {
    console.log(`  ❌ Timeout nach 30s`);
    return false;
  }
  
  if (response && !response.error) {
    console.log(`  ✅ Verarbeitet in ${duration}ms`);
    if (duration > 10000) {
      console.log(`  ⚠️  Performance-Warnung: >10s Verarbeitungszeit`);
    }
    console.log();
    return true;
  } else {
    console.log(`  ❌ Fehler: ${response?.error}\n`);
    return false;
  }
}

// Test 3: Reliability - Leere Datei
function testEmptyFile() {
  console.log('📋 Test 3: Reliability - Leere Datei');
  
  const filePath = path.join(TEST_DIR, 'empty-file.pdf');
  const response = sendMCPRequest('tools/call', {
    name: 'analyze_document',
    arguments: { filePath }
  });
  
  if (response && response.result) {
    console.log(`  ✅ Graceful handling von leerer Datei`);
    console.log();
    return true;
  } else {
    console.log(`  ❌ Fehler bei leerer Datei: ${response?.error}\n`);
    return false;
  }
}

// Test 4: Performance - Viele Dateien (Batch)
function testManyFiles() {
  console.log('📋 Test 4: Performance - Batch-Verarbeitung');
  
  const start = Date.now();
  const response = sendMCPRequest('tools/call', {
    name: 'analyze_folder',
    arguments: { folderPath: TEST_DIR }
  });
  const duration = Date.now() - start;
  
  if (response?.timeout) {
    console.log(`  ❌ Timeout bei Batch-Verarbeitung`);
    return false;
  }
  
  if (response && !response.error && response.result) {
    try {
      const content = JSON.parse(response.result.content[0].text);
      console.log(`  ✅ ${content.totalFiles || 0} Dateien in ${duration}ms`);
      console.log(`  📊 Durchschnitt: ${Math.round(duration / (content.totalFiles || 1))}ms/Datei`);
      console.log();
      return true;
    } catch (e) {
      console.log(`  ❌ Parse-Fehler: ${e.message}\n`);
      return false;
    }
  } else {
    console.log(`  ❌ Fehler: ${response?.error}\n`);
    return false;
  }
}

// Test 5: Usability - Error Messages
function testErrorMessages() {
  console.log('📋 Test 5: Usability - Fehlermeldungen');
  
  // Nicht existierende Datei
  const response1 = sendMCPRequest('tools/call', {
    name: 'analyze_document',
    arguments: { filePath: '/nonexistent/file.pdf' }
  });
  
  const hasUsefulError = response1?.result?.content?.[0]?.text?.includes('Error') ||
                         response1?.error;
  
  if (hasUsefulError) {
    console.log(`  ✅ Aussagekräftige Fehlermeldung bei nicht existierender Datei`);
  } else {
    console.log(`  ❌ Keine klare Fehlermeldung`);
  }
  
  // Ungültiger Parameter
  const response2 = sendMCPRequest('tools/call', {
    name: 'analyze_document',
    arguments: {}
  });
  
  const hasParamError = response2?.result?.content?.[0]?.text?.includes('required') ||
                        response2?.error?.includes('required');
  
  if (hasParamError) {
    console.log(`  ✅ Parameter-Validierung funktioniert`);
  } else {
    console.log(`  ❌ Keine Parameter-Validierung`);
  }
  
  console.log();
  return hasUsefulError && hasParamError;
}

// Run all tests
async function runAllTests() {
  const results = {
    specialChars: testSpecialCharacters(),
    largeFile: testLargeFile(),
    emptyFile: testEmptyFile(),
    manyFiles: testManyFiles(),
    errorMessages: testErrorMessages()
  };
  
  console.log('═══════════════════════════════════════');
  console.log('📊 Test-Zusammenfassung:');
  console.log('═══════════════════════════════════════');
  
  const passed = Object.values(results).filter(r => r === true).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([test, result]) => {
    console.log(`  ${result ? '✅' : '❌'} ${test}`);
  });
  
  console.log(`\n🎯 Gesamt: ${passed}/${total} Tests bestanden`);
  
  if (passed === total) {
    console.log('✨ Alle Tests erfolgreich!');
    process.exit(0);
  } else {
    console.log('⚠️  Einige Tests fehlgeschlagen - Optimierung erforderlich');
    process.exit(1);
  }
}

runAllTests().catch(console.error);
