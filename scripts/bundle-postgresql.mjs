#!/usr/bin/env node
/**
 * Bundles portable PostgreSQL 16 binaries into resources/ for production builds.
 * Mac binaries are relinked so they do NOT depend on Homebrew paths on client machines.
 *
 * Usage: node scripts/bundle-postgresql.mjs --platform win|mac
 */
import { execSync } from 'child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
  statSync,
  chmodSync,
  copyFileSync,
  realpathSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join, dirname, basename } from 'path';
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
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'InsureCRM-Desktop-Build/1.0' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(destFile));
    return;
  } catch (fetchErr) {
    console.warn(`fetch download failed (${fetchErr.message}), trying curl...`);
  }
  execSync(`curl -fsSL -A "Mozilla/5.0" -o "${destFile}" "${url}"`, { stdio: 'inherit' });
};

const extractZip = (zipPath, outDir) => {
  mkdirSync(outDir, { recursive: true });
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force"`,
      { stdio: 'inherit' },
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
  cpSync(src, dest, { recursive: true, dereference: true });
};

const listFilesRecursive = (dir) => {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) files.push(...listFilesRecursive(full));
    else files.push(full);
  }
  return files;
};

const isMachO = (filePath) => {
  try {
    const out = execSync(`file -b "${filePath}"`, { encoding: 'utf8' }).trim();
    return out.includes('Mach-O');
  } catch {
    return false;
  }
};

const collectLibBasenames = (libRoot) => {
  const names = new Set();
  for (const file of listFilesRecursive(libRoot)) {
    if (file.endsWith('.dylib') || file.endsWith('.so')) {
      names.add(basename(file));
    }
  }
  return names;
};

const resolveLocalLib = (libRoot, depBase) => {
  const direct = join(libRoot, depBase);
  if (existsSync(direct)) return direct;
  const nested = join(libRoot, 'postgresql', depBase);
  if (existsSync(nested)) return nested;
  for (const file of listFilesRecursive(libRoot)) {
    if (basename(file) === depBase) return file;
  }
  return null;
};

const findExternalLib = (depBase) => {
  const roots = ['/opt/homebrew/lib', '/usr/local/lib'];
  for (const optRoot of ['/opt/homebrew/opt', '/usr/local/opt']) {
    if (!existsSync(optRoot)) continue;
    for (const formula of readdirSync(optRoot)) {
      roots.push(join(optRoot, formula, 'lib'));
    }
  }

  for (const root of roots) {
    const candidate = join(root, depBase);
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

/** Copy non-system dylibs referenced by bundled binaries into lib/ (e.g. icu4c, gettext). */
const copyExternalDeps = (bundleRoot) => {
  const libRoot = join(bundleRoot, 'lib');
  const binDir = join(bundleRoot, 'bin');
  mkdirSync(libRoot, { recursive: true });

  let copied = 0;
  for (let pass = 0; pass < 5; pass += 1) {
    const scanTargets = [
      ...listFilesRecursive(binDir),
      ...listFilesRecursive(libRoot).filter((f) => f.endsWith('.dylib')),
    ];
    let passCopied = 0;

    for (const file of scanTargets) {
      if (!isMachO(file)) continue;
      let otoolOut = '';
      try {
        otoolOut = execSync(`otool -L "${file}"`, { encoding: 'utf8' });
      } catch {
        continue;
      }

      for (const line of otoolOut.split('\n').slice(1)) {
        const match = line.trim().match(/^([^\s]+)\s/);
        if (!match) continue;
        const dep = match[1];
        if (dep.startsWith('/usr/lib') || dep.startsWith('/System/')) continue;

        const depBase = basename(dep);
        const dest = join(libRoot, depBase);
        const source =
          dep.startsWith('/')
            ? dep
            : dep.startsWith('@loader_path/')
              ? (existsSync(join(dirname(file), dep.replace('@loader_path/', '')))
                  ? join(dirname(file), dep.replace('@loader_path/', ''))
                  : findExternalLib(depBase))
              : dep.startsWith('@rpath/')
                ? findExternalLib(depBase)
                : null;
        if (!existsSync(dest) && source && existsSync(source)) {
          copyFileSync(realpathSync(source), dest);
          passCopied += 1;
          console.log(`  copied: ${depBase}`);
        }
      }
    }

    copied += passCopied;
    if (passCopied === 0) break;
  }

  console.log(`Copied ${copied} external dylib(s) into bundle`);
};

/** Rewrite absolute dylib paths to bundled @executable_path/../lib (bin) or @loader_path (lib). */
const relinkMacPostgres = (bundleRoot) => {
  if (process.platform !== 'darwin') return;

  const binDir = join(bundleRoot, 'bin');
  const libRoot = join(bundleRoot, 'lib');
  if (!existsSync(binDir) || !existsSync(libRoot)) {
    throw new Error(`Missing bin/ or lib/ under ${bundleRoot}`);
  }

  const libNames = collectLibBasenames(libRoot);
  let changes = 0;

  const relinkFile = (filePath, loaderKind) => {
    if (!isMachO(filePath)) return;
    let otoolOut = '';
    try {
      otoolOut = execSync(`otool -L "${filePath}"`, { encoding: 'utf8' });
    } catch {
      return;
    }

    const prefix = loaderKind === 'bin' ? '@executable_path/../lib' : '@loader_path';

    for (const line of otoolOut.split('\n').slice(1)) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(\/[^\s]+)\s/);
      if (!match) continue;
      const dep = match[1];
      if (dep.startsWith('/usr/lib') || dep.startsWith('/System/')) continue;

      const depBase = basename(dep);
      if (!libNames.has(depBase) && !resolveLocalLib(libRoot, depBase)) continue;

      const newPath = `${prefix}/${depBase}`;
      if (dep === newPath) continue;

      try {
        execSync(`install_name_tool -change "${dep}" "${newPath}" "${filePath}"`, { stdio: 'pipe' });
        changes += 1;
        console.log(`  relink: ${basename(filePath)} ${depBase}`);
      } catch (err) {
        console.warn(`  skip relink ${filePath}: ${err.message}`);
      }
    }

    try {
      chmodSync(filePath, 0o755);
    } catch {
      // ignore
    }
  };

  console.log('Relinking bundled PostgreSQL for portable macOS use...');
  for (const file of listFilesRecursive(binDir)) relinkFile(file, 'bin');
  for (const file of listFilesRecursive(libRoot)) {
    if (file.endsWith('.dylib')) relinkFile(file, 'lib');
  }
  console.log(`Relink complete (${changes} dependency path(s) updated)`);
};

