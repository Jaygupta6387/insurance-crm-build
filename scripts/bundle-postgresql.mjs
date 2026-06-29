#!/usr/bin/env node
/**
 * Downloads PostgreSQL 16 portable binaries into resources/ for production builds.
 * Usage: node scripts/bundle-postgresql.mjs --platform win|mac
 */
import { execSync } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, cpSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RESOURCES = join(ROOT, 'resources');

const PG_VERSION = '16.6';
const URLS = {
  win: `https://get.enterprisedb.com/postgresql/postgresql-${PG_VERSION}-1-windows-x64-binaries.zip`,
  mac: `https://get.enterprisedb.com/postgresql/postgresql-${PG_VERSION}-1-darwin-arm64-binaries.zip`,
  mac_x64: `https://get.enterprisedb.com/postgresql/postgresql-${PG_VERSION}-1-darwin-x64-binaries.zip`,
};

const platform = process.argv.includes('--platform')
  ? process.argv[process.argv.indexOf('--platform') + 1]
  : process.platform === 'win32'
    ? 'win'
    : 'mac';

const destName = platform === 'win' ? 'postgresql-win' : 'postgresql-mac';
const destDir = join(RESOURCES, destName);

const download = async (url, destFile) => {
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destFile));
};

const extractZip = (zipPath, outDir) => {
  mkdirSync(outDir, { recursive: true });
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`unzip -qo "${zipPath}" -d "${outDir}"`, { stdio: 'inherit' });
  }
};

const findPgsqlRoot = (extractedDir) => {
  const direct = join(extractedDir, 'pgsql');
  if (existsSync(join(direct, 'bin'))) return direct;
  for (const name of readdirSync(extractedDir)) {
    const candidate = join(extractedDir, name, 'pgsql');
    if (existsSync(join(candidate, 'bin'))) return candidate;
    const alt = join(extractedDir, name);
    if (existsSync(join(alt, 'bin'))) return alt;
  }
  throw new Error('Could not find pgsql/bin in extracted archive');
};

const copyTree = (src, dest) => {
  cpSync(src, dest, { recursive: true });
};

const bundleFromHomebrew = () => {
  const formulas = ['postgresql@16', 'postgresql@15', 'postgresql@18', 'postgresql'];
  let prefix = '';

  for (const formula of formulas) {
    try {
      const candidate = execSync(`brew --prefix ${formula}`, { encoding: 'utf8' }).trim();
      if (existsSync(join(candidate, 'bin', 'pg_ctl'))) {
        prefix = candidate;
        break;
      }
    } catch {
      // try next formula
    }
  }

  if (!prefix) {
    throw new Error('Homebrew PostgreSQL not found (install with: brew install postgresql@16)');
  }

  mkdirSync(destDir, { recursive: true });
  for (const dir of ['bin', 'lib', 'share']) {
    const src = join(prefix, dir);
    if (existsSync(src)) copyTree(src, join(destDir, dir));
  }
  console.log(`Bundled Homebrew PostgreSQL from ${prefix} -> ${destDir}`);
};

const bundleFromZip = async (url) => {
  const tmp = join(ROOT, '.tmp-pg-download');
  const zipPath = join(tmp, 'postgresql.zip');
  const extractDir = join(tmp, 'extract');

  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  await download(url, zipPath);
  extractZip(zipPath, extractDir);

  const pgsqlRoot = findPgsqlRoot(extractDir);
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });

  for (const dir of ['bin', 'lib', 'share']) {
    const src = join(pgsqlRoot, dir);
    if (existsSync(src)) copyTree(src, join(destDir, dir));
  }

  rmSync(tmp, { recursive: true, force: true });
  console.log(`Bundled PostgreSQL -> ${destDir}`);
};

const verify = () => {
  const bin = platform === 'win' ? 'pg_ctl.exe' : 'pg_ctl';
  const pgCtl = join(destDir, 'bin', bin);
  if (!existsSync(pgCtl)) {
    throw new Error(`Missing ${pgCtl} after bundle`);
  }
  console.log(`Verified ${pgCtl}`);
};

const main = async () => {
  mkdirSync(RESOURCES, { recursive: true });

  if (platform === 'win') {
    await bundleFromZip(URLS.win);
  } else if (platform === 'mac') {
    try {
      bundleFromHomebrew();
    } catch (brewErr) {
      console.warn(`Homebrew bundle failed: ${brewErr.message}`);
      const url = process.arch === 'x64' ? URLS.mac_x64 : URLS.mac;
      await bundleFromZip(url);
    }
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  verify();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
