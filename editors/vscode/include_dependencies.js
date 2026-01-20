const fs = require('fs');
const path = require('path');

// Copy a file from source to destination
function copyFile(srcFile, destFile) {
    // Ensure destination directory exists
    fs.mkdirSync(path.dirname(destFile), { recursive: true });

    // Copy the file
    fs.copyFileSync(srcFile, destFile);
    console.log(`Copied ${srcFile} to ${destFile}`);
}

// Recursively copy a directory, following symlinks
function copyDirRecursive(src, dest) {
    // Resolve symlinks to get actual path
    const realSrc = fs.realpathSync(src);

    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(realSrc, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(realSrc, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
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

// Copy DuckDB native modules to node_modules in dist
// This is needed because pnpm uses symlinks, which don't get packaged correctly by vsce
function copyDuckDBModules() {
    const nodeModulesDir = path.resolve(__dirname, './node_modules/@duckdb');
    const destNodeModulesDir = path.resolve(__dirname, './dist/node_modules/@duckdb');

    // Remove existing dist/node_modules/@duckdb if it exists
    if (fs.existsSync(destNodeModulesDir)) {
        fs.rmSync(destNodeModulesDir, { recursive: true });
    }

    // Check if source exists
    if (!fs.existsSync(nodeModulesDir)) {
        console.log('No @duckdb modules found in node_modules, skipping copy');
        return;
    }

    // Get all @duckdb packages (they might be symlinks in pnpm)
    const duckdbPackages = fs.readdirSync(nodeModulesDir);

    for (const pkg of duckdbPackages) {
        const srcPath = path.join(nodeModulesDir, pkg);
        const destPath = path.join(destNodeModulesDir, pkg);

        try {
            copyDirRecursive(srcPath, destPath);
            console.log(`Copied @duckdb/${pkg} to dist/node_modules/@duckdb/${pkg}`);
        } catch (err) {
            console.error(`Failed to copy @duckdb/${pkg}: ${err.message}`);
        }
    }

    console.log('Finished copying DuckDB modules');
}

// Call the functions
copyHtmlFiles();
// copyDuckDBModules();
