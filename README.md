# Bihon

A local Windows manga, webtoon, and EPUB reader powered by Suwayomi and Foliate JS. Each friend runs their own installation; no account, hosted server, or separate Java installation is needed.

## Try it

1. Run **Bihon Setup 0.3.0.exe** and open Bihon. The build is unsigned, so Windows may display an unsigned-app notice.
2. Open **Browse > Extensions**, find an extension, and install it. **Keiyoushi is added automatically** on first launch, including upgrades from 0.1.0. No repository URL needs to be pasted. If first launch is offline, setup retries while Bihon is open.
3. Open **Browse > Sources**, select the installed source, and add a series to your library. Open a chapter to read online, or explicitly download it for offline reading.

Pepper&Carrot's repository JVM extension passed online and offline reading tests. Modern APK conversion has limitations; prefer repository-provided JVM extensions. You can add or remove repositories in **Settings > Browse > Extension stores**. Once setup succeeds, Bihon respects removal of the default repository.

## Reader zoom

Use **Ctrl + mousewheel** or a **trackpad pinch** over the artwork to zoom from 100% to 500%. Drag the magnified page, or use ordinary wheel/two-finger scrolling to pan. At the pan boundary, scrolling continues through the chapter. The floating **minus / percentage / plus** controls offer the same zoom.

**Ctrl+0**, **Escape** while zoomed, or clicking the percentage resets to fit. At 100%, **Escape** leaves the reader using your configured exit destination. **Ctrl +/-** and the View menu also zoom artwork while reading. Outside the reader, the View menu adjusts the interface size. **F11** toggles fullscreen. Reader settings retain paged manga, right-to-left reading, and continuous webtoon modes.

Library cards show an amber warning when fetched chapter metadata contains internal whole-number gaps. This is calculated locally and updates through normal manga/global refreshes; Bihon cannot identify a chapter that an extension never reports.

## EPUB books

Open **Books** to import DRM-free `.epub` files. Bihon preserves each original and keeps a verified managed copy under `Downloads\Bihon\Books`, with cached covers and progress in application data. The reader supports reflowable and fixed-layout EPUBs, contents, in-book search, paginated or scrolling flow, typography controls, light/dark/sepia themes, and CFI resume.

**Books > Discover** includes Project Gutenberg and accepts unauthenticated legal OPDS 1.2/2.0 catalogs. Public catalogs require HTTPS. HTTP is limited to explicitly approved loopback/private-network catalogs. Bihon 0.3.0 does not support DRM bypass, storefront purchases, authenticated catalogs, or unauthorized copyrighted-book downloads.

## Storage and backups

**Settings > Downloads > Choose folder** selects your chapter location. The default is `Downloads\Bihon`. Choose an empty destination; Bihon pauses the engine, copies and verifies existing files, saves the location, and removes verified originals. Interrupted moves resume when Bihon reopens.

Library, reading progress, extensions, and settings live in `%LOCALAPPDATA%\Bihon`, separate from installed program files. Local comics and downloads are not included in library backups. Export/import library backups in **Settings > Backup**. Daily backups default to 18:00 with 14-day retention while Bihon is running. Keep original Mihon backups until their contents have been checked after import.

## Updating and sharing

Close Bihon and run the newer installer **over the existing installation**. No uninstall or repository setup is needed. Your library and downloads stay in their existing locations. Before a newer version opens an existing library, Bihon creates and verifies a snapshot of the closed database, settings, and installed extensions. Find it using **Help > Open upgrade backups**.

Share the installer together with `Bihon-0.3.0-source.zip` and the included notices. See [UPDATING.md](UPDATING.md) for checks and recovery instructions, [VERIFICATION.md](VERIFICATION.md) for tested behavior and remaining limits, and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for licenses. GitHub remains private; source-code pushes do not automatically install a new version on friends' PCs.

## Build on Windows

Install Node.js 22.13+ and a JDK 17+, then run `powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1`. This installs project-local Node 24, builds the UI, and downloads the pinned server/runtime with checksum verification. No developer tools are needed by end users.

After committing changes and the new version, run **`npm run release`**. It tests, builds the UI and Windows installer, archives the committed corresponding source, and puts checksums and instructions in `dist`. Development uses `npm start`; rebuild UI changes with `npm run build:ui`. Recompile changes to the Java wrapper with `javac --release 17 desktop/java/BihonServer.java`.

The independent source repository is private `JzHamid/Bihon-Desktop`. The original Mihon checkout/repository is preserved. Upstream versions and revisions are recorded in `UPSTREAM.json`; corresponding MPL-covered source is in `vendor/server` and `vendor/webui`.
