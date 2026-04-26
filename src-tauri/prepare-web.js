/* Prepare web assets and vendor the latest upstream runtime components. */
const fs = require('fs');
const path = require('path');

const USER_AGENT = 'EasyCLI/2.0.0';
const CLI_RELEASE_API_URL = 'https://api.github.com/repos/router-for-me/CLIProxyAPI/releases/latest';
const WEBUI_RELEASE_API_URL = 'https://api.github.com/repos/router-for-me/Cli-Proxy-API-Management-Center/releases/latest';

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(src, dest);
    }
}

function writeTextFile(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${content}\n`, 'utf8');
}

function normalizeReleaseVersion(version) {
    return String(version || '').trim().replace(/^v/i, '');
}

function resolveCliPlatformTag() {
    switch (process.platform) {
        case 'win32':
            return 'windows';
        case 'darwin':
            return 'darwin';
        case 'linux':
            return 'linux';
        case 'freebsd':
            return 'freebsd';
        default:
            throw new Error(`Unsupported build platform: ${process.platform}`);
    }
}

function resolveCliArchTag() {
    switch (process.arch) {
        case 'x64':
            return 'amd64';
        case 'arm64':
            return 'arm64';
        default:
            throw new Error(`Unsupported build architecture: ${process.arch}`);
    }
}

function resolveCliArchiveName(version) {
    const platform = resolveCliPlatformTag();
    const arch = resolveCliArchTag();
    const ext = platform === 'windows' ? 'zip' : 'tar.gz';
    return `CLIProxyAPI_${version}_${platform}_${arch}.${ext}`;
}

async function fetchJson(url) {
    if (typeof fetch !== 'function') {
        throw new Error('The current Node.js runtime does not provide fetch().');
    }

    const response = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/vnd.github+json',
        },
    });

    if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`);
    }

    return response.json();
}

async function downloadToFile(url, destination, acceptHeader) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': acceptHeader || 'application/octet-stream',
        },
        redirect: 'follow',
    });

    if (!response.ok) {
        throw new Error(`Download failed (${response.status}) for ${url}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, buffer);
}

function isUsableFile(filePath) {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
}

async function prepareBundledComponents(resourcesDir) {
    const bundledDir = path.join(resourcesDir, 'bundled');
    fs.mkdirSync(bundledDir, { recursive: true });

    const targetFiles = {
        cliArchive: path.join(bundledDir, 'cliproxyapi-bundle.bin'),
        cliAssetName: path.join(bundledDir, 'cliproxyapi-asset-name.txt'),
        cliVersion: path.join(bundledDir, 'cliproxyapi-version.txt'),
        webuiHtml: path.join(bundledDir, 'management.html'),
        webuiVersion: path.join(bundledDir, 'webui-version.txt'),
    };

    try {
        const cliRelease = await fetchJson(CLI_RELEASE_API_URL);
        const cliVersion = normalizeReleaseVersion(cliRelease.tag_name);
        const cliAssetName = resolveCliArchiveName(cliVersion);
        const cliAsset = (cliRelease.assets || []).find((asset) => asset.name === cliAssetName);
        if (!cliAsset) {
            throw new Error(`Unable to find CLIProxyAPI asset: ${cliAssetName}`);
        }

        await downloadToFile(cliAsset.browser_download_url, targetFiles.cliArchive, 'application/octet-stream');
        writeTextFile(targetFiles.cliAssetName, cliAssetName);
        writeTextFile(targetFiles.cliVersion, cliVersion);

        const webuiRelease = await fetchJson(WEBUI_RELEASE_API_URL);
        const webuiVersion = normalizeReleaseVersion(webuiRelease.tag_name);
        const webuiAsset = (webuiRelease.assets || []).find((asset) => asset.name === 'management.html');
        if (!webuiAsset) {
            throw new Error('Unable to find management.html in the latest WebUI release.');
        }

        await downloadToFile(webuiAsset.browser_download_url, targetFiles.webuiHtml, 'application/octet-stream');
        writeTextFile(targetFiles.webuiVersion, webuiVersion);

        console.log(`Bundled CLIProxyAPI ${cliVersion} (${cliAssetName})`);
        console.log(`Bundled WebUI ${webuiVersion} (management.html)`);
    } catch (error) {
        const cachedFilesAvailable = Object.values(targetFiles).every(isUsableFile);
        if (!cachedFilesAvailable) {
            throw error;
        }

        console.warn('Failed to refresh bundled upstream components. Using cached copies instead:', error.message);
    }
}

function prepareDistWeb(projectRoot, outDir) {
    if (fs.existsSync(outDir)) {
        fs.rmSync(outDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outDir, { recursive: true });

    const includeFiles = ['settings.html'];
    const includeDirs = ['css', 'js', 'images'];

    for (const fileName of includeFiles) {
        copyRecursive(path.join(projectRoot, fileName), path.join(outDir, fileName));
    }
    for (const dirName of includeDirs) {
        copyRecursive(path.join(projectRoot, dirName), path.join(outDir, dirName));
    }

    console.log('Prepared dist-web for Tauri:', outDir);
}

function ensureIcons(projectRoot) {
    try {
        const iconsDir = path.join(__dirname, 'icons');
        if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
        const pngSrc = path.join(projectRoot, 'images', 'icon.png');
        const pngDest = path.join(iconsDir, 'icon.png');
        if (fs.existsSync(pngSrc)) {
            fs.copyFileSync(pngSrc, pngDest);
        }
        const icnsSrc = path.join(projectRoot, 'images', 'icon.icns');
        const icnsDest = path.join(iconsDir, 'icon.icns');
        if (fs.existsSync(icnsSrc)) {
            fs.copyFileSync(icnsSrc, icnsDest);
        }
        const icoSrc = path.join(projectRoot, 'images', 'icon.ico');
        const icoDest = path.join(iconsDir, 'icon.ico');
        if (fs.existsSync(icoSrc)) {
            fs.copyFileSync(icoSrc, icoDest);
        }
        console.log('Ensured icons in', iconsDir);
    } catch (error) {
        console.warn('Failed to ensure icons for tauri-build:', error.message);
    }
}

async function main() {
    const projectRoot = path.resolve(__dirname, '..');
    const outDir = path.join(projectRoot, 'dist-web');
    const resourcesDir = path.join(__dirname, 'resources');

    prepareDistWeb(projectRoot, outDir);
    ensureIcons(projectRoot);
    await prepareBundledComponents(resourcesDir);
}

main().catch((error) => {
    console.error('Failed to prepare Tauri build assets:', error);
    process.exitCode = 1;
});
