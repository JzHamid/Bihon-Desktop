param(
    [Parameter(Mandatory = $true)][string]$Mascot,
    [Parameter(Mandatory = $true)][string]$Wordmark,
    [Parameter(Mandatory = $true)][string]$Lockup
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Get-CroppedBitmap([string]$Source) {
    $image = [System.Drawing.Bitmap]::new($Source)
    $left = $image.Width; $top = $image.Height; $right = -1; $bottom = -1
    for ($y = 0; $y -lt $image.Height; $y += 2) {
        for ($x = 0; $x -lt $image.Width; $x += 2) {
            if ($image.GetPixel($x, $y).A -gt 8) {
                $left = [Math]::Min($left, $x); $top = [Math]::Min($top, $y)
                $right = [Math]::Max($right, $x); $bottom = [Math]::Max($bottom, $y)
            }
        }
    }
    if ($right -lt 0) { $image.Dispose(); throw "No visible pixels in $Source" }
    $padding = [Math]::Max(4, [Math]::Round([Math]::Max($right - $left, $bottom - $top) * 0.025))
    $rectangle = [System.Drawing.Rectangle]::FromLTRB([Math]::Max(0, $left - $padding), [Math]::Max(0, $top - $padding), [Math]::Min($image.Width, $right + $padding), [Math]::Min($image.Height, $bottom + $padding))
    $result = $image.Clone($rectangle, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $image.Dispose()
    return $result
}

function Save-FittedPng([System.Drawing.Bitmap]$Source, [string]$Target, [int]$Width, [int]$Height) {
    $targetBitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($targetBitmap)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $scale = [Math]::Min($Width / $Source.Width, $Height / $Source.Height)
    $drawWidth = [Math]::Round($Source.Width * $scale); $drawHeight = [Math]::Round($Source.Height * $scale)
    $graphics.DrawImage($Source, [Math]::Round(($Width - $drawWidth) / 2), [Math]::Round(($Height - $drawHeight) / 2), $drawWidth, $drawHeight)
    $directory = Split-Path -Parent $Target; New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $targetBitmap.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose(); $targetBitmap.Dispose()
}

$root = Split-Path -Parent $PSScriptRoot
$originals = Join-Path $root 'assets\branding\original'
New-Item -ItemType Directory -Force -Path $originals | Out-Null
Copy-Item -LiteralPath $Mascot -Destination (Join-Path $originals 'bihon-noodle-mascot.png') -Force
Copy-Item -LiteralPath $Wordmark -Destination (Join-Path $originals 'bihon-wordmark.png') -Force
Copy-Item -LiteralPath $Lockup -Destination (Join-Path $originals 'bihon-mascot-wordmark.png') -Force

$mascotImage = Get-CroppedBitmap $Mascot
$wordmarkImage = Get-CroppedBitmap $Wordmark
$lockupImage = Get-CroppedBitmap $Lockup
$desktopAssets = Join-Path $root 'desktop\assets'
$webAssets = Join-Path $root 'vendor\webui\public\branding'
$iconSizes = @(16, 24, 32, 48, 64, 96, 128, 192, 256, 512)
foreach ($size in $iconSizes) { Save-FittedPng $mascotImage (Join-Path $desktopAssets "icons\bihon-$size.png") $size $size }
Save-FittedPng $mascotImage (Join-Path $desktopAssets 'bihon-icon.png') 512 512
Save-FittedPng $mascotImage (Join-Path $webAssets 'bihon-icon-192.png') 192 192
Save-FittedPng $mascotImage (Join-Path $webAssets 'bihon-icon-512.png') 512 512
Save-FittedPng $mascotImage (Join-Path $root 'vendor\webui\public\favicon-96x96.png') 96 96
Save-FittedPng $mascotImage (Join-Path $root 'vendor\webui\public\apple-touch-icon.png') 180 180
Save-FittedPng $wordmarkImage (Join-Path $webAssets 'bihon-wordmark.png') 560 180
Save-FittedPng $lockupImage (Join-Path $desktopAssets 'bihon-lockup.png') 800 400
Save-FittedPng $lockupImage (Join-Path $webAssets 'bihon-lockup.png') 800 400

$icoPngs = [System.Collections.Generic.List[byte[]]]::new()
foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) { $icoPngs.Add([System.IO.File]::ReadAllBytes((Join-Path $desktopAssets "icons\bihon-$size.png"))) }
$icoPath = Join-Path $desktopAssets 'bihon.ico'; $stream = [System.IO.File]::Create($icoPath); $writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]$icoPngs.Count)
$offset = 6 + 16 * $icoPngs.Count
for ($index = 0; $index -lt $icoPngs.Count; $index++) {
    $size = @(16, 24, 32, 48, 64, 128, 256)[$index]; $dimension = if ($size -eq 256) { 0 } else { $size }
    $writer.Write([Byte]$dimension); $writer.Write([Byte]$dimension); $writer.Write([Byte]0); $writer.Write([Byte]0)
    $writer.Write([UInt16]1); $writer.Write([UInt16]32); $writer.Write([UInt32]$icoPngs[$index].Length); $writer.Write([UInt32]$offset)
    $offset += $icoPngs[$index].Length
}
foreach ($bytes in $icoPngs) { $writer.Write($bytes) }
$writer.Dispose(); $stream.Dispose()
$mascotImage.Dispose(); $wordmarkImage.Dispose(); $lockupImage.Dispose()
Copy-Item -LiteralPath $icoPath -Destination (Join-Path $root 'vendor\webui\public\favicon.ico') -Force