const patchMacPostgresSharePath = (bundleRoot) => {
  if (process.platform !== 'darwin') return;

  const replacement = '/tmp/insurecrm-pgshare';
  const candidates = [
    '/opt/homebrew/opt/postgresql@18/share/postgresql@18',
    '/opt/homebrew/opt/postgresql@17/share/postgresql@17',
    '/opt/homebrew/opt/postgresql@16/share/postgresql@16',
    '/opt/homebrew/opt/postgresql@15/share/postgresql@15',
    '/usr/local/opt/postgresql@18/share/postgresql@18',
    '/usr/local/opt/postgresql@17/share/postgresql@17',
    '/usr/local/opt/postgresql@16/share/postgresql@16',
    '/usr/local/opt/postgresql@15/share/postgresql@15',
  ];

  let patched = 0;
  for (const file of listFilesRecursive(bundleRoot)) {
    if (!isMachO(file)) continue;
    let data = readFileSync(file);
    let changed = false;

    for (const oldPath of candidates) {
      const oldBuf = Buffer.from(oldPath, 'utf8');
      const idx = data.indexOf(oldBuf);
      if (idx === -1) continue;
      if (replacement.length > oldPath.length) {
        throw new Error(`Replacement PostgreSQL share path is too long: ${replacement}`);
      }
      const newBuf = Buffer.alloc(oldPath.length);
      newBuf.write(replacement, 'utf8');
      data = Buffer.concat([data.subarray(0, idx), newBuf, data.subarray(idx + oldBuf.length)]);
      changed = true;
    }

    if (changed) {
      writeFileSync(file, data);
      patched += 1;
      console.log(`  patched share path: ${basename(file)}`);
    }
  }
  console.log(`Patched PostgreSQL share path in ${patched} Mach-O file(s)`);
};

const signMacPostgres = (bundleRoot) => {
  if (process.platform !== 'darwin') return;

  console.log('Ad-hoc signing bundled PostgreSQL binaries...');
  let signed = 0;
  for (const file of listFilesRecursive(bundleRoot)) {
    if (!isMachO(file)) continue;
    try {
      execSync(`codesign --force --sign - "${file}"`, { stdio: 'pipe' });
      signed += 1;
    } catch (err) {
      console.warn(`  codesign failed for ${file}: ${err.message}`);
    }
  }
  console.log(`Signed ${signed} PostgreSQL Mach-O file(s)`);
};

const bundleFromHomebrew = () => {
  const formulas = ['postgresql@16', 'postgresql@18', 'postgresql@15', 'postgresql'];
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
    if (process.env.CI === 'true') {
      console.log('CI: installing postgresql@16 via Homebrew...');
      execSync('brew install postgresql@16', { stdio: 'inherit' });
      prefix = execSync('brew --prefix postgresql@16', { encoding: 'utf8' }).trim();
    }
  }

  if (!prefix || !existsSync(join(prefix, 'bin', 'pg_ctl'))) {
    throw new Error(
      'Homebrew PostgreSQL not found. Install with: brew install postgresql@16 (macOS CI installs this automatically)',
    );
  }

  rmSync(destDir, { recursive: true, force: true });
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

  if (platform === 'mac') {
    const initdb = join(destDir, 'bin', 'initdb');
    const out = execSync(`otool -L "${initdb}"`, { encoding: 'utf8' });
    const bad = out
      .split('\n')
      .filter((line) => line.includes('/opt/homebrew/') || line.includes('/usr/local/opt/'));
    if (bad.length) {
      console.warn('Warning: initdb still references Homebrew paths:');
      bad.forEach((line) => console.warn(`  ${line.trim()}`));
    } else {
      console.log('initdb has no Homebrew dylib dependencies');
    }

    const postgres = join(destDir, 'bin', 'postgres');
    const stringsOut = execSync(`strings "${postgres}"`, { encoding: 'utf8' });
    const badSharePath = stringsOut
      .split('\n')
      .find((line) => /\/(opt\/homebrew|usr\/local)\/opt\/postgresql@\d+\/share\/postgresql@\d+/.test(line));
    if (badSharePath) {
      throw new Error(`postgres still references Homebrew share path: ${badSharePath}`);
    }
    console.log('postgres has no Homebrew share path dependency');
  }
};

const main = async () => {
  mkdirSync(RESOURCES, { recursive: true });

  if (platform === 'win') {
    await bundleFromZip(URLS.win);
  } else if (platform === 'mac') {
    const url = process.arch === 'x64' ? URLS.mac_x64 : URLS.mac;
    try {
      await bundleFromZip(url);
    } catch (zipErr) {
      console.warn(`Portable zip bundle failed: ${zipErr.message}`);
      bundleFromHomebrew();
    }
    copyExternalDeps(destDir);
    relinkMacPostgres(destDir);
    patchMacPostgresSharePath(destDir);
    signMacPostgres(destDir);
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  verify();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
