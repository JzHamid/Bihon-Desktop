# Bihon

A local Windows manga and webtoon reader, powered by Suwayomi. No hosted services, subscriptions, or Android emulator. Each person runs their own installation.

## Install and read

Run **Bihon Setup 0.1.0.exe**, then open the Bihon desktop shortcut. Java and the reader engine are bundled. Windows may show an unsigned-app notice because this personal build has no paid code-signing certificate.

1. Open **Browse → Extensions** and add your extension repository in the repository settings. Bihon ships without third-party repositories. Install your chosen compatible extensions, or import an extension APK.
2. Browse a source, find a series, and add it to your library. Opening a chapter reads online; downloading it explicitly saves it for offline reading. Temporary image caches may still be used during online reading.
3. In **Settings → Downloads**, choose your download folder. The default is `Downloads\Bihon`. Select an empty destination. Bihon pauses the engine, copies and verifies files, updates the location, and removes verified originals. Interrupted moves resume when Bihon next opens. Do not edit the folders during a move.
4. Use the reader settings for paged manga, right-to-left reading, webtoon scrolling, fit/width, and keyboard shortcuts. F11 toggles fullscreen; Ctrl +/- adjusts UI zoom. Library display controls adjust grid density.
5. Use **Settings → Backup** to export/import library backups and configure automatic backups. Daily backups default to 18:00 with 14-day retention while the app is running. Chapter files are separate and are not included in library backups. Mihon imports use Suwayomi's importer; inspect its reported warnings for unsupported data and keep your original backup.

Closing Bihon stops its local engine. Library and settings live in `%LOCALAPPDATA%\Bihon`; reinstalling or updating the app preserves these files. The Bihon menu opens downloads, backups, and application data. Updates are manual. Trackers, phone sync, and network sharing are not configured by this release.

## Tested compatibility

Pepper & Carrot passed installation, online reading, chapter downloads, and offline reading. Extensions vary: xkcd 1.4.17 hit Android compatibility errors during full downloads and APK import. Pepper & Carrot APK conversion also failed; its repository JVM version worked. Prefer a repository that supplies Suwayomi-compatible JVM extensions. See [VERIFICATION.md](VERIFICATION.md) for test evidence and remaining manual checks, including real-phone Mihon backup validation.

## Build on Windows

Install Node.js 22.13+ and a JDK 17+. From this directory run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1
npm test
npm run dist
npm run source
```

The bootstrap downloads the pinned Suwayomi Windows bundle and verifies SHA-256. It installs a project-local Node 24 for the UI build. Runtime bundles, dependencies, tests' data, and installers are ignored by Git. Versions and upstream commits are recorded in `UPSTREAM.json`. `vendor/webui` contains Bihon's modified UI; `vendor/server` contains corresponding unmodified server source. Upstream build instructions remain in those directories.

For development, `npm start` runs the compiled UI. After editing the UI, run `npm run build:ui`. After changing the Java parent-process wrapper, run `javac --release 17 desktop/java/BihonServer.java`. No JDK or Node installation is needed by end users.

## Sharing and privacy

Share the installer **and** `Bihon-0.1.0-source.zip`, which supplies corresponding MPL-covered source and licenses. See `THIRD-PARTY-NOTICES.md`. GitHub source hosting can remain private; recipients retain their license rights. Downloaded chapters, extension installations, personal libraries, credentials, and backups are never part of the source repository or build.

The intended remote is the independent private `JzHamid/Bihon-Desktop`. The original Mihon checkout and `JzHamid/Bihon` repository are preserved.
