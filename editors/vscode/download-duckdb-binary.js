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

// Get the hosted tarball URL from node-pre-gyp
function getHostedTarballUrl() {
    const duckdbDir = path.dirname(require.resolve('duckdb/package.json'));
    const cmd = `npx node-pre-gyp reveal hosted_tarball --target_platform=${targetPlatform} --target_arch=${targetArch}`;
    const url = execSync(cmd, { cwd: duckdbDir, encoding: 'utf8' }).trim();
    return url;
}

// Download a file using curl (more reliable in CI environments)
function downloadWithCurl(url, destPath, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Download attempt ${attempt}/${retries}...`);
            execSync(`curl -fsSL --retry 3 --retry-delay 2 -o "${destPath}" "${url}"`, {
                stdio: 'inherit',
                timeout: 120000, // 2 minute timeout
            });
            return true;
        } catch (error) {
            console.error(`Attempt ${attempt} failed: ${error.message}`);
            if (attempt < retries) {
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`Waiting ${delay / 1000}s before retry...`);
                execSync(`sleep ${delay / 1000}`);
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
    try {
        const url = getHostedTarballUrl();
        console.log(`Downloading from: ${url}`);

        const tempTarball = path.join(__dirname, '.duckdb-temp.tar.gz');

        const success = downloadWithCurl(url, tempTarball);
        if (!success) {
            throw new Error('Failed to download duckdb binary after all retries');
        }

        const destDir = path.join(__dirname, 'dist', 'binding');
        await extractDuckdbNode(tempTarball, destDir);

        console.log(`Successfully downloaded duckdb binary for ${targetPlatform}-${targetArch}`);
    } catch (error) {
        console.error('Error downloading duckdb binary:', error.message);
        process.exit(1);
    }
}

main();
