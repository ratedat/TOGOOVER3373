param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [ValidateSet('All', 'Campaigns', 'Performances', 'SelectableEffects', 'DifficultyVariants', 'DifficultyGrades', 'RelicImages', 'Operators', 'ReviewPages')]
  [string[]]$Scope = @('All'),
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [switch]$ForceDownload,
  [switch]$PlanOnly
)

chcp 65001 | Out-Null
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$ErrorActionPreference = 'Stop'

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$RunRoot = Join-Path $ProjectRoot (Join-Path 'review\update-runs' $RunId)
$BeforeDir = Join-Path $RunRoot 'before\data'
$AfterDir = Join-Path $RunRoot 'after\data'
$LogPath = Join-Path $RunRoot 'run.log'
$CompareScript = Join-Path $ProjectRoot 'tools\compare-data-update.mjs'

$DataFiles = @(
  'campaigns.json',
  'wikiru-campaign-sources.json',
  'wikiru-operator-sources.json',
  'performance-sources.json',
  'selectable-effect-sources.json',
  'special-item-sources.json',
  'selectable-effects.json',
  'difficulty-variant-sources.json',
  'difficulty-grade-sources.json',
  'relics.json',
  'squads.json',
  'operators.json',
  'performances.json',
  'relic-images.json',
  'operator-images.json',
  'difficulty-tiers.json',
  'difficulty-grades.json',
  'relic-effect-variants.json'
)

function Resolve-Scopes([string[]]$InputScopes) {
  if ($InputScopes -contains 'All') {
    return @('Campaigns', 'Performances', 'SelectableEffects', 'DifficultyVariants', 'DifficultyGrades', 'RelicImages', 'Operators', 'ReviewPages')
  }
  $ordered = @('Campaigns', 'Performances', 'SelectableEffects', 'DifficultyVariants', 'DifficultyGrades', 'RelicImages', 'Operators', 'ReviewPages')
  @($ordered | Where-Object { $InputScopes -contains $_ })
}

function Copy-DataSnapshot([string]$Destination) {
  if (-not (Test-Path -LiteralPath $Destination)) { New-Item -ItemType Directory -Path $Destination -Force | Out-Null }
  foreach ($file in $DataFiles) {
    $source = Join-Path $ProjectRoot (Join-Path 'data' $file)
    if (Test-Path -LiteralPath $source) {
      Copy-Item -LiteralPath $source -Destination (Join-Path $Destination $file) -Force
    }
  }
}

function Write-RunLog([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Write-Host $line
  [System.IO.File]::AppendAllText($LogPath, $line + "`n", $Utf8NoBom)
}

function Invoke-ToolStep([string]$Name, [string]$ScriptName, [string[]]$ExtraArgs = @()) {
  $scriptPath = Join-Path $ProjectRoot (Join-Path 'tools' $ScriptName)
  if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Missing tool script: $scriptPath" }

  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath, '-ProjectRoot', $ProjectRoot) + $ExtraArgs
  Write-RunLog "START $Name"
  Write-RunLog ("powershell.exe " + (($arguments | ForEach-Object { if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ } }) -join ' '))
  & powershell.exe @arguments *>&1 | Tee-Object -FilePath $LogPath -Append
  if ($LASTEXITCODE -ne 0) { throw "Step failed: $Name" }
  Write-RunLog "END $Name"
}

$steps = Resolve-Scopes $Scope
if ($steps.Count -eq 0) { throw 'No update steps selected.' }

if ($PlanOnly) {
  Write-Host "ProjectRoot: $ProjectRoot"
  Write-Host "RunId: $RunId"
  Write-Host "RunRoot: $RunRoot"
  Write-Host "Steps: $($steps -join ', ')"
  if ($ForceDownload) { Write-Host 'ForceDownload: true' }
  exit 0
}

if (-not (Test-Path -LiteralPath $RunRoot)) { New-Item -ItemType Directory -Path $RunRoot -Force | Out-Null }
[System.IO.File]::WriteAllText($LogPath, '', $Utf8NoBom)

Write-RunLog "ProjectRoot: $ProjectRoot"
Write-RunLog "RunRoot: $RunRoot"
Write-RunLog "Steps: $($steps -join ', ')"
Copy-DataSnapshot $BeforeDir
Write-RunLog "Saved before snapshot: $BeforeDir"

foreach ($step in $steps) {
  switch ($step) {
    'Campaigns' {
      Invoke-ToolStep 'Campaign relic/squad extraction' 'extract-wikiru-data.ps1'
      break
    }
    'Performances' {
      Invoke-ToolStep 'Performance extraction' 'extract-performances.ps1'
      break
    }
    'SelectableEffects' {
      Invoke-ToolStep 'Selectable special effect extraction' 'extract-selectable-effects.ps1'
      Invoke-ToolStep 'Special item extraction' 'extract-special-items.ps1'
      break
    }
    'DifficultyVariants' {
      Invoke-ToolStep 'Difficulty-dependent relic variants' 'extract-difficulty-variants.ps1'
      break
    }
    'DifficultyGrades' {
      Invoke-ToolStep 'Difficulty grade extraction' 'extract-difficulty-grades.ps1'
      break
    }
    'RelicImages' {
      $args = @()
      if ($ForceDownload) { $args += '-ForceDownload' }
      Invoke-ToolStep 'Relic image sync' 'sync-relic-images.ps1' $args
      break
    }
    'Operators' {
      $args = @()
      if ($ForceDownload) { $args += '-ForceDownload' }
      Invoke-ToolStep 'Operator data and image sync' 'sync-operator-data.ps1' $args
      break
    }
    'ReviewPages' {
      Invoke-ToolStep 'Relic effect review page' 'build-relic-review.ps1'
      Invoke-ToolStep 'Relic image review page' 'build-relic-image-review.ps1'
      Invoke-ToolStep 'Operator image review page' 'build-operator-image-review.ps1'
      break
    }
  }
}

Copy-DataSnapshot $AfterDir
Write-RunLog "Saved after snapshot: $AfterDir"

Write-RunLog 'START data diff'
& node $CompareScript --before $BeforeDir --after $AfterDir --out $RunRoot *>&1 | Tee-Object -FilePath $LogPath -Append
if ($LASTEXITCODE -ne 0) { throw 'Data diff failed.' }
Write-RunLog 'END data diff'

Write-Host ''
Write-Host "Update run complete."
Write-Host "Summary: $([System.IO.Path]::GetFullPath((Join-Path $RunRoot 'summary.md')))"
Write-Host "CSV:     $([System.IO.Path]::GetFullPath((Join-Path $RunRoot 'changes.csv')))"
Write-Host "JSON:    $([System.IO.Path]::GetFullPath((Join-Path $RunRoot 'changes.json')))"