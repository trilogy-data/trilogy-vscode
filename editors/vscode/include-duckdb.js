const fs = require('fs');
const path = require('path');
const src = path.resolve(__dirname, '../../node_modules/duckdb/lib/binding/duckdb.node');
const dest = path.resolve(__dirname, './dist/binding/duckdb.node');

if (!fs.existsSync(src)) {
  throw new Error(`Source file not found: ${src}`);
}

// Ensure destination directory exists
fs.mkdirSync(path.dirname(dest), { recursive: true });

// Copy the file
fs.copyFileSync(src, dest);
console.log(`Copied ${src} to ${dest}`);