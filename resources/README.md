# InsureCRM Desktop Resources

## PostgreSQL (required for Windows/macOS production builds)

The setup wizard runs a **local** PostgreSQL instance on port `54329`. The installer must include PostgreSQL tools, or the user must have PostgreSQL installed.

### Option A — Bundle portable binaries (required for macOS client builds)

Before `npm run dist:mac` / `npm run dist:win`, run:

```bash
npm run bundle:postgresql:mac   # or bundle:postgresql:win
```

This downloads official PostgreSQL 16 portable binaries and relinks macOS libraries so clients do **not** need Homebrew PostgreSQL installed.

- `postgresql-win/bin/` — `pg_ctl.exe`, `initdb.exe`, `psql.exe`, and dependent DLLs
- `postgresql-mac/bin/` — `pg_ctl`, `initdb`, `psql`, etc. (self-contained, no `/opt/homebrew` paths)

### Option B — System PostgreSQL (development / IT-managed PCs)

- **Windows:** Install PostgreSQL 16 from https://www.postgresql.org/download/windows/ (default path `C:\Program Files\PostgreSQL\16\`). Restart the app and run setup again.
- **macOS:** `brew install postgresql@16`

The app detects standard install paths and creates its own data directory under `%AppData%\insurecrm-desktop\postgresql\pgdata`.
