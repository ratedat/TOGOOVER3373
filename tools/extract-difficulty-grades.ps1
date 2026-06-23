param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

chcp 65001 | Out-Null
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$ErrorActionPreference = 'Stop'

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$GeneratedAt = (Get-Date -Format 'yyyy-MM-dd')

function As-Array($Value) {
  $items = @()
  foreach ($item in $Value) { $items += $item }
  $items
}

function Get-WikiSource([string]$Page) {
  $url = 'https://arknights.wikiru.jp/?cmd=source&page=' + [uri]::EscapeDataString($Page)
  $htmlLines = curl.exe -sS -L $url 2>$null
  $html = $htmlLines -join "`n"
  $match = [regex]::Match($html, '<pre id="source">(?<source>[\s\S]*?)</pre>')
  if (-not $match.Success) {
    throw "Could not find source pre for $Page"
  }
  [System.Net.WebUtility]::HtmlDecode($match.Groups['source'].Value)
}

function Clean-WikiText([string]$Text) {
  if ($null -eq $Text) { return '' }
  $t = $Text
  $t = $t -replace '&br\s*/?;', ' '
  $t = $t -replace '&ensp;|&thinsp;|&nbsp;', ' '
  $t = $t -replace '\[\[([^\]>]+)>[^\]]+\]\]', '$1'
  $t = $t -replace '\[\[([^\]]+)\]\]', '$1'
  $t = $t -replace '&tooltip\(([^)]*)\)(?:\{[^{}]*\})?;', '$1'
  $t = $t -replace '&(?:attachref|ref)\([^;]*\);', ''
  $t = $t -replace '&color\([^\)]*\)\{([^{}]*)\};', '$1'
  $t = $t -replace '&nobold\{([^{}]*)\};', '$1'
  $t = $t -replace 'BGCOLOR\([^\)]*\):', ''
  $t = $t -replace 'CENTER:', ''
  $t = $t -replace 'LEFT:', ''
  $t = $t -replace 'RIGHT:', ''
  $t = $t -replace '~', ''
  $t = $t -replace "''", ''
  $t = $t -replace '<([^<>]*[\u3040-\u30ff\u3400-\u9fff][^<>]*)>', '＜$1＞'
  $t = $t -replace '<[^>]+>', ''
  $t = $t -replace '\s+', ' '
  $t.Trim()
}

function Split-WikiRow([string]$Line) {
  $trim = $Line.Trim()
  if (-not $trim.StartsWith('|')) { return @() }
  $parts = $trim.Split('|')
  if ($parts.Count -le 2) { return @() }
  $cells = @()
  for ($i = 1; $i -lt $parts.Count - 1; $i++) {
    $cells += $parts[$i]
  }
  $cells
}

function Get-DifficultyBlock([string]$Source) {
  $lines = $Source -split "\r?\n"
  $start = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\*\*難易度') {
      $start = $i
      break
    }
  }
  if ($start -lt 0) { return @() }

  $block = @()
  for ($i = $start; $i -lt $lines.Count; $i++) {
    if ($i -gt $start -and $lines[$i] -match '^\*\*[^*]') { break }
    $block += $lines[$i]
  }
  $block
}

function Get-GradeFromCells($Cells, [string]$TableStyle) {
  $gradeIndex = if ($TableStyle -eq 'mode-grade') { 1 } else { 0 }
  if ($Cells.Count -le $gradeIndex) { return $null }
  $text = Clean-WikiText $Cells[$gradeIndex]
  if ($text -notmatch '^\d+$') { return $null }
  [int]$text
}

function Get-ModeName($Cells, [string]$TableStyle, [string]$CurrentName, [string]$FallbackName) {
  if ($TableStyle -ne 'mode-grade' -or $Cells.Count -eq 0) { return $FallbackName }
  $text = Clean-WikiText $Cells[0]
  if ($text -ne '' -and $text -ne '>' -and $text -notmatch '難易度|等級') { return $text }
  if ($CurrentName) { return $CurrentName }
  $FallbackName
}

