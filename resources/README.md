# InsureCRM Desktop Resources

## PostgreSQL (downloaded at Admin setup)

PostgreSQL is **not** shipped inside the Electron installer.

On first Admin setup:

1. Desktop calls Super Admin `GET /api/dependencies/postgresql`
2. Receives version + HTTPS GitHub URL + SHA-256
3. Downloads the ZIP **directly from GitHub**
4. Verifies SHA-256, extracts into `userData/postgresql-runtime/`

Configure only:

```bash
LICENSE_CLOUD_API_URL=https://your-super-admin-host/api
```

## Files

| File | Purpose |
|------|---------|
| `dependency-manifest.json` | Local fallback metadata (OCR + PG detectPaths) |
| `service-daemon.js` | Windows Service entry (SERVER mode) |
| `service-daemon-config.json` | Service config template |
