$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
node "$PSScriptRoot/bootstrap.cjs" @args
if ($LASTEXITCODE -ne 0) { throw 'Bootstrap failed' }
