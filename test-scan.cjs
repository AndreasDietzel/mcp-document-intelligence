const fs = require('fs');
const path = require('path');
const dir = '/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv/Zwanziger/2026';

const SUPPORTED = new Set(['.pdf','.docx','.doc','.pages','.png','.jpg','.jpeg','.tiff','.bmp','.txt','.rtf','.odt']);

function scan(d, depth) {
  if (depth > 5) return;
  try {
    const items = fs.readdirSync(d);
    for (const item of items) {
      if (item.startsWith('.')) continue;
      const full = path.join(d, item);
      try {
        const st = fs.statSync(full);
        if (st.isDirectory()) {
          console.log('  '.repeat(depth) + 'DIR: ' + item);
          scan(full, depth + 1);
        } else if (st.isFile()) {
          const ext = path.extname(item).toLowerCase();
          const sup = SUPPORTED.has(ext) ? 'OK' : 'SKIP';
          console.log('  '.repeat(depth) + sup + ': ' + item + ' (' + ext + ', ' + st.size + ' bytes)');
        }
      } catch (e) { console.log('  '.repeat(depth) + 'STAT-ERR: ' + item + ': ' + e.message); }
    }
  } catch (e) { console.log('  '.repeat(depth) + 'READDIR-ERR: ' + d + ': ' + e.message); }
}
scan(dir, 0);
