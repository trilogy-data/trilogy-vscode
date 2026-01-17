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

// Call the function to copy HTML files
copyHtmlFiles();
