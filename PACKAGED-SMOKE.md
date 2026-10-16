# Packaged desktop smoke test

Run `node scripts/verify-packaged.cjs` after installing root dependencies and building the complete desktop package. Set `BIHON_EXECUTABLE` to the actual packaged executable. This test does not use a development Electron binary or your installed library.

Windows PowerShell:

```powershell
$env:BIHON_EXECUTABLE = (Resolve-Path 'dist/win-unpacked/Bihon.exe').Path
node scripts/verify-packaged.cjs
```

Linux, after extracting the built AppImage:

```sh
BIHON_EXECUTABLE="$PWD/squashfs-root/bihon" xvfb-run -a node scripts/verify-packaged.cjs
```

Linux needs an X display (or Xvfb) and Electron's system libraries, including GTK 3, NSS, GBM, and ALSA. Ubuntu 24.04 CI installs `xvfb libgtk-3-0 libnss3 libgbm1 libasound2t64`. Use `BIHON_SMOKE_NO_SANDBOX=1` only on an isolated Linux CI runner if its namespace policy prevents Electron's sandbox from starting.

The script generates a valid three-chapter EPUB and a two-page local comic. It checks the shipped Java engine, WebUI mount, native CEF WebView initialization and rendering of a local HTML page, native import IPC, EPUB metadata and page navigation, contents, reader appearance, progress, local comic rendering, backup export/validation/restore, persistence after restarting, and graceful Java shutdown. The WebView check uses the engine's actual WebSocket API, verifies a successful load and PNG pixels, and fails on native initialization errors in the server log. Native file selection is supplied by replacing Electron's dialog result; clicking through the operating system's file picker remains a manual check.

Three launches cover fresh state, a synthetic upgrade, and an ordinary restart. After the populated first run closes cleanly, the test changes only its own profile's last-successful-version marker to `0.3.0`. The next launch must create a verified upgrade snapshot whose database, desktop settings, server configuration, repository marker, and EPUB-index hashes match the closed originals. The comic library and progress, managed EPUB and reading location, and an existing exported backup must remain usable. The third launch must preserve that state and create no duplicate snapshot. This exercises the packaged upgrade path against the unchanged pinned Suwayomi engine; it does not claim to have installed or run the actual Bihon 0.3.0 installer. `upgrade-snapshot.json` records the synthetic fixture and hash evidence.

Application data, downloads, and original fixtures live in a newly created temporary directory owned by the test. The default repository marker is preconfigured to keep these checks independent of public extension services; extension setup has separate unit tests. The script removes its fixtures and checks that its Java child exits. Logs, screenshots, and a JSON verdict are saved under `artifacts/packaged-win32` or `artifacts/packaged-linux`, including on failures. No installed app data, personal library, external extension, or downloaded book is used. Android has a separate native build and emulator test.
