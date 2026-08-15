/**
 * forge.config.optimized.js — Production-optimized Electron Forge configuration
 *
 * This is a reference configuration for production builds.
 * Do NOT replace forge.config.js without testing on each target platform first.
 *
 * Key optimizations over the default config:
 * ─────────────────────────────────────────────────────────────────────────────
 *  • ASAR packaging       — packs app files into a single .asar archive,
 *                           reducing file count and improving load time.
 *  • asarUnpack           — native modules (e.g. better-sqlite3) unpacked
 *                           so Node can dlopen() them directly.
 *  • Ignore patterns      — strips TypeScript sources, source maps, test
 *                           files, and tooling configs from the bundle.
 *  • win32metadata        — correct CompanyName / ProductName for Windows
 *                           SmartScreen reputation and EV code signing.
 *  • Squirrel installer   — auto-update support on Windows; configure
 *                           code-signing via CERT_FILE / CERT_PASSWORD env vars.
 *  • maker-zip            — cross-platform portable archive for macOS/Linux.
 *  • Vite plugin          — uses Vite for both main/preload and renderer
 *                           builds (matches the existing vite.*.config.ts files).
 *
 * Usage:
 *   npx electron-forge make --config forge.config.optimized.js
 *
 * Or set it as the default by renaming:
 *   cp forge.config.optimized.js forge.config.js   # after testing
 */

'use strict';

module.exports = {
  // ── Packager ───────────────────────────────────────────────────────────────

  packagerConfig: {
    /** Pack application files into a .asar archive for faster startup */
    asar: true,

    /**
     * Files that must remain on the real filesystem (native modules).
     * better-sqlite3 uses a .node binary that cannot be loaded from inside .asar.
     */
    asarUnpack: [
      '**/node_modules/better-sqlite3/**',
      '**/node_modules/sharp/**',        // if image processing is used
    ],

    /** Application identity */
    icon:           './resources/icon',  // Forge appends .icns / .ico / .png
    name:           'InsuredHub',
    executableName: 'InsuredHub',

    /** Read version from package.json at pack time */
    appVersion:    require('./package.json').version,
    appCopyright:  `Copyright © ${new Date().getFullYear()} InsuredHub`,

    /**
     * Files / directories to exclude from the production bundle.
     * Each entry is tested against the full absolute path of every file.
     */
    ignore: [
      /^\/src/,                          // TypeScript source files
      /\.ts$/,                           // Any stray .ts files
      /tsconfig/,                        // TypeScript config files
      /\.map$/,                          // Source maps
      /node_modules\/.*\/test\//,        // Test directories inside deps
      /node_modules\/.*\/tests\//,
      /node_modules\/.*\/__tests__\//,
      /node_modules\/.*\/\.github/,      // GitHub metadata inside deps
      /node_modules\/.*\/CHANGELOG\.md$/,
      /README\.md$/,
      /CHANGELOG\.md$/,
      /\.eslint/,                        // ESLint config files
      /jest\.config/,                    // Jest config files
      /\.prettierrc/,
      /\.editorconfig/,
      /forge\.config\.optimized\.js$/,   // Don't include this file itself
    ],

    /** Windows-specific metadata for SmartScreen and Add/Remove Programs */
    win32metadata: {
      CompanyName:      'InsuredHub',
      FileDescription:  'InsuredHub Enterprise CRM',
      ProductName:      'InsuredHub',
      InternalName:     'InsuredHub',
      OriginalFilename: 'InsuredHub.exe',
    },

    /** macOS code signing (configure via environment in CI) */
    // osxSign: {
    //   identity: process.env.APPLE_SIGNING_IDENTITY,
    // },
    // osxNotarize: {
    //   appleId:           process.env.APPLE_ID,
    //   appleIdPassword:   process.env.APPLE_APP_SPECIFIC_PASSWORD,
    //   teamId:            process.env.APPLE_TEAM_ID,
    // },
  },

  // ── Rebuild config ─────────────────────────────────────────────────────────

  /**
   * electron-rebuild configuration for native Node modules.
   * Leave empty to use defaults (rebuilds all detected native modules).
   */
  rebuildConfig: {},

  // ── Makers ─────────────────────────────────────────────────────────────────

  makers: [
    // ── Windows: Squirrel installer with auto-update support ─────────────────
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'InsuredHub',

        /** Icon for the installer wizard */
        setupIcon: './resources/icon.ico',

        /** Code signing — provide cert via environment variables in CI */
        // certificateFile:     process.env.CERT_FILE,
        // certificatePassword: process.env.CERT_PASSWORD,

        /** Start Menu / Desktop shortcuts */
        shortcutName:            'InsuredHub CRM',
        createDesktopShortcut:   true,
        createStartMenuShortcut: true,

        /**
         * Loading GIF shown during install (optional).
         * Must be 164 × 314 px.
         */
        // loadingGif: './resources/installer-loading.gif',
      },
    },

    // ── macOS / Linux: ZIP archive (portable) ────────────────────────────────
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },

    // ── macOS: .dmg disk image (uncomment when code signing is configured) ───
    // {
    //   name: '@electron-forge/maker-dmg',
    //   config: {
    //     format: 'ULFO',
    //     icon:   './resources/icon.icns',
    //     name:   'InsuredHub',
    //   },
    // },

    // ── Linux: .deb package (uncomment for Debian/Ubuntu distribution) ───────
    // {
    //   name: '@electron-forge/maker-deb',
    //   config: {
    //     options: {
    //       icon:        './resources/icon.png',
    //       name:        'insuredhub',
    //       productName: 'InsuredHub CRM',
    //       maintainer:  'InsuredHub <support@insuredhub.com>',
    //       homepage:    'https://insuredhub.com',
    //       categories:  ['Office', 'Finance'],
    //     },
    //   },
    // },
  ],

  // ── Plugins ────────────────────────────────────────────────────────────────

  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        /**
         * Main process and preload builds.
         * Each entry maps an Electron entry point to a Vite config file.
         */
        build: [
          {
            entry:  'electron/main.ts',
            config: 'vite.main.config.ts',
          },
          {
            entry:  'electron/preload.ts',
            config: 'vite.preload.config.ts',
          },
        ],

        /**
         * Renderer process (React app).
         * The name must match the BrowserWindow's loadURL/loadFile call.
         */
        renderer: [
          {
            name:   'main_window',
            config: 'vite.renderer.config.ts',
          },
        ],
      },
    },
  ],

  // ── Publishers (uncomment to enable automated release publishing) ──────────

  // publishers: [
  //   {
  //     name: '@electron-forge/publisher-github',
  //     config: {
  //       repository: { owner: 'insuredhub', name: 'insurecrm-desktop' },
  //       prerelease: false,
  //       draft:      true,   // create as draft, promote manually
  //     },
  //   },
  // ],
};
