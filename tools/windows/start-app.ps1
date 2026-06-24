param(
  [switch]$SmokeTest
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$shell = New-Object -ComObject WScript.Shell
Set-Location $root

function Stop-StaleLocalServers {
  $servers = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object { $_.CommandLine -match 'app[\\/]server\.mjs --port (5173|5174|5200)' }

  foreach ($server in $servers) {
    try {
      Stop-Process -Id $server.ProcessId -Force -ErrorAction Stop
    } catch {
      # Best effort only. A stale process should not block the normal launcher path.
    }
  }
}
function Show-Message($message, $title = "Arknights Rogue OBS Tool", $icon = 64) {
  $shell.Popup($message, 0, $title, $icon) | Out-Null
}

Stop-StaleLocalServers

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Show-Message "Node.js / npm が見つかりません。配布版の exe を使うか、開発用に Node.js をインストールしてください。" "起動できません" 16
  exit 1
}

if (-not (Test-Path (Join-Path $root "node_modules\.bin\electron.cmd"))) {
  $shell.Popup("初回セットアップを行います。数分かかる場合があります。完了するとアプリが起動します。", 5, "Arknights Rogue OBS Tool", 64) | Out-Null
  $install = Start-Process -FilePath "npm.cmd" -ArgumentList @("install") -WorkingDirectory $root -Wait -PassThru -WindowStyle Hidden
  if ($install.ExitCode -ne 0) {
    Show-Message "初回セットアップに失敗しました。ネットワーク接続と Node.js の状態を確認してください。" "セットアップ失敗" 16
    exit $install.ExitCode
  }
}

$appArgs = @("run", "app")
if ($SmokeTest) {
  $appArgs += @("--", "--port", "5200", "--smoke-test")
  $run = Start-Process -FilePath "npm.cmd" -ArgumentList $appArgs -WorkingDirectory $root -Wait -PassThru -WindowStyle Hidden
  exit $run.ExitCode
}

Start-Process -FilePath "npm.cmd" -ArgumentList $appArgs -WorkingDirectory $root -WindowStyle Hidden