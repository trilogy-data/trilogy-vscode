const fs = require('fs');
const path = require('path');

const dest = path.resolve(__dirname, './dist/binding/duckdb.node');

// Check if duckdb.node was already downloaded by download-duckdb-binary.js (for cross-platform builds)
const targetPlatform = process.env.TARGET_PLATFORM;
const targetArch = process.env.TARGET_ARCH;
const isCrossPlatform = targetPlatform && targetArch &&
    (targetPlatform !== process.platform || targetArch !== process.arch);

if (fs.existsSync(dest) && isCrossPlatform) {
    console.log(`Using pre-downloaded duckdb.node for ${targetPlatform}-${targetArch} at ${dest}`);
} else {
    // For native builds or when cross-platform binary not yet downloaded,
    // copy from node_modules
    let src;
    try {
        // Use Node's module resolution to find the path to the module
        src = require.resolve('duckdb/lib/binding/duckdb.node');
    } catch (err) {
        throw new Error('duckdb.node not found in node_modules');
    }

    // Check if source file exists (redundant because require.resolve will throw an error if not found)
    if (!fs.existsSync(src)) {
        throw new Error(`Source file not found: ${src}`);
    }

    // Ensure destination directory exists
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    // Copy the file
    fs.copyFileSync(src, dest);
    console.log(`Copied ${src} to ${dest}`);
}

// Copy a file from source to destination
function copyFile(srcFile, destFile) {
    // Ensure destination directory exists
    fs.mkdirSync(path.dirname(destFile), { recursive: true });

    // Copy the file
    fs.copyFileSync(srcFile, destFile);
    console.log(`Copied ${srcFile} to ${destFile}`);
}

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
//c:\Users\ethan\.vscode\extensions\trilogydata.vscode-trilogy-tools-0.1.8-win32-x64\dist\webviews\render.html'
//c:\Users\ethan\coding_projects\vscode-extension-samples\lsp-sample\editors\vscode\dist\webviews\render.html'
//C:\Users\ethan\coding_projects\vscode-extension-samples\lsp-sample\editors\vscode\dist\webviews
// Copy all HTML files from webViews to dist
function copyHtmlFiles() {
    const webViewsDir = path.resolve(__dirname, './src/webViews');
    const distWebViewsDir = path.resolve(__dirname, './dist/webViews');
    const htmlFiles = findHtmlFiles(webViewsDir);

    htmlFiles.forEach(htmlFile => {
        const relativePath = path.relative(webViewsDir, htmlFile);
        const destPath = path.join(distWebViewsDir, relativePath);

        // Copy each HTML file to the corresponding location in dist
        copyFile(htmlFile, destPath);
    });

    console.log(`Copied ${htmlFiles.length} HTML files from ${webViewsDir} to ${distWebViewsDir}`);
}

// Call the function to copy HTML files after copying duckdb.node
copyHtmlFiles();