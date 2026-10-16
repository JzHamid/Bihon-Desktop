# Verification: Bihon 0.4.0 candidate

Prepared on 2026-10-16. Results below distinguish local checks from runner/device checks.

- Baseline: the unchanged Windows source passed all 28 Node tests on Node 24.18.0.
- Current local tests, UI lint/types/build, and actual platform build results will be recorded after execution. The new workflow alone is not evidence that a platform works.
- Windows/Linux packaged smoke uses generated local comics and EPUBs in isolated temporary storage. It checks the bundled engine/UI, native import IPC, EPUB reader and saved progress, comic page bytes and progress, library backup export/validation/restore, persistence after restart, and Java shutdown.
- Android uses the complete pinned Mihon 0.21.2 source with a separate identity. CI runs upstream unit and database migration tests and installs/launches the APK on API 26 and 35 emulators. Emulator startup does not prove all extension, backup-import, long-reading, or physical-phone behavior.
- A persistent Android release signing identity requires owner authorization. Test-signed APKs are validation artifacts; a production APK must pass the public certificate fingerprint gate.
- The original Android fork and existing user data are preserved. No private library, downloads, credentials, or signing key are included in corresponding source.

## Remaining acceptance boundaries

Physical phone/tablet acceptance, real Mihon backup imports, representative third-party extensions, fresh Linux desktop installation, Xwayland differences, full scheduled backup retention, and a real existing 0.3.0 Windows library upgrade need separate evidence. Desktop EPUB/OPDS features are not part of the native Android app. No automatic cross-device synchronization is implemented.

## Historical evidence

The previous Windows releases were validated as described in the original 0.3.0 verification document in Git history (commit 48ebcaa). Those historical checks are not new Linux or Android test results.
