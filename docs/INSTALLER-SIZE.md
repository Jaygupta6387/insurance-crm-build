# Why is the installer large?

Unpacked Windows app is still large mainly because of the CRM backend `node_modules`
and Electron runtime. **PostgreSQL is no longer bundled** in the installer.

## Biggest pieces

| Piece | Approx size | Who needs it |
|-------|-------------|--------------|
| CRM backend `node_modules` | ~250–300MB | Admin PC only |
| Electron runtime | ~150MB+ | Everyone |
| CRM frontend | ~5MB | Everyone |
| PostgreSQL 18.4.2 (portable) | ~120–150MB | Admin PC only — **downloaded on first setup** |

Employee PCs do **not** need PostgreSQL or a full local CRM backend.

## PostgreSQL download (Admin setup)

On first Admin setup, InsureCRM Desktop downloads PostgreSQL **18.4.2** from:

https://github.com/Jaygupta6387/insuredhub-dependencies/releases/tag/v18.4.2

- Windows: `postgresql-18.4-2-windows-x64-binaries.zip`
- macOS ARM64: `postgresql-18.4-2-osx-binaries.zip`
- macOS Intel: not supported yet (`POSTGRES_PORTABLE_URL_MAC_X64` empty)

After download, subsequent launches reuse `userData/postgresql-runtime` offline.
