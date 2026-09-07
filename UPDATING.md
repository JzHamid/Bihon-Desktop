# Updating Bihon

## For friends

1. Finish reading and close Bihon normally.
2. Run the new **Bihon Setup** installer over the existing installation, then reopen Bihon.

The installer identity and data location remain stable across versions. Chapter downloads remain in your selected folder. Repository setup is remembered, including a decision to remove the default repository. No GitHub account is needed to install a file shared with you.

Before the new app starts its engine, it copies and SHA-256 verifies the existing database, desktop/server settings, extension preferences, and installed extensions into `%LOCALAPPDATA%\Bihon\backups\bihon-upgrades`. It records the running version only after the engine is ready. Interrupted snapshots retry before startup; insufficient space or verification failures stop the upgrade from opening the library. Ordinary restarts do not create another snapshot for the same version.

These snapshots exclude chapter files, local comics, caches, runtime binaries, and the web interface. They do not replace regular library backups or a separate backup of chapter files. Snapshots are retained until you delete them after checking the update.

## Recovering after an unsuccessful update

Use **Help > Open upgrade backups** to locate the snapshot from immediately before the update. Each snapshot includes a manifest with versions and hashes.

Close Bihon before restoring files. Preserve a copy of the current application-data folder first, then copy the snapshot's database/settings/extension files back into the same relative locations under `%LOCALAPPDATA%\Bihon`. Do not copy `manifest.json` there. Keep your chapter directories intact. If returning to the old application version, also restore the matching previous version state (or remove `upgrade-state.json` after preserving it) before launching that version. Do not point an older server at a newer database without restoring a matching backup.

For normal library recovery, the portable export/import workflow in **Settings > Backup** is simpler; chapter downloads are separate.

## For the maintainer

The repository remains private. Pushing code there does not distribute binaries to friends. There is no GitHub token or private-repository credential inside the app.

For a release:

1. Make the changes, update `package.json` and `package-lock.json` together (for example `npm version patch --no-git-tag-version`), and update the changelog/instructions.
2. Commit the release source, then run `npm run release` from the project folder.
3. Push the source to the private repository. Share the new installer, corresponding source archive, notices, instructions, and checksum file from `dist` through your usual file-sharing method.

Keep `build.appId`, product name, and the application-data directory stable. Retain the pinned engine until a compatible engine/UI upgrade has passed a real old-library migration test. A future automatic updater would need a release-download location accessible to friends; manual installer updates work without accounts or hosting.
