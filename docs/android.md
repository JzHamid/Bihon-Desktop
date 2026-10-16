# Bihon for Android

Bihon Android is the native Android reader based on [Mihon v0.21.2](https://github.com/mihonapp/mihon/releases/tag/v0.21.2). Android 8.0 (API 26) or later is required. It has its own application ID, `app.bihon.android`, and storage. Installing it does not replace Mihon or the older Bihon fork.

The native reader supports manga, webtoons, local comic archives, extensions, downloads, backups and self-hosted tracking. The desktop EPUB reader and desktop data folder are separate; this Android build does not add native EPUB support or automatic desktop synchronization.

To move an existing Android library, create a `.tachibk` backup in the old app first, then restore it through Bihon's backup settings. Keep the original backup and app until you have checked your library and reading progress. Existing download folders must be selected explicitly through Android's storage picker.

## Upstream improvements

The pinned stable release includes the v0.21 database migration repairs for duplicate history/tracking entries and damaged indexes, reader/back gesture crash fixes, better discovery of older downloaded chapters, and reduced memory pressure during simultaneous Cloudflare challenges. It also includes extension signature verification, faster large libraries, parallel reader loading and backup restoration improvements introduced in v0.21.0 and v0.21.1. These changes apply to the native Android reader; the Electron desktop reader has its own Suwayomi source base.

Mihon's project-specific OAuth registrations are not reused. AniList, Bangumi, Comick, Hikka, Kitsu, MangaBaka, MyAnimeList and Shikimori are unavailable in this build until Bihon has its own registrations and tested callback flows. Komga, Kavita, Suwayomi and MangaUpdates remain available. No service credentials are needed to compile the app.

## Build

Install Node.js 24, JDK 21, Android command-line tools, SDK platform `platforms;android-37.2` and NDK `ndk;29.0.14206865`. Set `ANDROID_HOME` to the SDK directory. The upstream Gradle wrapper pins the Gradle version; it downloads the required build tools on first use if needed.

```sh
node scripts/android-prepare.cjs
cd .build/android
./gradlew testDebugUnitTest verifySqlDelightMigration assembleRelease -Pdist=foss -Pinclude-telemetry=false -Penable-updater=false
```

Use `gradlew.bat` on Windows. The universal APK is `.build/android/app/build/outputs/apk/release/app-universal-release.apk`; it includes ARMv7, ARM64, x86 and x86_64. The generated directory is disposable build output. Preparation verifies the upstream archive SHA-256 and refuses to overwrite existing source belonging to another recipe/version or a nonempty unrecognized directory. The pin and checksum are recorded in [android/upstream.json](../android/upstream.json).

Local builds use Android's debug signing key. They are test builds and are collected with:

```sh
node scripts/android-collect.cjs --test-build
node scripts/android-source.cjs
```

For release signing, provide a persistent private Bihon keystore outside tracked source. Set `BIHON_ANDROID_RELEASE=true`, `BIHON_ANDROID_KEYSTORE_PATH`, `BIHON_ANDROID_KEYSTORE_PASSWORD`, `BIHON_ANDROID_KEY_ALIAS` and `BIHON_ANDROID_KEY_PASSWORD` while running Gradle. Then run `node scripts/android-collect.cjs --certificate-sha256 EXPECTED_PUBLIC_CERTIFICATE_DIGEST`. Collection verifies the APK's signature, signer fingerprint, application ID, version and minimum Android API before naming a production artifact. All future updates must use the same signing key; changing it prevents an in-place Android upgrade.

Production signing in Actions uses the manually dispatched **Signed Android package** workflow, restricted to `main` after successful platform checks for that exact commit. Create an `android-release` environment restricted to `main`, enable owner approval, and store `BIHON_ANDROID_KEYSTORE_BASE64`, `BIHON_ANDROID_KEYSTORE_PASSWORD`, `BIHON_ANDROID_KEY_ALIAS` and `BIHON_ANDROID_KEY_PASSWORD` there. Do not use repository-level signing secrets: same-repository PR workflows can request those. Commit only the public certificate SHA-256 to `android/signing-certificate.sha256`. Routine builds and PRs always use disposable test signing and receive no release credentials.

The release source archive contains the entire patched upstream source, Gradle wrapper, licenses, provenance and build instructions. Generated caches, APKs and signing material are excluded. It is distinct from the desktop MPL-2.0 source archive because Mihon is Apache-2.0 licensed.

## Verification

Run `node --test tests/android-build.test.cjs` for the source-integrity, path-preservation, version and signing gates. CI runs the actual Gradle unit tests, SQLDelight migration verification and APK build. `node scripts/android-smoke.cjs` installs and launches the APK on a fresh emulator, checks that onboarding renders and the process remains foreground, and collects a screenshot, UI dump and logcat under `artifacts/android-smoke/`. It refuses to overwrite an existing emulator installation.

Emulator startup checks do not establish physical-device behavior, third-party extension availability or authenticated tracker behavior. Those depend on the device, source and user account.

## Privacy

The Bihon recipe disables Firebase telemetry and Mihon's automatic APK updater. Reading, extensions, tracking and WebView browsing contact the sources and services that the user chooses. User credentials are entered on the device and are not part of the build or release artifacts. Upstream source copyright notices, Apache license and the in-app dependency license viewer are retained.
