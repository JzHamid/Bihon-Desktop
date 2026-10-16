# Upstream review - 2026-10-16

The original Android fork, JzHamid/Bihon, was inspected read-only at 3a64c8d65cf9fe44346a5994642db440c73aa70a. It still declares app.mihon and version 0.20.4. It was not changed.

Bihon Android now prepares the full [Mihon 0.21.2 stable source](https://github.com/mihonapp/mihon/releases/tag/v0.21.2), commit 9612d955db3165e1578fdf9ff19ca9b7762c4a46. The source archive and recipe are checksum-pinned. Useful inherited fixes include broken database-upgrade recovery, reader/back-gesture crashes, old downloaded chapter detection, source-filter crashes, simultaneous WebView challenge memory pressure, and the performance/backup improvements from 0.21.0 and 0.21.1. These are included through the complete stable Android source, without transplanting Kotlin changes into Electron.

The new Android identity is app.bihon.android. Telemetry, Mihon's APK updater, its OAuth callbacks and project-specific OAuth registrations are disabled. Native EPUB/OPDS and automatic desktop synchronization are outside this version's capabilities. See [Android details](android.md).

Desktop remains pinned to Suwayomi Server 2.3.2243 and its corresponding WebUI revision plus Bihon's changes. The current [Suwayomi Server 2.4.2366](https://github.com/Suwayomi/Suwayomi-Server/releases/tag/v2.4.2366) and [WebUI v20260929.01](https://github.com/Suwayomi/Suwayomi-WebUI/releases/tag/v20260929.01) were checked. Their engine/database/SyncYomi changes need a separate existing-library migration and UI integration review. This platform release preserves the existing engine so Linux packaging does not also change stored data semantics. No claim is made that desktop contains all current Mihon or Suwayomi changes.
