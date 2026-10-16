# Updating Bihon

## Windows and Linux

Close Bihon normally. On Windows, run the newer Bihon Setup installer over the existing installation. On Linux, install the newer `.deb` or replace the AppImage. Avoid switching installation methods while the app is running. Windows retains `app.bihon.desktop` and `%LOCALAPPDATA%\Bihon`; Linux uses `$XDG_DATA_HOME/Bihon` (default `~/.local/share/Bihon`). Downloads remain in the selected folder.

Before opening an existing desktop library with a newer version, Bihon copies and SHA-256 verifies the database, desktop/server settings, extension preferences, installed extensions, and EPUB index/covers/progress/catalog settings into `backups/bihon-upgrades` under application data. It records the version only after the engine is ready. Interrupted snapshots retry; insufficient space or verification failures stop the upgrade. Ordinary restarts do not duplicate the snapshot. Repository setup, including removal of the default store, is remembered.

Snapshots exclude chapter files, managed EPUB files, local comics, caches, runtime binaries, and the UI. Keep regular library backups and separate copies of downloaded content.

To recover, locate the pre-update snapshot with **Help > Open upgrade backups**. Close Bihon and preserve the current data folder before copying the snapshot's files back into matching relative paths. Do not copy `manifest.json`. If returning to an older app, restore its matching version state as well. Never open a newer server database with an older server without restoring a matching backup. **Settings > Backup** is simpler for normal library recovery.

## Android

Bihon Android has the independent package ID `app.bihon.android`. It does not replace Mihon or the existing Android fork. Transfer a library using an exported backup and verify the restored entries; downloads and EPUBs are separate. There is no automatic cross-device sync.

Install new production APKs over the existing Bihon Android app. Every production APK must use the same signing key and an increasing versionCode. Keep the original signing key and passwords backed up privately; replacing them prevents in-place updates. A `-test.apk` is a CI test artifact, uses disposable Android Debug signing, and is not a production update channel. No persistent release key was created without owner authorization.

## Maintainer releases

1. Start from clean current `main`, create a topic branch, and update package/lock versions and release notes together.
2. Commit source, run the platform checks/builds, push only the topic branch, and open a PR. The owner makes the merge decision.
3. Require green Windows/Linux packaged tests and Android build/migration/unit/emulator checks for the exact source commit.
4. Publish binaries with `Bihon-<version>-source.zip`, `Bihon-Android-<version>-source.tar.gz`, notices, verification evidence, and SHA-256 checksums. Draft candidates must state their remaining limits.

`npm run release` builds the desktop release on its target OS from committed source. Android build/signing steps are in [docs/android.md](docs/android.md). Production signing requires explicit authorization to create or upload a persistent key; the public certificate fingerprint is checked before APK collection. Credentials and key files must remain ignored and only enter protected CI environment variables. `.env.example` documents names without values. Desktop updates remain manual; no private-repository token is included in either app.

Retain the pinned desktop engine until a compatible engine/UI upgrade passes a real old-library migration test. Native Mihon changes are integrated through the Android source pin, never applied blindly to the unrelated desktop code.
