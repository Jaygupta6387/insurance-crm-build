# InsuredHub Dependency Manager

> Architecture reference for the runtime dependency installation system introduced in **Phase 6**.

---

## Overview

InsuredHub Enterprise CRM ships as an Electron desktop application. In **Server** and **Desktop** installation modes the app requires a local PostgreSQL instance. Rather than bundling a full PostgreSQL binary (which inflates installer size by ~100 MB+), the Dependency Manager downloads, verifies, and installs the correct PostgreSQL release at first launch.

The system covers:

| Concern | Solution |
|---------|----------|
| Detecting what is already installed | `getDependencyManager().getStatus()` |
| Downloading from a CDN | Resumable HTTP download with progress events |
| Integrity verification | SHA-256 checksum before installation |
| Silent install | Platform-specific silent-install flags |
| Service lifecycle | initdb, pg_ctl start, systemd (Linux) |
| Database provisioning | Prisma `db push` + seed script |
| UI feedback | `DependencyInstaller` React component via IPC |

---

## Architecture

```
Renderer (React)                    Main Process (Electron)
─────────────────────────────────   ───────────────────────────────────────
DependencySetupPage                 electron/ipc/dependency-ipc-handlers.ts
  └── DependencyInstaller           registerDependencyIpcHandlers(win)
        ├── DownloadProgress          ├── dependency:ensure-postgres
        ├── InstallationStep          ├── dependency:status
        └── DependencyStatusBadge     ├── dependency:cancel / retry
                                      ├── dependency:get-manifest
                                      ├── dependency:cache-info
                                      └── dependency:clear-cache
                                              │
                                    electron/services/dependency-manager/
                                      dependency-manager.service.ts
                                        ├── detect()      – which deps present?
                                        ├── download()    – resumable HTTP
                                        ├── verify()      – SHA-256 check
                                        ├── install()     – silent OS install
                                        ├── configure()   – initdb / service
                                        └── migrate()     – Prisma + seed
```

### IPC Event Flow

```
Main → Renderer (push events)
  dependency:step-update       { stepId, status, detail?, error? }
  dependency:download-progress { filename, percentage, speedKBps,
                                 etaSeconds, bytesDownloaded, totalBytes, status }
  dependency:log               string (one log line)

Renderer → Main (invoke)
  dependency:ensure-postgres   → triggers full install flow
  dependency:cancel            → sets cancel flag
  dependency:retry             → resets cancel flag
  dependency:status            → returns DependencyStatus[]
  dependency:get-manifest      → returns Manifest JSON
  dependency:cache-info        → returns CacheInfo
  dependency:clear-cache       → deletes cached downloads
```

---

## Manifest Format

The manifest lives at `https://download.insuredhub.com/manifest.json` and is
fetched at startup (with a local fallback for offline scenarios).

```jsonc
{
  "version": "1",
  "dependencies": {
    "postgresql": {
      "version": "18.4.2",
      "serverVersion": "18.4",
      "platforms": {
        "win32-x64": {
          "url": "https://github.com/Jaygupta6387/insuredhub-dependencies/releases/download/v18.4.2/postgresql-18.4-2-windows-x64-binaries.zip",
          "filename": "postgresql-18.4-2-windows-x64-binaries.zip",
          "sha256": "…",
          "size": 0
        },
        "darwin-arm64": {
          "url": "https://github.com/Jaygupta6387/insuredhub-dependencies/releases/download/v18.4.2/postgresql-18.4-2-osx-binaries.zip",
          "filename": "postgresql-18.4-2-osx-binaries.zip",
          "sha256": "…",
          "size": 0
        },
        "darwin-x64": {
          "url": "",
          "filename": "postgresql-18.4-2-osx-x64-binaries.zip",
          "note": "Intel Mac not supported yet",
          "sha256": "",
          "size": 0
        }
      }
    }
  }
}
```

`{{PGPASSWORD}}` and `{{DATADIR}}` are template variables substituted at install
time by `dependency-manager.service.ts`.

---

## Adding a New Dependency

1. **Add to manifest** — publish a new entry under `dependencies` in `manifest.json`
   on the CDN. Include all platforms you support.

2. **Register a step** — add a step definition to `buildInitialSteps()` in
   `DependencyInstaller.tsx` so the UI shows the new step.

3. **Implement service logic** — create or extend
   `electron/services/dependency-manager/*.service.ts` with:
   - `detect()` — returns `installed | not-installed`
   - `install(platformEntry)` — silent install
   - `configure()` — post-install setup

4. **Wire IPC** — add a new `ipcMain.handle('dependency:ensure-<name>', …)` in
   `dependency-ipc-handlers.ts` if the dependency needs a separate trigger.

5. **Add preload entry** — expose the new channel in `electron/preload.ts` under the
   `desktop` API object.

---

## Download Server Setup

All binaries are served from `https://download.insuredhub.com`.

### Requirements

- HTTPS only (required for checksum trust)
- `Content-Length` header must be present for progress calculation
- Support `Range` request headers for resumable downloads
- Serve `manifest.json` with `Cache-Control: max-age=300`

### Directory layout

