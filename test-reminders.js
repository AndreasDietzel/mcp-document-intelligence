#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('🧪 Testing Briefing MCP Server\n');
console.log('================================\n');

// Test get_reminders tool
const testRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'get_reminders',
    arguments: {}
  }
};

const server = spawn('node', ['build/index.js'], {
  cwd: '/Users/andreasdietzel/Projects/briefing-mcp-server'
});

let output = '';

server.stdout.on('data', (data) => {
  output += data.toString();
});

server.stderr.on('data', (data) => {
  console.error('Server Log:', data.toString());
});

// Send request after a short delay
setTimeout(() => {
  server.stdin.write(JSON.stringify(testRequest) + '\n');
  
  // Wait for response
  setTimeout(() => {
    server.kill();
    
    console.log('\n📝 Server Response:');
    console.log('==================\n');
    
    try {
      // Parse JSON response
      const lines = output.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.result && json.result.content) {
            console.log(json.result.content[0].text);
          }
        } catch (e) {
          // Skip non-JSON lines
        }
      }
    } catch (e) {
      console.log('Raw output:', output);
    }
    
    console.log('\n✅ Test completed');
  }, 3000);
}, 500);
