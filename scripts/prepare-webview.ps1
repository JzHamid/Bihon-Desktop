$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
node "$PSScriptRoot/prepare-webview.cjs"
if ($LASTEXITCODE -ne 0) { throw 'WebView preparation failed' }
