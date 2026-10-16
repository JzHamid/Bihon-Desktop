# Changelog

## 0.4.0 (release candidate)

- Add Linux x64 AppImage and Debian packages with a bundled JVM and extension WebView, verified platform downloads, Linux data paths, native process startup/shutdown, and case-sensitive folder migration.
- Preserve the Windows installation identity, library/download locations, verified upgrade snapshots, EPUB reader, and manual-update flow.
- Add a native Android 8+ Bihon app built from pinned Mihon 0.21.2 source. It includes upstream reader, download, database migration, back-gesture, and Cloudflare memory fixes. It installs separately from Mihon and the existing Android fork.
- Automatically configure the native Keiyoushi extension store once on Android, including offline first launches, with its published signing identity. Preserve existing stores, avoid duplicates, retry database setup failures and respect later removal.
- Disable upstream telemetry, Mihon's APK updater, and shared third-party OAuth registrations in the independent Android app. Self-hosted trackers and MangaUpdates remain available. Desktop EPUB/OPDS features and automatic cross-device sync are not included on Android.
- Add Windows/Linux packaged-app functional checks, Android unit/database migration checks and API 26/35 emulator startup checks, corresponding source artifacts, and release checksums. See VERIFICATION.md for actual execution results; configured checks alone are not a passing test report.

## 0.3.0

- Refresh Bihon branding across the Windows executable/installer, taskbar, startup page, WebUI icons, splash, sidebar, and About screen.
- Reserve Escape in the manga reader: reset active panel zoom first, then exit through the configured reader destination.
- Show cached numeric chapter gaps directly on library grid and list cards without refreshing extensions when Library opens.
- Add a separate Books shelf for owned DRM-free EPUB imports, cover metadata, reading progress, search/sort, safe managed deletion, and download-folder migration.
- Add a hardened Foliate JS EPUB reader with contents, search, page/scroll modes, typography controls, themes, navigation, and CFI resume.
- Add legal OPDS 1.2/2.0 discovery with Project Gutenberg built in, catalog management, pagination/search/acquisition, redirect/network checks, timeouts, and limits.
- Replace desktop About with Bihon and bundled-component information; remove upstream update/community controls in desktop mode.

## 0.2.0

- Automatically add the Keiyoushi extension repository once; retry offline setup without blocking later launches, avoid duplicates, and respect a user's later removal.
- Add pointer-centered manga zoom (100-500%) for Ctrl+wheel, trackpad pinch, keyboard/menu controls, and a visible zoom toolbar. Magnified pages support drag/scroll panning and fit reset.
- Preserve the installer/data identity and create a verified pre-upgrade library/settings/extension snapshot before opening a newer version. Add update guidance and an upgrade-backup shortcut to Help.
- Add a version-aware release command that builds the installer, corresponding source, instructions, and checksums.

## 0.1.0

Initial Windows desktop reader, bundled Suwayomi/Java/WebUI, native verified download-folder migration, local backups, and desktop branding.
