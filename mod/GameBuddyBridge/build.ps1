param(
  [string]$Sts2Dir = $env:STS2_DIR,
  [switch]$SkipCopy
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Sts2Dir)) {
  $candidates = @(
    'E:\SteamLibrary\steamapps\common\Slay the Spire 2',
    'C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2',
    'C:\Program Files\Steam\steamapps\common\Slay the Spire 2'
  )
  $Sts2Dir = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if ([string]::IsNullOrWhiteSpace($Sts2Dir) -or -not (Test-Path $Sts2Dir)) {
  throw 'STS2 install directory not found. Pass -Sts2Dir or set STS2_DIR.'
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  throw 'dotnet was not found. Install .NET 9 SDK and Godot .NET SDK 4.5.1.'
}
if (-not (dotnet --list-sdks 2>$null | Select-String '^9\.')) {
  throw 'A .NET 9 SDK is required to build the STS2 Mod.'
}

$dataDir = Join-Path $Sts2Dir 'data_sts2_windows_x86_64'
foreach ($file in @('sts2.dll', '0Harmony.dll')) {
  if (-not (Test-Path (Join-Path $dataDir $file))) {
    throw "Missing game assembly: $(Join-Path $dataDir $file)"
  }
}

$copy = if ($SkipCopy) { 'false' } else { 'true' }
dotnet build (Join-Path $PSScriptRoot 'GameBuddyBridge.csproj') -c Release `
  "-p:Sts2Dir=$Sts2Dir" "-p:CopyModAfterBuild=$copy"

Write-Host 'GameBuddyBridge build completed.'
if (-not $SkipCopy) {
  Write-Host "Copied to: $(Join-Path $Sts2Dir 'mods\GameBuddyBridge')"
}
