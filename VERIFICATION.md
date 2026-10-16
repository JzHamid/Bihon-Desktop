# Verification: Bihon 0.4.0 candidate

Verified on 2026-10-16. All five jobs passed in [Actions run 38848161461](https://github.com/JzHamid/Bihon-Desktop/actions/runs/38848161461), application/test source `fb150dc7ed3aa2d7150798aa4e5ad1ac60b562f3`, including automatic Android extension-store setup. This report is a subsequent documentation-only update; it does not change the tested application.

## Executed checks

| Check | Result and evidence |
| --- | --- |
| Windows x64 build, UI checks, Node tests, installer and packaged application | Passed: [job 116803259359](https://github.com/JzHamid/Bihon-Desktop/actions/runs/38848161461/job/116803259359) |
| Linux x64 build, UI checks, Node tests, installed Debian package and AppImage | Passed: [job 116803258852](https://github.com/JzHamid/Bihon-Desktop/actions/runs/38848161461/job/116803258852) |
| Native Android build, unit tests, SQLDelight migrations, APK identity/signature and complete source | Passed: [job 116803259178](https://github.com/JzHamid/Bihon-Desktop/actions/runs/38848161461/job/116803259178) |
| Android 8 / API 26 installation, onboarding, persisted store and restart/crash checks | Passed: [job 116805466085](https://github.com/JzHamid/Bihon-Desktop/actions/runs/38848161461/job/116805466085) |
| Android 15 / API 35 installation, onboarding, persisted store and restart/crash checks | Passed: [job 116805466090](https://github.com/JzHamid/Bihon-Desktop/actions/runs/38848161461/job/116805466090) |

The final Node suite has **59 tests: 58 passed, one OS-specific skip, zero failures** on each desktop OS. Windows skips the Linux case-distinct folder test; Linux skips the real Windows SDK batch invocation. The unchanged baseline passed all 28 original tests before implementation. Local `npm run check` also passed syntax, lint, tests and TypeScript checks. UI lint reports 47 warnings and zero errors. Production WebUI builds passed on both native runners.

Coverage includes EPUB managed-copy/deletion safety, OPDS network policy, interrupted folder moves, repository setup, upgrade snapshots, platform paths and Java arguments, native WebView preparation, missing-JVM cleanup, Android source/signing/SDK gates, cross-platform Kotlin recipe integrity, persisted Android-store evidence, large log streaming, source archives and release checksums.

## Packaged desktop behavior

Windows, installed Debian and extracted AppImage each passed the same **10 functional checks**, with no renderer exceptions and no surviving bundled Java process:

1. Fresh library opens using bundled Java, server and production UI in isolated storage.
2. Native CEF WebView loads a local HTML page and renders PNG pixels.
3. Native import IPC imports a generated EPUB, verifies its managed copy and detects duplicates.
4. EPUB text, button/keyboard navigation, contents, appearance and saved CFI progress work.
5. A generated comic renders with exact page bytes, library/progress, and usable backup export/validation/restore.
6. Closing the app shuts down its Java process gracefully.
7. A synthetic 0.3.0 upgrade creates a hash-verified snapshot of the closed library.
8. The upgrade preserves comic pages/progress, EPUB files/progress and an existing valid backup.
9. An ordinary subsequent restart preserves state without a duplicate upgrade snapshot.
10. All launches finish without renderer exceptions or orphaned Java processes.

Each upgrade manifest verifies **eight files**, including the original database, settings, server configuration, repository marker and EPUB index. The fixture changes the last-successful version marker to 0.3.0 after clean shutdown; its database uses the unchanged pinned Suwayomi engine. This tests the packaged upgrade path, rather than the actual old installer or a private user's library.

Debian testing installs the actual package and uses the normal Chromium sandbox. AppImage testing extracts the shipped artifact, verifies native library resolution and runs the extracted executable using the explicitly gated sandbox override for an isolated CI runner. Distributed launchers do not disable sandboxing. Windows testing runs the packaged executable produced with the NSIS installer; interactive installer and native picker clicks remain manual.

Results, snapshot manifests, reader screenshots and logs are attached to the run as `desktop-evidence-Windows` and `desktop-evidence-Linux`. Screenshots were visually inspected. Generated local fixtures establish local-content behavior; no private library, personal books, downloaded artwork or physical network-disconnection test was used.

## Native Android

The final build passed **136 tests in ten suites, with zero failures, errors or skips**: the original 118 upstream tests plus BihonDefaultExtensionStore 15 and BihonDefaultExtensionStoreSetup 3. The upstream suites are DownloadProvider 16, Migrator 6, TallImageSplitCalculator 3, ChapterRecognition 47, GetApplicationRelease 3, LibraryFlags 5, MissingChapters 6 and FetchInterval 32. Both new suites executed in this run. `verifyDebugDatabaseMigration` and `verifyReleaseDatabaseMigration` passed from the Gradle cache; aggregate `verifySqlDelightMigration` was up-to-date.

The universal APK includes ARMv7, ARM64, x86 and x86_64. Collection verifies `app.bihon.android`, version 0.4.0, versionCode 40000, minimum API 26, cryptographic APK validity and its signing certificate. The final test APK SHA-256 is `9982fe1d5f63f43ccae28ce2874b2d2f109dcbda8fe5d307902ad2d637a2309c`.

Both fresh emulators installed that APK, rendered onboarding and retained the same foreground process after the settling interval. API 26 retained PID 4470, then 4708 after a cold restart; API 35 retained PID 2477, then 3769 after a cold restart. Both launches passed Bihon-specific Java/native crash and ANR checks. Their onboarding screenshots were visually inspected; UI dumps and complete diagnostic logs are attached as `android-smoke-api-26` and `android-smoke-api-35`.

On both emulators, the stopped app's real SQLite database contained exactly one native Keiyoushi store at `https://github.com/keiyoushi/extensions/raw/repo/index.pb`, with published signing identity `9add655a78e96c4ec7a53ef89dccb557cb5d767489fac5e785d671a5a75d4da2`; preferences contained the completed one-time setup marker. A second inspection after restart found the identical store without duplicates. Public evidence is in `default-store-first-launch.json` and `default-store-restart.json`. Only rooted disposable emulators are inspected; the APK exposes no debug database interface.

Native tests also cover registration without network access, adopting existing stores without overwriting trust, database/preference failures, retry and catalog timeout, cancellation, simultaneous startup, and explicit removal racing setup. Registration uses locally pinned metadata and normal native extension loading; APK installation and signature verification retain the upstream flow. Emulator checks establish startup and persisted configuration, not all reader, third-party extension, tracker or physical-device behavior.

Android adapts the complete pinned [Mihon 0.21.2 source](https://github.com/mihonapp/mihon/releases/tag/v0.21.2). Desktop retains Suwayomi Server 2.3.2243 and WebUI v20260726.01; Kotlin changes were not transplanted into Electron. See [upstream review](docs/upstream-review.md).

## Release provenance and signing

The draft's Windows and Linux binaries are the exact packages from source `24959099e9a23453eba8ae03d34f3ce93c4f6297`, [run 38841432082](https://github.com/JzHamid/Bihon-Desktop/actions/runs/38841432082). Its Windows job and both Linux package checks passed all ten checks, eight snapshot files and zero renderer errors. Subsequent changes add Android setup, tests, CI diagnostics and documentation; desktop application inputs are unchanged. The final full matrix above independently passed again.

The Android APK, public validation receipt and complete native source archive come from final run 38848161461, so the distributed test APK is exactly the emulator-tested file. The native source contains all four new Apache-2.0 Kotlin implementation/test files and the updated Bihon notice. Its SHA-256 is `40dadf47b3ab387f8f5ecb8c0c55f2a39c8e131c5d233d9cd426dd4d9a683aa5`. The desktop source archive is re-exported from the committed source after adding this report. It includes the Android recipe/templates, CI/harness fixes and this documentation; desktop application inputs match the tested packages.

Pair desktop binaries with `Bihon-0.4.0-source.zip` and its MPL-2.0 notices. Pair the APK with `Bihon-Android-0.4.0-source.tar.gz`, which contains the entire patched Mihon source, Gradle wrapper, Apache-2.0 license, notices and build provenance. Bundled Java/JetBrains and Electron/Chromium notices remain in the shipped applications. `SHA256SUMS-0.4.0.txt` covers every final binary and corresponding-source archive. Generated caches, private data and signing material are excluded from source.

The `-test.apk` uses disposable Android Debug signing and is a validation artifact, not a supported production update channel. No persistent production key was created or uploaded. Production signing needs explicit owner authorization, a backed-up permanent key, a public fingerprint and a protected `android-release` environment restricted to main. Its manual workflow requires successful platform validation for that exact main commit. Routine PR builds receive no production signing credentials. Windows installers remain unsigned.

## Acceptance boundaries

Physical phones/tablets and Linux desktops, FUSE/Xwayland/user-namespace differences, real Mihon backup transfers, authenticated trackers, representative third-party extensions, long reading sessions, full scheduled-backup retention, interactive native pickers and a real installed Windows 0.3.0 library/installer upgrade need separate acceptance evidence. Keep original apps and backups until transferred data is checked.

Android has no desktop EPUB/OPDS shelf or automatic phone/PC synchronization. Trackers depending on Mihon's project-specific OAuth registrations are unavailable; Komga, Kavita, Suwayomi and MangaUpdates remain available. See [Android details](docs/android.md).

The original Android fork and existing user libraries/downloads were preserved. The owner retains the final merge decision under AGENTS.md. Earlier Windows release evidence remains in Git history at 48ebcaa.