function Extract-CampaignGrades($CampaignConfig, $CampaignSource) {
  $source = Get-WikiSource $CampaignSource.page
  $block = Get-DifficultyBlock $source
  if ($block.Count -eq 0) { throw "Could not find difficulty block for $($CampaignSource.id)." }

  $grades = @()
  $lastValues = @{}
  $currentName = $CampaignConfig.difficultyName
  $fields = As-Array $CampaignConfig.fields

  foreach ($line in $block) {
    $trim = $line.Trim()
    if (-not $trim.StartsWith('|')) { continue }
    $cells = Split-WikiRow $trim
    if ($cells.Count -eq 0) { continue }
    $grade = Get-GradeFromCells $cells $CampaignConfig.tableStyle
    if ($null -eq $grade) { continue }
    $currentName = Get-ModeName $cells $CampaignConfig.tableStyle $currentName $CampaignConfig.difficultyName
    $isSelectable = $grade -ge [int]$CampaignConfig.minSelectableGrade -and $grade -le [int]$CampaignConfig.maxSelectableGrade

    $fieldItems = @()
    $topLevel = [ordered]@{
      id = '{0}_grade_{1}' -f $CampaignConfig.id, $grade
      campaignId = $CampaignConfig.id
      difficultyName = $currentName
      grade = $grade
      label = '{0}・{1}' -f $currentName, $grade
      fields = $null
    }

    foreach ($field in $fields) {
      $key = [string]$field.key
      $raw = if ($cells.Count -gt [int]$field.index) { $cells[[int]$field.index] } else { '' }
      $value = Clean-WikiText $raw
      if (($raw.Trim() -eq '~' -or $value -eq '') -and $lastValues.ContainsKey($key)) {
        $value = $lastValues[$key]
      }
      if ($value -ne '') { $lastValues[$key] = $value }
      $fieldItems += [ordered]@{
        key = $key
        label = [string]$field.label
        value = $value
      }
      $topLevel[$key] = $value
    }

    if (-not $isSelectable) { continue }
    $topLevel.fields = $fieldItems
    $grades += [PSCustomObject]$topLevel
  }

  [PSCustomObject][ordered]@{
    campaignId = $CampaignConfig.id
    difficultyName = $CampaignConfig.difficultyName
    minSelectableGrade = [int]$CampaignConfig.minSelectableGrade
    maxSelectableGrade = [int]$CampaignConfig.maxSelectableGrade
    tableStyle = $CampaignConfig.tableStyle
    sourcePage = $CampaignSource.page
    sourceUrl = 'https://arknights.wikiru.jp/?' + [uri]::EscapeDataString($CampaignSource.page)
    grades = $grades
  }
}

$CampaignSourcePath = Join-Path $ProjectRoot 'data\wikiru-campaign-sources.json'
$GradeSourcePath = Join-Path $ProjectRoot 'data\difficulty-grade-sources.json'
$OutputPath = Join-Path $ProjectRoot 'data\difficulty-grades.json'

$campaignSources = As-Array ((Get-Content -LiteralPath $CampaignSourcePath -Raw -Encoding UTF8 | ConvertFrom-Json).campaigns)
$gradeConfigs = As-Array ((Get-Content -LiteralPath $GradeSourcePath -Raw -Encoding UTF8 | ConvertFrom-Json).campaigns)
$campaignSourceById = @{}
foreach ($source in $campaignSources) { $campaignSourceById[$source.id] = $source }

$result = [ordered]@{
  version = 1
  meta = [ordered]@{
    generatedAt = $GeneratedAt
    source = 'arknights.wikiru.jp difficulty tables'
    sourceConfig = 'data/difficulty-grade-sources.json'
    note = 'Generated by tools/extract-difficulty-grades.ps1. Re-run after wiki updates or campaign range changes.'
  }
  campaignDifficultyGrades = [ordered]@{}
}

foreach ($config in $gradeConfigs) {
  if (-not $campaignSourceById.ContainsKey($config.id)) {
    throw "No campaign source configured for $($config.id)."
  }
  $campaignGrades = Extract-CampaignGrades $config $campaignSourceById[$config.id]
  $result.campaignDifficultyGrades[$config.id] = $campaignGrades
  Write-Host ("{0}: {1} grades" -f $config.id, $campaignGrades.grades.Count)
}

$json = $result | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($OutputPath, $json + "`n", $Utf8NoBom)
Write-Host "Wrote $OutputPath"
