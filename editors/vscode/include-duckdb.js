const fs = require('fs');
const path = require('path');

let src;
try {
  // Use Node's module resolution to find the path to the module
  src = require.resolve('duckdb/lib/binding/duckdb.node');
} catch (err) {
  throw new Error('duckdb.node not found in node_modules');
}

const dest = path.resolve(__dirname, './dist/binding/duckdb.node');

// Check if source file exists (redundant because require.resolve will throw an error if not found)
if (!fs.existsSync(src)) {
  throw new Error(`Source file not found: ${src}`);
}

// Ensure destination directory exists
fs.mkdirSync(path.dirname(dest), { recursive: true });

// Copy the file
fs.copyFileSync(src, dest);
console.log(`Copied ${src} to ${dest}`);