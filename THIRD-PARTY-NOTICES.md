# Bihon third-party notices

Bihon desktop is an independent adaptation of Suwayomi WebUI, powered by an unmodified Suwayomi Server. The separate native Android application adapts Mihon. These are independent Bihon builds.

- Suwayomi WebUI: v20260726.01, Mozilla Public License 2.0. Copyright Contributors to the Suwayomi project. Full modified source in vendor/webui.
- Suwayomi Server: v2.3.2243, revision 1d583ca4a718646e17a4c62d23fe8e5edccaf774, Mozilla Public License 2.0. Copyright Contributors to the Suwayomi project. Full corresponding source in vendor/server.
- Electron: MIT license; Chromium and other notices ship in the installed application directory.
- Foliate JS: revision 78914aef4466eb960965702401634c2cb348e9b1, MIT License, Copyright 2022 John Factotum. The dependency and its required vendored zip modules are pinned in the WebUI lockfile. Bihon applies the recorded patch in `vendor/webui/patches` to disable publication scripts. The full license is in `licenses/Foliate-JS-MIT.txt`.
- Bundled Java runtime: license and third-party notices are retained in runtime/jre/legal and runtime/jre. It is the runtime from the official Suwayomi distribution for the target OS.
- Extension WebView: JetBrains Runtime jbr_jcef-25.0.3-b508.4, Windows x64 or Linux x64. Exact download pins are in UPSTREAM.json. Notices are retained in runtime/kcef/legal. Corresponding OpenJDK/JBR source: https://github.com/JetBrains/JetBrainsRuntime/tree/jbr-release-25.0.3b508.4. Distributed under GPLv2 with the Classpath Exception and component licenses; see the included notices.
- Native Android: Mihon 0.21.2, revision 9612d955db3165e1578fdf9ff19ca9b7762c4a46, Apache License 2.0. Copyright 2015 Javier Tomás and 2024 Mihon Open Source Project. Pin and patch instructions are in android/upstream.json and scripts/android-prepare.cjs. The Android source archive includes the full prepared source and its LICENSE/NOTICE files; the Apache license is also in licenses/Mihon-Apache-2.0.txt.

Changes: Bihon branding, native desktop folder selection, verified download migration, process ownership, EPUB/OPDS support, packaging, tests, and documentation. Existing source headers and licenses are retained. Bihon desktop additions are MPL-2.0; the native Android adaptation retains Apache-2.0.

Distribute Bihon-0.4.0-source.zip alongside the Windows/Linux installers and Bihon-Android-0.4.0-source.tar.gz alongside the Android APK. The desktop archive includes the corresponding modified MPL-covered source and build instructions. Recipients may exercise the rights granted by those licenses.

Bihon 0.3.0 additions: refreshed branding, Escape reader exit, cached chapter-gap badges, local EPUB books, the hardened Foliate reader, and legal OPDS discovery. The default Keiyoushi repository URL and Project Gutenberg OPDS catalog are registered automatically; third-party extension binaries and book/comic content are not bundled.
