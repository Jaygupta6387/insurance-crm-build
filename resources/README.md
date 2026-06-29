# InsureCRM Desktop Resources

Place bundled PostgreSQL binaries here for production builds:

- `postgresql-win/bin/` — Windows PostgreSQL 16 portable binaries (`pg_ctl.exe`, `initdb.exe`, etc.)
- `postgresql-mac/bin/` — macOS PostgreSQL binaries (`pg_ctl`, `initdb`, etc.)

During development, the app falls back to system PostgreSQL (Homebrew on macOS) if bundled binaries are not present.

## Package links

Symlink CRM packages for development:

```bash
mkdir -p packages
ln -sf "../../New-CRM 2/backend" packages/crm-backend
ln -sf "../../New-CRM 2/frontend" packages/crm-frontend
```
