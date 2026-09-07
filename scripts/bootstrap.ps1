$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force downloads,runtime | Out-Null
$runtimeUrl = 'https://github.com/Suwayomi/Suwayomi-Server/releases/download/v2.3.2243/Suwayomi-Server-v2.3.2243-windows-x64.zip'
if (!(Test-Path downloads/server.zip)) {
    curl.exe --retry 4 --retry-all-errors -L --fail -o downloads/server.zip $runtimeUrl
    if ($LASTEXITCODE -ne 0) { throw 'Runtime download failed' }
}
$expected = '895843f48d5735e01bdc43d79ab66e600d6f507076a9b792ffa418a9bbcc32c2'
if ((Get-FileHash downloads/server.zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Runtime checksum mismatch' }
if (!(Test-Path runtime/Suwayomi-Server-v2.3.2243-windows-x64/bin/Suwayomi-Server.jar)) {
    Expand-Archive -LiteralPath downloads/server.zip -DestinationPath runtime -Force
}
npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Build dependencies failed to install' }
& .\node_modules\node\bin\node.exe node_modules/electron/install.js
if ($LASTEXITCODE -ne 0) { throw 'Electron runtime download failed' }
javac --release 17 desktop/java/BihonServer.java
if ($LASTEXITCODE -ne 0) { throw 'Install a JDK 17 or newer to build the small Java launcher' }
& "$PSScriptRoot/prepare-webview.ps1"
& .\node_modules\node\bin\node.exe scripts/build-ui.cjs
if ($LASTEXITCODE -ne 0) { throw 'UI build failed' }
Write-Host 'Ready. Run npm start, or npm run dist to build the installer.'
