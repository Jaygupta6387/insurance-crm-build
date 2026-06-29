# InsureCRM Desktop Resources

## PostgreSQL (required for Windows/macOS production builds)

The setup wizard runs a **local** PostgreSQL instance on port `54329`. The installer must include PostgreSQL tools, or the user must have PostgreSQL installed.

### Option A — Bundle portable binaries (recommended for clients)

Place binaries before `npm run dist:win` / `npm run dist:mac`:

- `postgresql-win/bin/` — `pg_ctl.exe`, `initdb.exe`, `psql.exe`, and dependent DLLs
- `postgresql-mac/bin/` — `pg_ctl`, `initdb`, `psql`, etc.

Download Windows binaries: https://www.enterprisedb.com/download-postgresql-binaries (PostgreSQL 16 zip, extract `bin/` into `resources/postgresql-win/bin/`).

### Option B — System PostgreSQL (development / IT-managed PCs)

- **Windows:** Install PostgreSQL 16 from https://www.postgresql.org/download/windows/ (default path `C:\Program Files\PostgreSQL\16\`). Restart the app and run setup again.
- **macOS:** `brew install postgresql@16`

The app detects standard install paths and creates its own data directory under `%AppData%\insurecrm-desktop\postgresql\pgdata`.
