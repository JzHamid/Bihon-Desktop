# Bihon third-party notices

Bihon is an independent desktop adaptation of Suwayomi WebUI, powered by an unmodified Suwayomi Server. It is not an official Mihon or Suwayomi release.

- Suwayomi WebUI: v20260726.01, Mozilla Public License 2.0. Copyright Contributors to the Suwayomi project. Full modified source in vendor/webui.
- Suwayomi Server: v2.3.2243, revision 1d583ca4a718646e17a4c62d23fe8e5edccaf774, Mozilla Public License 2.0. Copyright Contributors to the Suwayomi project. Full corresponding source in vendor/server.
- Electron: MIT license; Chromium and other notices ship in the installed application directory.
- Foliate JS: revision 78914aef4466eb960965702401634c2cb348e9b1, MIT License, Copyright 2022 John Factotum. The dependency and its required vendored zip modules are pinned in the WebUI lockfile. Bihon applies the recorded patch in `vendor/webui/patches` to disable publication scripts. The full license is in `licenses/Foliate-JS-MIT.txt`.
- Bundled Java runtime: license and third-party notices are retained in runtime/jre/legal and runtime/jre. It is the runtime from the official Suwayomi Windows distribution.
- Extension WebView: JetBrains Runtime jbr_jcef-25.0.3-windows-x64-b508.4. Notices are retained in runtime/kcef/legal. Corresponding OpenJDK/JBR source: https://github.com/JetBrains/JetBrainsRuntime/tree/jbr-release-25.0.3b508.4. Distributed under GPLv2 with the Classpath Exception and component licenses; see the included notices.

Changes: Bihon branding, native desktop folder selection, verified download migration, Windows process ownership, EPUB/OPDS support, packaging, tests, and documentation. Existing source headers and licenses are retained. Bihon additions are MPL-2.0.

Distribute Bihon-0.3.1-source.zip alongside Bihon Setup 0.3.1.exe. The source archive includes the corresponding modified MPL-covered source and build instructions. Recipients may exercise the rights granted by those licenses. Your private GitHub repository does not need to be public.

Bihon 0.3.1 additions: session-only EPUB focus mode with Escape restoration and focus-aware in-book search. The default Keiyoushi repository URL and Project Gutenberg OPDS catalog are registered automatically; third-party extension binaries and book/comic content are not bundled.
