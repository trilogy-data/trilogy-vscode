/**
 * Downloads the correct duckdb binary for the target platform.
 *
 * This script handles cross-compilation scenarios where the host platform
 * differs from the target platform (e.g., building arm64 on x64).
 *
 * Environment variables:
 *   TARGET_PLATFORM - Target platform (linux, darwin, win32). Defaults to current platform.
 *   TARGET_ARCH - Target architecture (x64, arm64, arm). Defaults to current arch.
 *
 * Usage:
 *   TARGET_PLATFORM=linux TARGET_ARCH=arm64 node download-duckdb-binary.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const tar = require('tar');

let targetPlatform = process.env.TARGET_PLATFORM || process.platform;
const targetArch = process.env.TARGET_ARCH || process.arch;

// Alpine uses musl libc, but duckdb doesn't provide musl-specific binaries
// Map 'alpine' to 'linux' for the download (this may cause runtime issues on alpine)
if (targetPlatform === 'alpine') {
    console.log('Note: Alpine uses musl libc. Using linux binary (may have compatibility issues).');
    targetPlatform = 'linux';
}

console.log(`Downloading duckdb binary for ${targetPlatform}-${targetArch}...`);
console.log(`Running Node ${process.version} (ABI ${process.versions.modules})`);

// Get duckdb version from package.json
function getDuckdbVersion() {
    const pkgPath = require.resolve('duckdb/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version;
}

// Construct the download URL directly
// Format: {host}/duckdb/duckdb-v{version}-node-v{abi}-{platform}-{arch}.tar.gz
function constructDownloadUrl(host) {
    const version = getDuckdbVersion();
    const abi = process.versions.modules;
    return `${host}/duckdb/duckdb-v${version}-node-v${abi}-${targetPlatform}-${targetArch}.tar.gz`;
}

// Download a file using curl with verbose error output
function downloadWithCurl(url, destPath, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Download attempt ${attempt}/${retries}: ${url}`);
            // Use -f to fail on HTTP errors, -L to follow redirects
            // Use -S to show errors even with -s, but we'll use verbose mode for debugging
            const result = execSync(`curl -fL --retry 2 --retry-delay 2 --connect-timeout 30 --max-time 120 -o "${destPath}" "${url}" 2>&1`, {
                encoding: 'utf8',
                timeout: 180000, // 3 minute timeout
            });
            if (result) console.log(result);

            // Verify the file was downloaded and has content
            if (fs.existsSync(destPath)) {
                const stats = fs.statSync(destPath);
                if (stats.size > 1000) {
                    console.log(`Downloaded ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                    return true;
                } else {
                    console.error(`Downloaded file is too small: ${stats.size} bytes`);
                    fs.unlinkSync(destPath);
                }
            }
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`);
            console.error(error.stdout || error.message);
            if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath);
            }
            if (attempt < retries) {
                const delay = Math.pow(2, attempt);
                console.log(`Waiting ${delay}s before retry...`);
                execSync(`sleep ${delay}`);
            }
        }
    }
    return false;
}

// Extract duckdb.node from tarball
async function extractDuckdbNode(tarballPath, destDir) {
    const tempDir = path.join(__dirname, '.duckdb-temp');

    // Clean up any previous temp dir
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Extract tarball
    await tar.extract({
        file: tarballPath,
        cwd: tempDir,
    });

    // Find duckdb.node in extracted files
    function findDuckdbNode(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                const found = findDuckdbNode(fullPath);
                if (found) return found;
            } else if (file === 'duckdb.node') {
                return fullPath;
            }
        }
        return null;
    }

    const duckdbNodePath = findDuckdbNode(tempDir);
    if (!duckdbNodePath) {
        // List what we extracted for debugging
        console.error('Contents of extracted tarball:');
        execSync(`find "${tempDir}" -type f`, { stdio: 'inherit' });
        throw new Error('duckdb.node not found in tarball');
    }

    // Ensure destination directory exists
    fs.mkdirSync(destDir, { recursive: true });

    // Copy to destination
    const destPath = path.join(destDir, 'duckdb.node');
    fs.copyFileSync(duckdbNodePath, destPath);

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true });

    // Remove the tarball too
    fs.unlinkSync(tarballPath);

    console.log(`Extracted duckdb.node to ${destPath}`);

    // Verify the file size
    const stats = fs.statSync(destPath);
    console.log(`Binary size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    return destPath;
}

async function main() {
    // Try multiple hosts in case one is down
    const hosts = [
        'https://npm.duckdb.org',
        'https://duckdb-node.s3.amazonaws.com',
    ];

    const tempTarball = path.join(__dirname, '.duckdb-temp.tar.gz');
    let downloaded = false;

    for (const host of hosts) {
        const url = constructDownloadUrl(host);
        console.log(`\nTrying host: ${host}`);

        if (downloadWithCurl(url, tempTarball)) {
            downloaded = true;
            break;
        }
    }

    if (!downloaded) {
        console.error('\nFailed to download from all hosts.');
        console.error('This could be due to:');
        console.error('  - Network connectivity issues');
        console.error('  - The binary not being available for this Node version/platform');
        console.error(`  - Expected binary: duckdb-v${getDuckdbVersion()}-node-v${process.versions.modules}-${targetPlatform}-${targetArch}.tar.gz`);
        process.exit(1);
    }

    try {
        const destDir = path.join(__dirname, 'dist', 'binding');
        await extractDuckdbNode(tempTarball, destDir);
        console.log(`\nSuccessfully downloaded duckdb binary for ${targetPlatform}-${targetArch}`);
    } catch (error) {
        console.error('Error extracting duckdb binary:', error.message);
        process.exit(1);
    }
}

main();