```
/manifest.json
# PostgreSQL 18.4.2 portable ZIPs (GitHub Release v18.4.2):
#   postgresql-18.4-2-windows-x64-binaries.zip
#   postgresql-18.4-2-osx-binaries.zip
#   (Intel Mac deferred)
```

### Hosting options

Any object storage with a CDN edge works: AWS S3 + CloudFront, Cloudflare R2,
or BunnyCDN. The download URL in the manifest should point to the CDN edge, not
the origin bucket.

---

## Platform Support

| OS | Architecture | Installer Format | Silent Install Flag |
|----|-------------|-----------------|-------------------|
| Windows 10/11 | x64 | EnterpriseDB `.exe` | `--mode unattended` |
| macOS 12+ | arm64 (Apple Silicon) | Postgres.app `.dmg` | AppleScript/CLI mount |
| macOS 12+ | x64 (Intel) | Postgres.app `.dmg` | AppleScript/CLI mount |
| Ubuntu 22.04+ | x64 | `.tar.gz` | extracted + systemd unit |
| Debian 12+ | x64 | `.tar.gz` | extracted + systemd unit |

> **Note:** On macOS the user may be prompted for an administrator password
> during installation because the DMG installer writes to `/Applications`.
> This is expected and cannot be suppressed without a pre-approved MDM profile.

---

## Security

### Checksum Verification

Every download is verified against the `sha256` field in the manifest **before**
the installer is executed. Verification uses Node's built-in `crypto` module
(no external deps):

```typescript
import { createHash } from 'crypto';
import { createReadStream } from 'fs';

async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}
```

If the checksum does not match, the downloaded file is deleted and an error is
surfaced to the user via the `DownloadProgress` component's `error` state.

### Future: Code Signing

A future release will add code-signing verification for Windows (Authenticode)
and macOS (notarisation check) before running the downloaded installer. The
manifest will carry a `signature` field for this purpose:

```jsonc
"signature": {
  "type": "authenticode",         // or "apple-notarised"
  "thumbprint": "SHA1:aabbcc…"    // expected certificate thumbprint
}
```

### Manifest Integrity

The manifest itself is fetched over HTTPS. For high-security deployments
consider pinning the server certificate or fetching the manifest with an HMAC
token.

---

## Cache Management

Downloaded binaries are stored in Electron's `userData` directory:

```
<userData>/
  dependency-cache/
    postgresql-18.4-2-windows-x64-binaries.zip
  postgresql-runtime/
    postgresql-win/   (or postgresql-mac/)
```

### Cache hit logic

Before downloading, the manager checks whether the target file already exists
**and** its SHA-256 matches the manifest. If it does, the download step is
skipped and the cached file is used directly.

### Cache invalidation

The manifest `version` field is compared on startup. If it changes the cache
entry is considered stale and re-downloaded on next install.

### Clearing the cache

Users can clear the cache from the app's Settings screen, which calls
`dependency:clear-cache` via IPC. The handler deletes all files in
`dependency-cache/` and returns `{ cleared: true }`.

---

## Troubleshooting

### Installation hangs on "Downloading PostgreSQL"

1. Check network connectivity — the CDN URL must be reachable from the machine.
2. Open the Installation Log panel (collapsible at the bottom of the installer
   UI) for detailed HTTP error codes.
3. Check whether a corporate proxy is blocking the download. Set `HTTP_PROXY`
   / `HTTPS_PROXY` environment variables before launching the app.

### "Checksum mismatch" error

The downloaded file is corrupt or was tampered with. The file is automatically
deleted. Click **Retry** to re-download.

### PostgreSQL service fails to start

- **Windows**: Check the Event Viewer → Application log for PostgreSQL service errors.
  Ensure port 5432 is not in use: `netstat -ano | findstr :5432`.
- **macOS**: Check `~/Library/Logs/PostgreSQL/` for `postgresql-*.log`.
- **Linux**: Run `journalctl -u insuredhub-postgres -n 100` for service logs.

### "Creating Database User" fails

The PostgreSQL service started but the `insurecrm` role already exists from a
previous (possibly broken) install. Run:

```sql
-- Connect as postgres superuser
DROP ROLE IF EXISTS insurecrm;
```

Then click **Retry**.

### Migrate / Seed step errors

Prisma migration errors are logged to the Installation Log panel. Common causes:

- Database already at a newer migration than the current binary (downgrade scenario)
- Disk space exhausted during migration

---

## Migration from Bundled PostgreSQL

Older InsureCRM Desktop builds bundled PostgreSQL inside the installer
(`resources/postgresql-win` / `postgresql-mac`). Current builds do **not**.

### Upgrade path

1. Admin setup downloads PostgreSQL **18.4.2** into `userData/postgresql-runtime`
   (server binaries report **18.4**).
2. Existing CRM data under `userData` is preserved; do **not** mix major versions
   against an old data directory without a proper dump/restore.
3. Installer size no longer includes PostgreSQL binaries.

### Data preservation

The data directory remains under Electron `userData` (see postgres-provider).
Upgrading binaries across major PostgreSQL versions may require a dump/restore —
the app will not silently wipe customer data.
