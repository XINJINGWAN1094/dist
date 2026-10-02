param([Parameter(Mandatory=$true)][string]$SourceDirectory, [Parameter(Mandatory=$true)][string]$TargetDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$sourceFiles = @(Get-ChildItem -LiteralPath $SourceDirectory -Filter '*.png' | Sort-Object Name)
if ($sourceFiles.Count -ne 2) { throw 'Expected the two approved concept PNG files.' }
$assetOutput = [System.IO.Path]::GetFullPath($TargetDirectory)
[System.IO.Directory]::CreateDirectory($assetOutput) | Out-Null
$sourceImages = @([System.Drawing.Image]::FromFile($sourceFiles[0].FullName), [System.Drawing.Image]::FromFile($sourceFiles[1].FullName))
$records = [System.Collections.Generic.List[object]]::new()
function Crop-Asset([string]$Name, [int]$Source, [int]$X, [int]$Y, [int]$Width, [int]$Height, [int]$Frame = 0, [int]$FadeTop = 0) {
  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.DrawImage($sourceImages[$Source], [System.Drawing.Rectangle]::new(0,0,$Width,$Height), $X,$Y,$Width,$Height, [System.Drawing.GraphicsUnit]::Pixel)
    if ($Frame -gt 0) {
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::Transparent)
      $graphics.FillRectangle($brush, $Frame, $Frame, ($Width-2*$Frame), ($Height-2*$Frame))
      $brush.Dispose()
    }
    for ($fy=0; $fy -lt $FadeTop; $fy++) {
      for ($fx=0; $fx -lt $Width; $fx++) {
        $pixel=$bitmap.GetPixel($fx,$fy)
        $bitmap.SetPixel($fx,$fy,[System.Drawing.Color]::FromArgb([int](255*$fy/$FadeTop),$pixel.R,$pixel.G,$pixel.B))
      }
    }
    $bitmap.Save((Join-Path $assetOutput ($Name+'.png')), [System.Drawing.Imaging.ImageFormat]::Png)
    $records.Add(@{file=$Name+'.png'; source=$sourceFiles[$Source].Name; crop=@($X,$Y,$Width,$Height); transparentCenter=$Frame})
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
function Extract-Glyph([string]$Name, [int]$Source, [int]$X, [int]$Y, [int]$Width, [int]$Height, [bool]$Light = $false) {
  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    for ($gy=0; $gy -lt $Height; $gy++) {
      for ($gx=0; $gx -lt $Width; $gx++) {
        $pixel = ([System.Drawing.Bitmap]$sourceImages[$Source]).GetPixel(($X+$gx),($Y+$gy))
        $luma = 0.2126*$pixel.R + 0.7152*$pixel.G + 0.0722*$pixel.B
        $alpha = if ($Light) { ($luma-135)*3 } else { (185-$luma)*4 }
        $alpha = [int][Math]::Max(0,[Math]::Min(255,$alpha))
        $bitmap.SetPixel($gx,$gy,[System.Drawing.Color]::FromArgb($alpha,76,74,66))
      }
    }
    $bitmap.Save((Join-Path $assetOutput ($Name+'.png')), [System.Drawing.Imaging.ImageFormat]::Png)
    $records.Add(@{file=$Name+'.png'; source=$sourceFiles[$Source].Name; crop=@($X,$Y,$Width,$Height); extraction='monochrome glyph, transparent paper'})
  } finally { $bitmap.Dispose() }
}
function Extract-Ornament([string]$Name, [int]$Source, [int]$X, [int]$Y, [int]$Width, [int]$Height, [bool]$GoldOnBlue = $false) {
  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    for ($gy=0; $gy -lt $Height; $gy++) {
      for ($gx=0; $gx -lt $Width; $gx++) {
        $pixel=([System.Drawing.Bitmap]$sourceImages[$Source]).GetPixel(($X+$gx),($Y+$gy))
        $luma=0.2126*$pixel.R+0.7152*$pixel.G+0.0722*$pixel.B
        $alpha=if ($GoldOnBlue) { ($pixel.R-$pixel.B-12)*5 } else { (205-$luma)*4 }
        $alpha=[int][Math]::Max(0,[Math]::Min(255,$alpha))
        $bitmap.SetPixel($gx,$gy,[System.Drawing.Color]::FromArgb($alpha,$pixel.R,$pixel.G,$pixel.B))
      }
    }
    $bitmap.Save((Join-Path $assetOutput ($Name+'.png')), [System.Drawing.Imaging.ImageFormat]::Png)
    $records.Add(@{file=$Name+'.png';source=$sourceFiles[$Source].Name;crop=@($X,$Y,$Width,$Height);extraction='preserved ornament color, transparent background'})
  } finally { $bitmap.Dispose() }
}
function Extract-Shield([string]$Name, [int]$Source, [int]$X, [int]$Y, [int]$Width, [int]$Height) {
  # Remove only the paper connected to the image edge; the dark shield outline
  # protects its enclosed gold decoration. The contour comes from the source.
  $bitmap = [System.Drawing.Bitmap]::new($Width,$Height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.DrawImage($sourceImages[$Source],[System.Drawing.Rectangle]::new(0,0,$Width,$Height),$X,$Y,$Width,$Height,[System.Drawing.GraphicsUnit]::Pixel)
    $queue = [System.Collections.Generic.Queue[int]]::new()
    $visited = [bool[]]::new($Width*$Height)
    for ($i=0; $i -lt $Width*$Height; $i++) {
      $px=$i%$Width; $py=[int][Math]::Floor($i/$Width)
      if ($px -eq 0 -or $py -eq 0 -or $px -eq ($Width-1) -or $py -eq ($Height-1)) { $queue.Enqueue($i) }
    }
    while ($queue.Count) {
      $i=$queue.Dequeue()
      if ($visited[$i]) { continue }
      $visited[$i]=$true
      $px=$i%$Width; $py=[int][Math]::Floor($i/$Width)
      $color=$bitmap.GetPixel($px,$py)
      $luma=0.2126*$color.R+0.7152*$color.G+0.0722*$color.B
      if ($luma -lt 137) { continue }
      $bitmap.SetPixel($px,$py,[System.Drawing.Color]::Transparent)
      if ($px -gt 0) { $queue.Enqueue(($i-1)) }
      if ($px -lt ($Width-1)) { $queue.Enqueue(($i+1)) }
      if ($py -gt 0) { $queue.Enqueue(($i-$Width)) }
      if ($py -lt ($Height-1)) { $queue.Enqueue(($i+$Width)) }
    }
    $bitmap.Save((Join-Path $assetOutput ($Name+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
    $records.Add(@{file=$Name+'.png';source=$sourceFiles[$Source].Name;crop=@($X,$Y,$Width,$Height);extraction='edge-connected paper removed, original shield contour'})
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
  Crop-Asset paper 0 487 825 508 116
  Crop-Asset navy 1 1000 5 380 60
  Crop-Asset crest 1 78 0 51 81
  Crop-Asset panel-frame 1 1085 73 447 935 18
  Crop-Asset item-frame 0 475 269 176 269 10
  Crop-Asset selected-frame 0 285 267 179 272 9
  Crop-Asset equipment-frame 1 441 590 103 136 9
  Crop-Asset roster-frame 1 30 226 327 103 8
  Crop-Asset stats-frame 1 1100 241 415 253 9
  Crop-Asset button-frame 0 1105 848 375 81 23
  Crop-Asset row-frame 1 30 333 327 103 8
  Crop-Asset category-frame 0 33 243 245 84 19
  Crop-Asset blue-button 0 1160 867 50 40
  Crop-Asset desk 0 0 528 245 496
  Crop-Asset castle-paper 1 14 469 353 524 0 70
  Crop-Asset crystal 0 297 281 159 169
  Crop-Asset potion 0 487 282 148 168
  Crop-Asset sword 0 675 282 150 167
  Crop-Asset ring 0 860 282 149 167
  Crop-Asset brooch 0 298 559 153 167
  Crop-Asset pendant 0 487 559 150 167
  Crop-Asset shard 0 675 559 149 167
  Crop-Asset dagger 0 861 559 148 167
  Crop-Asset armor 1 930 239 96 111
  Extract-Shield heraldry 1 57 243 58 76
  Extract-Ornament compass 0 24 0 126 118 $true
  Crop-Asset header-architecture 0 545 97 489 94
  Crop-Asset header-castle 0 497 0 272 86
  Extract-Ornament section-rule 0 1102 704 385 21
  Extract-Ornament title-ornament 0 496 143 64 28
  Crop-Asset header-rule 1 527 21 158 18
  Extract-Ornament dragon-watermark 1 1383 102 125 120
  Crop-Asset archive-footer 0 264 975 1127 49
  Extract-Glyph icon-all 0 59 185 41 44
  Extract-Glyph icon-weapon 0 59 345 38 42
  Extract-Glyph icon-ring 0 62 428 36 43
  Extract-Glyph icon-secret 0 59 264 38 42 $true
  Extract-Glyph icon-special 1 1116 300 35 31
  Extract-Glyph icon-defense 1 1117 355 33 34
  Extract-Glyph icon-life 1 1119 262 29 28
  Extract-Glyph icon-attack 1 1118 400 31 31
  Extract-Glyph icon-energy 1 1118 612 34 38
  Extract-Glyph icon-cap 1 1119 443 32 29
  Extract-Glyph icon-person 0 1127 784 37 36
  Extract-Glyph icon-search 0 311 209 32 34
  $records | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $assetOutput 'sources.json') -Encoding UTF8
  Write-Output ('Cropped PNG assets: ' + $records.Count)
} finally { $sourceImages | ForEach-Object { $_.Dispose() } }
