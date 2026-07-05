# InsureCRM Desktop — Release Shell

Electron installer for InsureCRM. **All CRM features live in the app source repos** — this repo only bundles, licenses, and ships the desktop app.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the full split.

## What this repo contains

- Electron main/preload (license, PostgreSQL setup, auto-update)
- Build scripts (`sync-crm-app.mjs`, PostgreSQL bundler)
- GitHub Actions → DMG + EXE to [insurance-crm-build](https://github.com/Jaygupta6387/insurance-crm-build/releases)

## What this repo does NOT contain

- CRM feature development — use `New-CRM 2/` locally, or `InsureCRM-Backend` + `InsureCRM-Frontend` on GitHub
- Duplicate CRM source under `packages/` (removed; sync uses `New-CRM 2` → `.crm-bundle/` at build time)

## Development

```bash
npm install
# Run New-CRM 2/backend + New-CRM 2/frontend separately, or:
npm run dev
```

Dev mode loads CRM from `../New-CRM 2/` automatically.

## Build installers

```bash
npm run dist:mac   # macOS
npm run dist:win   # Windows
```

Runs `sync:crm` first (copies + builds backend/frontend into `.crm-bundle/`), then packages Electron.

## Publish release

1. Push app source to GitHub:
   - `Jaygupta6387/InsureCRM-Backend`
   - `Jaygupta6387/InsureCRM-Frontend`
2. Bump `version` in `package.json`
3. Tag and push:

```bash
git tag v1.3.0
git push origin v1.3.0
```

CI checks out both private app repos using `CRM_SOURCE_TOKEN`, syncs CRM, builds Mac + Windows, publishes to GitHub Releases.

## License API

Production: `https://super-admin-panel-crm-backend.onrender.com/api`

Local override:

```bash
export LICENSE_CLOUD_API_URL=http://localhost:5001/api
```
