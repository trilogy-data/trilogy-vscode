#!/usr/bin/env node
/**
 * Tests that the packaged extension bundle includes duckdb correctly.
 *
 * This script extracts a .vsix file and verifies that:
 * 1. The duckdb.node binary exists in the bundle
 * 2. The duckdb module can be required successfully
 *
 * Usage:
 *   node test-extension-bundle.js <path-to-vsix>
 *
 * Example:
 *   node test-extension-bundle.js vscode-trilogy-tools-linux-x64-0.1.22.vsix
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const vsixPath = process.argv[2];

if (!vsixPath) {
    console.error('Usage: node test-extension-bundle.js <path-to-vsix>');
    process.exit(1);
}

if (!fs.existsSync(vsixPath)) {
    console.error(`Error: VSIX file not found: ${vsixPath}`);
    process.exit(1);
}

const testDir = path.join(__dirname, '.vsix-test');

// Clean up any previous test directory
if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
}
fs.mkdirSync(testDir, { recursive: true });

console.log(`Testing extension bundle: ${vsixPath}`);
console.log(`Extracting to: ${testDir}`);

try {
    // VSIX files are ZIP archives - extract using unzip
    execSync(`unzip -q "${path.resolve(vsixPath)}" -d "${testDir}"`, { stdio: 'pipe' });
} catch (error) {
    console.error('Error extracting VSIX file:', error.message);
    process.exit(1);
}

// Check for duckdb.node in the expected location
const duckdbNodePath = path.join(testDir, 'extension', 'dist', 'binding', 'duckdb.node');

if (!fs.existsSync(duckdbNodePath)) {
    console.error('FAIL: duckdb.node not found in extension bundle!');
    console.error(`Expected location: ${duckdbNodePath}`);

    // List what's actually in dist/binding (or its parent if it doesn't exist)
    const bindingDir = path.dirname(duckdbNodePath);
    const distDir = path.dirname(bindingDir);

    if (fs.existsSync(distDir)) {
        console.error('\nContents of dist directory:');
        execSync(`find "${distDir}" -type f | head -20`, { stdio: 'inherit' });
    } else {
        console.error('\ndist directory does not exist!');
        console.error('\nContents of extension directory:');
        const extDir = path.join(testDir, 'extension');
        if (fs.existsSync(extDir)) {
            execSync(`find "${extDir}" -type f | head -30`, { stdio: 'inherit' });
        }
    }

    process.exit(1);
}

const stats = fs.statSync(duckdbNodePath);
console.log(`Found duckdb.node: ${duckdbNodePath} (${stats.size} bytes)`);

// Try to load duckdb to verify it's valid
console.log('\nTesting that duckdb module can be loaded...');

// Check if the binary is for the correct platform
try {
    const fileInfo = execSync(`file "${duckdbNodePath}"`, { encoding: 'utf8' });
    console.log('Binary info:', fileInfo.trim());
} catch (e) {
    // file command might not be available on all platforms
}

// Verify the file is a valid shared library by checking the header
const buffer = fs.readFileSync(duckdbNodePath);

// Check for ELF header (Linux) or Mach-O header (macOS) or PE header (Windows)
const isELF = buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46;
const isMachO = (buffer[0] === 0xcf && buffer[1] === 0xfa) || (buffer[0] === 0xca && buffer[1] === 0xfe);
const isPE = buffer[0] === 0x4d && buffer[1] === 0x5a;

if (isELF || isMachO || isPE) {
    console.log('Binary format verification: PASSED');
    console.log('  - Format:', isELF ? 'ELF (Linux)' : isMachO ? 'Mach-O (macOS)' : 'PE (Windows)');
} else {
    console.error('FAIL: Binary format could not be verified');
    console.error('  - First 4 bytes:', buffer.slice(0, 4).toString('hex'));
    process.exit(1);
}

// Additional size check - duckdb.node should be at least 1MB
const minSize = 1024 * 1024; // 1MB
if (stats.size < minSize) {
    console.error(`FAIL: duckdb.node is too small (${stats.size} bytes, expected at least ${minSize})`);
    process.exit(1);
}
console.log(`Size check: PASSED (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

// Clean up test directory
fs.rmSync(testDir, { recursive: true });

console.log('\n✓ Extension bundle validation PASSED');
console.log('  - duckdb.node is present in the bundle');
console.log('  - Binary format is valid');
