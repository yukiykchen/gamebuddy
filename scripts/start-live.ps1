[CmdletBinding()]
param(
  [string]$Sts2Dir = $env:STS2_DIR,
  [string]$GameExe,
  [switch]$SkipBuild,
  [switch]$NoDesktop
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$bridgePort = 27182

function Stop-WithHint([string]$Message) {
  throw "[GameBuddy live] $Message"
}

function Resolve-Sts2Directory([string]$RequestedDirectory) {
  if (-not [string]::IsNullOrWhiteSpace($RequestedDirectory) -and (Test-Path -LiteralPath $RequestedDirectory -PathType Container)) {
    return (Resolve-Path -LiteralPath $RequestedDirectory).Path
  }

  $candidates = @(
    'E:\SteamLibrary\steamapps\common\Slay the Spire 2',
    'C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2',
    'C:\Program Files\Steam\steamapps\common\Slay the Spire 2'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Container) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  Stop-WithHint '未找到《杀戮尖塔 2》目录。请传入 -Sts2Dir "D:\\SteamLibrary\\steamapps\\common\\Slay the Spire 2"，或设置 STS2_DIR。'
}

function Resolve-GameExecutable([string]$InstallDirectory, [string]$RequestedExecutable) {
  if (-not [string]::IsNullOrWhiteSpace($RequestedExecutable)) {
    if (-not (Test-Path -LiteralPath $RequestedExecutable -PathType Leaf)) {
      Stop-WithHint "-GameExe 指向的文件不存在：$RequestedExecutable"
    }
    return (Resolve-Path -LiteralPath $RequestedExecutable).Path
  }

  foreach ($name in @('SlayTheSpire2.exe', 'Slay the Spire 2.exe', 'sts2.exe')) {
    $candidate = Join-Path $InstallDirectory $name
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  Stop-WithHint '未找到游戏启动文件。请用 -GameExe 显式指定游戏根目录中的 .exe 文件。'
}

function Test-BridgePortAvailable([int]$Port) {
  $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
  return -not ($listeners | Where-Object { $_.Port -eq $Port })
}

if ($env:OS -ne 'Windows_NT') {
  Stop-WithHint '真实 Mod 只能在 Windows 上构建和启动。'
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue) -and -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Stop-WithHint '未找到 npm。请安装 Node.js 20+ 后重试。'
}

$sts2 = Resolve-Sts2Directory $Sts2Dir
$gameExecutable = Resolve-GameExecutable $sts2 $GameExe
$dataDirectory = Join-Path $sts2 'data_sts2_windows_x86_64'
foreach ($assembly in @('sts2.dll', '0Harmony.dll')) {
  if (-not (Test-Path -LiteralPath (Join-Path $dataDirectory $assembly) -PathType Leaf)) {
    Stop-WithHint "游戏程序集缺失：$(Join-Path $dataDirectory $assembly)"
  }
}

$runningGame = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
  try {
    $_.Path -and $_.Path.StartsWith($sts2, [System.StringComparison]::OrdinalIgnoreCase)
  } catch {
    $false
  }
})
if ($runningGame.Count -gt 0) {
  Stop-WithHint '检测到游戏正在运行。请完整退出游戏后重试；游戏只会在启动时加载新复制的 Mod。'
}

if (-not (Test-BridgePortAvailable $bridgePort)) {
  Stop-WithHint "端口 $bridgePort 已被占用。请停止 Replay Bridge 或其他占用程序后重试；脚本不会自动结束进程。"
}

$modDll = Join-Path $sts2 'mods\GameBuddyBridge\gamebuddy_bridge.dll'
$modManifest = Join-Path $sts2 'mods\GameBuddyBridge\GameBuddyBridge.json'
if ($SkipBuild) {
  if (-not ((Test-Path -LiteralPath $modDll -PathType Leaf) -and (Test-Path -LiteralPath $modManifest -PathType Leaf))) {
    Stop-WithHint '指定 -SkipBuild，但目标游戏目录中没有完整的 GameBuddyBridge DLL 和 manifest。请移除 -SkipBuild。'
  }
  Write-Host '[GameBuddy live] 跳过构建，使用已安装的 Mod。'
} else {
  if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Stop-WithHint '.NET 9 SDK 未找到。请安装 .NET 9 与 Godot .NET SDK 4.5.1 后重试。'
  }
  Write-Host '[GameBuddy live] 构建并复制只读 GameBuddy Bridge Mod...'
  & (Join-Path $repoRoot 'mod\GameBuddyBridge\build.ps1') -Sts2Dir $sts2
  if ($LASTEXITCODE -ne 0) {
    Stop-WithHint "Mod 构建失败，退出码：$LASTEXITCODE"
  }
}

if (-not $NoDesktop) {
  $escapedRoot = $repoRoot.Replace("'", "''")
  $desktopCommand = "Set-Location -LiteralPath '$escapedRoot'; Write-Host '[GameBuddy] 启动桌面端，等待 Mod 连接…'; npm start"
  Write-Host '[GameBuddy live] 启动 GameBuddy 桌面端...'
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-Command', $desktopCommand) -WorkingDirectory $repoRoot | Out-Null
}

Write-Host "[GameBuddy live] 启动游戏：$gameExecutable"
Start-Process -FilePath $gameExecutable -WorkingDirectory $sts2 | Out-Null
Write-Host '[GameBuddy live] 已启动。首次运行请在游戏 Mod/Modding 页面确认启用 GameBuddy Bridge；开始或继续对局后，桌面端应从 WAIT 变为 LIVE。'
