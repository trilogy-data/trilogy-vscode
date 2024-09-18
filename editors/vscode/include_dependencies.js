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

// Function to find all HTML files under a directory
function findHtmlFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
  
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
  
      if (stat.isDirectory()) {
        // Recursively search subdirectories
        findHtmlFiles(filePath, fileList);
      } else if (file.endsWith('.html')) {
        // Add HTML file to the list
        fileList.push(filePath);
      }
    });
  
    return fileList;
  }
  
  // Copy all HTML files from webViews to dist
  function copyHtmlFiles() {
    const webViewsDir = path.resolve(__dirname, './src/webViews');
    const distWebViewsDir = path.resolve(__dirname, './dist/webViews');
    const htmlFiles = findHtmlFiles(webViewsDir);
  
    htmlFiles.forEach(htmlFile => {
      const relativePath = path.relative(webViewsDir, htmlFile);
      const destPath = path.join(distWebViewsDir, relativePath);
  
      copyFile(htmlFile, destPath);
    });
  }