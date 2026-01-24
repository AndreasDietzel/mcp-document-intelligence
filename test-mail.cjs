const { execSync } = require('child_process');

const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "get_unread_mail",
    arguments: {}
  }
};

const input = JSON.stringify(request);
const result = execSync(`echo '${input}' | node build/index.js`, { 
  encoding: 'utf-8',
  maxBuffer: 10 * 1024 * 1024
});

const response = JSON.parse(result);
console.log("=== MAIL TEST ===");
console.log(JSON.stringify(response, null, 2));
