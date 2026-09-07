$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force downloads,runtime | Out-Null
$asset = 'jbr_jcef-25.0.3-windows-x64-b508.4'
if (!(Test-Path downloads/jcef.tar.gz)) {
    curl.exe --retry 4 --retry-all-errors -L --fail -o downloads/jcef.tar.gz "https://cache-redirector.jetbrains.com/intellij-jbr/$asset.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw 'WebView download failed' }
}
if ((Get-FileHash downloads/jcef.tar.gz -Algorithm SHA256).Hash -ne 'AFAC9AD910BD7CE763F735A026E3E7A1745A9E0199F8FA348798869942123D36') { throw 'WebView checksum mismatch' }
$extracted = Join-Path (Get-Location) "runtime/jcef-extracted/$asset"
if (!(Test-Path -LiteralPath $extracted)) {
    New-Item -ItemType Directory -Force runtime/jcef-extracted | Out-Null
    tar.exe -xzf downloads/jcef.tar.gz -C runtime/jcef-extracted
    if ($LASTEXITCODE -ne 0) { throw 'WebView extraction failed' }
}
$destination = Join-Path (Get-Location) 'runtime/Suwayomi-Server-v2.3.2243-windows-x64/kcef'
New-Item -ItemType Directory -Force $destination | Out-Null
Get-ChildItem -LiteralPath (Join-Path $extracted 'lib') | Copy-Item -Destination $destination -Recurse -Force
Get-ChildItem -LiteralPath (Join-Path $extracted 'bin') | Copy-Item -Destination $destination -Recurse -Force
Copy-Item -LiteralPath (Join-Path $extracted 'release') -Destination $destination -Force
Copy-Item -LiteralPath (Join-Path $extracted 'legal') -Destination $destination -Recurse -Force
Write-Host 'Pinned extension WebView and license notices prepared.'
