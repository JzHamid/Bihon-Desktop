# Bihon

A local manga and webtoon reader for **Windows, Linux, and Android**. Desktop also reads DRM-free EPUB books. Each device keeps its own library; no account or hosted Bihon service is required.

| Platform | Package | Engine | Library data |
| --- | --- | --- | --- |
| Windows x64 | `Bihon-Setup-0.4.0-x64.exe` | Bundled Suwayomi, Java, Electron | `%LOCALAPPDATA%\Bihon` |
| Linux x64 | `Bihon-0.4.0-x64.AppImage` or `.deb` | Bundled Suwayomi, Java, Electron | `$XDG_DATA_HOME/Bihon` or `~/.local/share/Bihon` |
| Android 8+ | `Bihon-Android-0.4.0.apk` | Native Mihon 0.21.2 adaptation | Android app storage, separate from Mihon |

Version 0.4.0 is a release candidate until the checks in [VERIFICATION.md](VERIFICATION.md) pass. An Android filename ending in `-test.apk` uses disposable test signing and is for CI validation only. Production Android releases require a persistent Bihon signing identity.

## Install

**Windows:** close the existing app, run the newer installer over it, then open Bihon. Java is included. The installer is unsigned.

**Linux:** install the `.deb` with `sudo apt install ./Bihon-0.4.0-x64.deb`, or mark the AppImage executable and open it. AppImage needs FUSE 2 support; if unavailable, run `./Bihon-0.4.0-x64.AppImage --appimage-extract-and-run`. Use a graphical desktop with X11 or Xwayland (`DISPLAY` must be set for extension WebViews). The Debian package declares the desktop libraries it needs. ARM Linux is not supported by this release.

**Android:** install the production APK and allow your browser/file manager to install it when Android asks. Bihon installs alongside Mihon. Existing Mihon data is not overwritten; export a backup in Mihon and restore it in Bihon, keeping your original. See [Android details](docs/android.md) for capabilities and build instructions.

Desktop and Android have separate databases and downloads. There is no automatic phone/PC sync. Android uses Mihon's native manga reader; the desktop EPUB/OPDS shelf is not included. Third-party OAuth trackers that depend on Mihon's app registrations are unavailable in this independent Android build; self-hosted trackers and MangaUpdates remain available.

## Read on desktop

1. Open **Browse > Extensions** and install an extension. Keiyoushi is registered once on first launch, retries after offline startup, and respects later removal in **Settings > Browse > Extension stores**.
2. Open **Browse > Sources**, select your source, and add a series to the library.
3. Open a chapter to read online, or download it for offline reading. Modern APK conversion has limitations; prefer repository-provided JVM extensions. Pepper&Carrot passed historical online/offline checks; extension compatibility varies.

Use **Ctrl + wheel**, a trackpad pinch, or the reader's minus/percentage/plus controls to zoom artwork. Drag to pan. **Ctrl+0** or **Escape** resets zoom; Escape at fit leaves the reader. **F11** toggles fullscreen. Library cards mark whole-number gaps in fetched chapter metadata; chapters never reported by a source cannot be detected.

Open **Books** to import owned DRM-free EPUB files. Originals are preserved; verified managed copies live under the chosen downloads folder. The reader supports contents, search, page/scroll modes, typography, themes, and saved CFI progress. **Books > Discover** includes Project Gutenberg and supports unauthenticated legal OPDS 1.2/2.0 catalogs. Public catalogs require HTTPS; private-network HTTP requires explicit approval. DRM bypass and paid/authenticated storefronts are not supported.

## Data and updates

**Settings > Downloads > Choose folder** moves downloads through a verified, resumable migration. Choose an empty destination. Do not edit either directory while a move is running.

Library backups in **Settings > Backup** exclude chapter files and managed EPUB files. Daily backups run at 18:00 with 14-day retention while desktop Bihon is open. Before a newer desktop version opens an existing library, Bihon creates and verifies an upgrade snapshot; find it under **Help > Open upgrade backups**. Reinstalling preserves user data. Keep original Mihon backups until their contents are checked after import.

See [UPDATING.md](UPDATING.md), [VERIFICATION.md](VERIFICATION.md), and [third-party notices](THIRD-PARTY-NOTICES.md). Share each binary with its corresponding source archive and checksum file.

## Build

Desktop needs Node.js 24+ and JDK 17+ on the target OS. Linux packaging also needs the graphical libraries declared in `electron-builder.cjs` and the usual electron-builder Linux packaging tools. Run:

```
npm ci --no-audit --no-fund
npm run bootstrap -- --skip-install
npm run check
npm run dist:windows
# On Linux instead: npm run dist:linux
```

Bootstrap verifies the pinned Suwayomi and JetBrains downloads, compiles the Java wrapper, and builds the UI. Development uses `npm start`; rebuild interface changes with `npm run build:ui`. The Windows PowerShell bootstrap remains available. Packages must be built on their target OS because the JVM and extension WebView contain native code.

After committing the version and source on a topic branch, `npm run release` builds/tests the desktop package, corresponding source, instructions, and checksums. Run the [packaged functional check](PACKAGED-SMOKE.md) before distributing. GitHub Actions builds both desktop platforms and the Android app, checks Android migrations/unit tests, and launches it on API 26 and 35 emulators. See [docs/android.md](docs/android.md) for native Android builds and signing.

Upstream pins are recorded in `UPSTREAM.json` and `android/upstream.json`. Desktop corresponding source is in `vendor/server` and `vendor/webui`; the Android source archive contains the full pinned source with Bihon's recorded changes. The original `JzHamid/Bihon` Android fork is preserved.
