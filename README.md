# InsureCRM Desktop

Electron desktop app for InsureCRM — local PostgreSQL, cloud license activation, and bundled CRM.

## Requirements

- Node.js 20+
- macOS or Windows for development

## Development

```bash
npm install
cd packages/crm-backend && npm install && npx prisma generate --schema=prisma/company.prisma
cd ../crm-frontend && npm install
cd ../..
npm run dev
```

## Build installers

```bash
# macOS (on Mac)
npm run dist:mac

# Windows (on Windows, or via GitHub Actions)
npm run dist:win
```

## Auto-update

The app checks [GitHub Releases](https://github.com/Jaygupta6387/insurance-crm-build/releases) for updates.

When a new version is published, users see:

1. **Update available** — downloading in the background
2. **Update ready — click here to restart and update** — installs on click

### Publish a new release

1. Bump `version` in `package.json`
2. Commit and push to `main`
3. Create and push a tag:

```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions builds Windows + macOS installers and uploads them to the release.

## License cloud API

Production builds use `https://super-admin-panel-crm-backend.onrender.com/api` for license activation.

Override locally with:

```bash
export LICENSE_CLOUD_API_URL=http://localhost:5001/api
```
