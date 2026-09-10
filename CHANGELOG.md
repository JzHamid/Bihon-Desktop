# Changelog

## 0.3.1

- Add a session-only focus mode to the EPUB reader that hides its toolbar and progress controls, expands the reading area, and restores controls with Escape.
- Open in-book search from focus mode with Ctrl+F while preserving the reader's existing panel and exit behavior.

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
