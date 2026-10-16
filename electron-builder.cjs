const path = require('node:path');
const fs = require('node:fs/promises');
const { platformDetails, runtimeDirectory } = require('./desktop/platform.cjs');

// Package on the target OS: the JVM and extension WebView contain native code.
const runtime = runtimeDirectory(__dirname);
module.exports = {
  appId: 'app.bihon.desktop',
  productName: 'Bihon',
  directories: { output: 'dist' },
  files: ['desktop/**/*', '!desktop/java/*.java', 'package.json', 'UPSTREAM.json', 'LICENSE', 'THIRD-PARTY-NOTICES.md'],
  extraResources: [
    ...['jre', 'bin', 'kcef'].map(directory => ({ from: path.join(runtime, directory), to: `runtime/${directory}` })),
    { from: 'desktop/java', to: 'java', filter: ['*.class'] },
    { from: 'vendor/webui/build', to: 'webui' },
    { from: 'licenses', to: 'licenses' },
  ],
  beforePack: async context => {
    if (context.electronPlatformName !== process.platform || context.arch !== 1) {
      throw new Error('Build Windows x64 on Windows x64, or Linux x64 on Linux x64, so bundled native runtimes match the installer.');
    }
    const { paths } = platformDetails();
    for (const file of [paths.join(runtime, 'jre/bin', process.platform === 'win32' ? 'java.exe' : 'java'), path.join(runtime, 'bin/Suwayomi-Server.jar'), path.join(runtime, 'kcef/release'), path.join(__dirname, 'desktop/java/BihonServer.class'), path.join(__dirname, 'vendor/webui/build/index.html')]) {
      await fs.access(file).catch(() => { throw new Error(`Missing build input: ${file}. Run npm run bootstrap first.`); });
    }
  },
  win: { target: ['nsis'], icon: 'desktop/assets/bihon.ico', signExecutable: false, artifactName: 'Bihon-Setup-${version}-${arch}.${ext}' },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, deleteAppDataOnUninstall: false, installerIcon: 'desktop/assets/bihon.ico', uninstallerIcon: 'desktop/assets/bihon.ico' },
  linux: {
    target: ['AppImage', 'deb'],
    executableName: 'bihon',
    category: 'Graphics',
    icon: 'desktop/assets/icons',
    artifactName: 'Bihon-${version}-${arch}.${ext}',
    maintainer: 'JzHamid',
    synopsis: 'Local manga, webtoon, and EPUB reader',
    desktop: { entry: { Name: 'Bihon', Comment: 'Read manga, webtoons, and EPUB books', StartupWMClass: 'Bihon' } },
  },
  // Override electron-builder's legacy AppImage default of --no-sandbox.
  appImage: { executableArgs: [] },
  deb: {
    // Electron and JCEF both need these desktop libraries. Ubuntu 24.04's
    // t64 packages provide the corresponding unversioned dependency names.
    depends: ['libgtk-3-0', 'libnss3', 'libxss1', 'libxtst6', 'libxrender1', 'libxcomposite1', 'libxdamage1', 'libxkbcommon0', 'libgbm1', 'libasound2', 'libatk-bridge2.0-0', 'libatspi2.0-0', 'libdrm2', 'libxcb1', 'libxfixes3', 'libxrandr2', 'libcups2', 'libnotify4', 'xdg-utils'],
  },
  publish: null,
};
