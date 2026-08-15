# How to Build & Share InsureCRM Desktop

This guide produces installers you can copy to another Mac or Windows PC.  
On first Admin launch the app downloads PostgreSQL **18.4.2** (server **18.4**, once), then auto-configures the database.

---

## What the user experiences on a new device

1. Install `.dmg` (Mac) or `.exe` (Windows)
2. Open InsureCRM Desktop
3. Enter license key (activation)
4. Setup wizard runs automatically:
   - Downloads PostgreSQL 18.4.2 from InsuredHub GitHub Release (internet once)
   - Creates secure password + database
   - Creates tables + admin user
   - Opens CRM login
5. Later launches work **offline** using the cached PostgreSQL runtime

---

## Option A — GitHub Release (Mac + Windows together) ✅ Recommended

Push a version tag; CI builds both platforms and publishes to GitHub Releases.

```bash
cd "/Users/jay/Projects/New Workspace/insurecrm-desktop"

git add -A
git commit -m "release: prepare installers"
git push origin main

git tag v1.4.2
git push origin v1.4.2
```

After CI finishes, download from:

**https://github.com/Jaygupta6387/insurance-crm-build/releases**

| File | Device |
|------|--------|
| `InsureCRM-Desktop-*-arm64.dmg` | Apple Silicon Mac |
| `InsureCRM-Desktop-*-x64.dmg` | Intel Mac |
| `InsureCRM-Desktop-*-Setup.exe` | Windows 10/11 x64 |

Required GitHub secrets on `insurance-crm-build`:

- `CRM_SOURCE_TOKEN` — PAT that can read Backend + Frontend repos
- Optional: `POSTGRES_PORTABLE_SHA256_*` — SHA-256 digests when available
  (Windows/macOS ARM64 download URLs are baked into the app as public defaults)

---

## Option B — Build on this Mac (Mac installer only)

Windows `.exe` cannot be built on macOS without CI. Use Option A for Windows.

```bash
cd "/Users/jay/Projects/New Workspace/insurecrm-desktop"

# Optional: export POSTGRES_PORTABLE_SHA256_* if verifying packages
npm run sync:crm
npm run build
npx electron-builder --mac --arm64 --x64 --config electron-builder.yml
```

Or:

```bash
npm run release:mac
```

Installers appear in `insurecrm-desktop/release/`.

---

## Option C — Build Windows on a Windows PC

```powershell
cd insurecrm-desktop
npm ci
npm run release:win
```

---

## Sharing checklist

- [ ] Built with `sync:crm` so backend+frontend are inside the installer
- [ ] Tested on Apple Silicon Mac and/or Windows (Intel Mac not supported yet)
- [ ] First Admin setup has internet once (for PostgreSQL download)
- [ ] License activation works

### Reset test machine (simulate fresh install)

**macOS:**
```bash
rm -rf ~/Library/Application\ Support/insurecrm-desktop
```

**Windows:**
```
%AppData%\insurecrm-desktop
```

Then open the app again — full auto-setup should run (including PG download if needed).

---

## Architecture (auto-config)

```
Installer ships:
  Electron shell
  + CRM backend (crm-bootstrap.cjs)
  + CRM frontend (dist)
  + NO PostgreSQL binaries

First Admin run (internet once):
  License activate
       ↓
  SetupWizard
       ↓
  ensurePostgresRunning()
       ├── detect userData/postgresql-runtime (server 18.4 / package 18.4.2)
       ├── else download GitHub ZIP → extract → verify
       ├── initdb + start
       ├── create user/db + secure password
       └── store credentials in secure store
       ↓
  Start CRM backend (migrations + seed inside backend)
       ↓
  Open CRM UI

Later launches:
  reuse postgresql-runtime → offline OK
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Setup fails: PostgreSQL download | Check internet; verify GitHub Release `v18.4.2` is reachable |
| Setup fails on Intel Mac | Unsupported — use Apple Silicon or Windows |
| Setup fails: checksum mismatch | Fix `POSTGRES_PORTABLE_SHA256_*` or clear dependency-cache |
| Gatekeeper blocks Mac app | Right-click → Open (unsigned builds) |
| Windows SmartScreen | More info → Run anyway (until code-signed) |
| License activation fails | Check internet + license key |
| Sync CRM fails (Prisma paths) | Ensure CRM sources are available or set `CRM_APP_PATH` |
