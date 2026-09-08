# Verification: Bihon 0.3.0

Built on Windows 11, 2026-09-08.

- Root unit tests passed for EPUB import and duplicate detection, managed-copy deletion, metadata sanitization, progress bounds, invalid archive cleanup, OPDS URL/network policy, redirect revalidation, response limits, OPDS 1.2/2.0 transport, chapter-gap edge cases, download migration, repository setup, and upgrade snapshots.
- WebUI TypeScript checks and the production build passed with the pinned, locally patched Foliate JS revision.
- A live Project Gutenberg smoke test loaded its official OPDS 1.2 feed and acquired a real public-domain EPUB through Bihon's guarded catalog service. The downloaded fixture and all other test data remain ignored local files.
- Generated branding was inspected at the original, sidebar, startup/splash, favicon, PWA, PNG, and multi-resolution ICO sizes.
- The automated Electron Books smoke test could not run in this restricted session because Electron's GPU subprocess failed before a window was available. The failing harness and temporary debugging switch were removed; no claim is made here for a packaged-app reader launch, native picker interaction, or installer launch.
- The clean-commit release pipeline produced the unsigned Windows x64 installer, corresponding source archive, and SHA-256 checksum file. The Windows executable and installer use Bihon's generated multi-resolution icon; code signing remains disabled.

## Historical 0.2.0 evidence

# Verification: Bihon 0.2.0

Built on Windows 11, 2026-09-07.

- All 17 unit tests passed, including default-repository retry/idempotency and upgrade snapshot/recovery checks.
- Production WebUI build and TypeScript checks passed after the final extension-cache correction.
- Development executable integration checks passed for legacy library/progress preservation, verified upgrade snapshots, repository removal persistence, Ctrl+wheel artwork zoom, synthetic trackpad pinch, drag panning, reset, menu zoom, and webtoon zoom.
- Fresh offline startup displayed the automatic repository setup message. Reconnection registered the repository, but exposed an upstream cached empty extension list. The final build explicitly clears that cache before refreshing.
- Further integration testing was stopped at the user's request. The final reconnection correction and final 0.2.0 installer have not been retested. A packaged upgrade attempt stopped before automatic repository retry completed; the development upgrade checks passed.
- Updates are manual: close Bihon and run the newer installer over the existing installation. The application snapshots existing library data before starting a newer version; chapter downloads remain separate.

The following is historical 0.1.0 evidence, not a new test run of 0.2.0.
# Verification: Bihon 0.1.0

Verified on Windows 11 (build 26200), 2026-09-07. This is an unsigned first personal release, not a claim of complete Mihon compatibility.

## Passed

- Production WebUI build and TypeScript check using the pinned upstream revision.
- All 10 download-migration tests: spaces/Unicode, low space, nonempty and nested destinations, interrupted copy and commit recovery, destination corruption, denied writes, and junction rejection. Low-space and access-denied cases use injected filesystem failures.
- Windows x64 NSIS installer built; silent installation into an isolated E: directory returned exit code 0.
- Installed executable launched its bundled Java/server/UI. No external Java or Node is used by the application.
- Desktop library/sidebar, download-folder controls, and backup screen rendered without renderer exceptions. Browser snapshot and download-settings screenshot inspected.
- Complete folder IPC workflow paused/stopped the engine, copied and verified a fixture, saved the new directory, restarted the engine, and reloaded the UI. The test supplies a selected path by replacing Electron's dialog result; it does not automate clicking through Windows Explorer.
- Fullscreen API and F11 menu accelerator binding. Synthetic Playwright keyboard input does not itself exercise Windows menu accelerators.
- Real Pepper&Carrot 1.4.6 repository extension: installation, source browsing, chapter listing, online image retrieval, download of a 14-page chapter, and progress/download persistence after restart.
- Installed reader served all 14 downloaded pages after clearing its temporary page cache and routing engine outbound connections to an unavailable SOCKS proxy. Single-page, webtoon, and RTL settings rendered successfully. The laptop's system networking was not disabled.
- Local comic library membership, categories, and page progress survived restart. Protobuf backup validation/export/import succeeded and restored a removed library entry.
- Private independent GitHub repository JzHamid/Bihon-Desktop verified before publishing. Personal data, test chapters, installed extensions, dependencies, and binaries are ignored by Git.

## Compatibility limits and remaining manual checks

- xkcd 1.4.17: repository JVM-extension install, browsing, and an online image worked. Full download failed on missing Android Html.fromHtml(String, int); manual APK conversion failed with a Java VerifyError.
- Pepper&Carrot 1.4.6 manual APK import also failed bytecode verification; use its repository-provided JVM extension, which passed the reading/download tests. The inherited APK picker is available but compatibility with modern APKs is limited.
- Digital Comic Museum installed but browsing encountered a Cloudflare challenge with bypass disabled. No universal extension/site compatibility is promised.
- No backup exported by a real Mihon phone installation was supplied. The shared protobuf format was tested with Suwayomi-generated backups; unsupported-source warnings were returned and preserved. Keep original Mihon backups until their contents have been checked after import.
- Daily scheduled backups are configured through Suwayomi, but a full scheduled-day/retention cycle was not observed in this session. Bihon must be running at the scheduled time.
- Native dialog interaction, physical network disconnection, long-term usage, and installation on a separate clean friend's PC remain useful manual acceptance checks.

## Repeating checks

Use the project-local Node executable (`node_modules/node/bin/node.exe`) to run scripts/verify-engine.cjs, scripts/verify-library.cjs, scripts/verify-desktop.cjs, and scripts/verify-reader.cjs. Set BIHON_EXECUTABLE to an installed Bihon.exe to test the shipped application. Integration scripts use .test-data and need the pinned runtime/UI and their preceding fixtures. verify-offline.cjs uses the downloaded Pepper&Carrot fixture; it temporarily changes only the isolated test engine's proxy configuration and restores it afterward. verify-apk.cjs checks one real APK and intentionally fails if the engine rejects it.

Artifacts and test data stay local and are not included in source archives.
