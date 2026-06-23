param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ConfigPath = (Join-Path $ProjectRoot 'data\difficulty-variant-sources.json')
)

chcp 65001 | Out-Null
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$ErrorActionPreference = 'Stop'

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function As-Array($Value) {
  $items = @()
  foreach ($item in $Value) { $items += $item }
  $items
}

function Split-WikiRow([string]$Line) {
  $parts = $Line.Trim().Split('|')
  if ($parts.Count -le 2) { return @() }
  $cells = @()
  for ($i = 1; $i -lt $parts.Count - 1; $i++) { $cells += $parts[$i] }
  $cells
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
  while ($t -match '&color\([^\)]*\)\{([^{}]*)\};') {
    $t = [regex]::Replace($t, '&color\([^\)]*\)\{([^{}]*)\};', '$1')
  }
  $t = $t -replace '&nobold\{([^{}]*)\};', '$1'
  $t = $t -replace 'BGCOLOR\([^\)]*\):', ''
  $t = $t -replace 'CENTER:|LEFT:|RIGHT:', ''
  $t = $t -replace '~', ''
  $t = $t -replace "''", ''
  $t = $t -replace '<([^<>]*[\u3040-\u30ff\u3400-\u9fff][^<>]*)>', '＜$1＞'
  $t = $t -replace '<[^>]+>', ''
  $t = $t -replace '\(\([^\)]*\)\)', ''
  $t = $t -replace '\s+', ' '
  $t.Trim()
}

function Clean-VariantEffect([string]$Text) {
  $clean = Clean-WikiText $Text
  $clean = $clean -replace '\s*\[[+\-][^\]]+\]', ''
  $clean = $clean -replace '\s+', ' '
  $clean.Trim()
}

function Get-SourceLines([string]$Page) {
  $url = 'https://arknights.wikiru.jp/?cmd=source&page=' + [uri]::EscapeDataString($Page)
  $html = (curl.exe -sS -L $url 2>$null) -join "`n"
  $sourceMatch = [regex]::Match($html, '<pre id="source">(?<source>[\s\S]*?)</pre>')
  if (-not $sourceMatch.Success) { throw "Could not find source pre for $Page." }
  ([System.Net.WebUtility]::HtmlDecode($sourceMatch.Groups['source'].Value)) -split "`n"
}

function Get-Tier([string]$Label, [array]$Tiers) {
  $Tiers | Where-Object { $_.label -eq $Label } | Select-Object -First 1
}

function Get-RelicRange($Source) {
  if ($null -eq $Source.relicRange) { throw "Missing relicRange for $($Source.campaignId)." }
  [pscustomobject]@{
    minNumber = [int]$Source.relicRange.minNumber
    maxNumber = [int]$Source.relicRange.maxNumber
  }
}

function Get-DifficultyVariantGroups($Source) {
  $range = Get-RelicRange $Source
  $tiers = As-Array $Source.tiers
  if ($tiers.Count -eq 0) { throw "Missing tiers for $($Source.campaignId)." }

  $lines = Get-SourceLines $Source.page
  $groups = @()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i].Trim()
    if ($line -notmatch '^#shadowheader\(3,No\.(?<num>\d+)\s(?<name>.*?)(?:\s*\[#(?<anchor>[^\]]+)\])?\)$') { continue }
    $num = [int]$matches.num
    if ($num -lt $range.minNumber -or $num -gt $range.maxNumber) { continue }

    $name = Clean-WikiText $matches.name
    $anchor = if ($matches.ContainsKey('anchor') -and -not [string]::IsNullOrWhiteSpace($matches.anchor)) { $matches.anchor } else { 'No' + $num }
    $end = $lines.Count - 1
    for ($j = $i + 1; $j -lt $lines.Count; $j++) {
      if ($lines[$j].Trim() -match '^#shadowheader\(3,No\.') { $end = $j - 1; break }
    }

    $variants = @()
    foreach ($row in $lines[$i..$end]) {
      $cells = Split-WikiRow $row
      if ($cells.Count -lt 5) { continue }
      $tier = Get-Tier (Clean-WikiText $cells[3]) $tiers
      if ($null -eq $tier) { continue }
      $variant = [ordered]@{
        tierId = $tier.id
        label = $tier.label
        minDifficulty = $tier.minDifficulty
        maxDifficulty = $tier.maxDifficulty
        nameSuffix = $tier.nameSuffix
        effect = Clean-VariantEffect $cells[4]
      }
      $variants += [pscustomobject]$variant
    }

    if ($variants.Count -gt 0) {
      $groups += [ordered]@{
        relicId = ('{0}_relic_{1:D3}' -f $Source.campaignId, $num)
        campaignId = $Source.campaignId
        number = $num
        name = $name
        sourceAnchor = $anchor
        variantKey = 'difficultyTierId'
        tierSource = ('data/difficulty-tiers.json#campaignDifficultyTiers.{0}' -f $Source.campaignId)
        fallbackTierId = $Source.defaultTierId
        variants = $variants
      }
    }
  }

  $expected = if ($null -ne $Source.expectedGroups) { [int]$Source.expectedGroups } else { $range.maxNumber - $range.minNumber + 1 }
  if ($groups.Count -ne $expected) {
    throw "Expected $expected $($Source.campaignId) variant groups, got $($groups.Count). Update data/difficulty-variant-sources.json if the wiki range changed."
  }
  $groups
}

$config = Get-Content -LiteralPath $ConfigPath -Encoding UTF8 -Raw | ConvertFrom-Json
$sources = As-Array $config.sources | Where-Object { $_.enabled -ne $false }
if ($sources.Count -eq 0) { throw "No enabled difficulty variant sources in $ConfigPath." }

$tierMap = [ordered]@{}
$groups = @()
foreach ($source in $sources) {
  $range = Get-RelicRange $source
  $appliesTo = if ($source.appliesTo) { As-Array $source.appliesTo } else { @('{0}_relic_{1:D3}..{0}_relic_{2:D3}' -f $source.campaignId, $range.minNumber, $range.maxNumber) }
  $tiers = @()
  foreach ($tier in (As-Array $source.tiers)) {
    $tiers += [ordered]@{
      id = $tier.id
      label = $tier.label
      minDifficulty = $tier.minDifficulty
      maxDifficulty = $tier.maxDifficulty
      nameSuffix = $tier.nameSuffix
    }
  }
  $tierMap[$source.campaignId] = [ordered]@{
    campaignId = $source.campaignId
    inputField = if ($source.inputField) { $source.inputField } else { $config.meta.inputField }
    derivedField = if ($source.derivedField) { $source.derivedField } else { $config.meta.derivedField }
    defaultTierId = $source.defaultTierId
    appliesTo = $appliesTo
    sourceCategory = $source.sourceCategory
    resolution = if ($source.resolution) { $source.resolution } else { $config.meta.resolution }
    tiers = $tiers
  }
  $groups += Get-DifficultyVariantGroups $source
}

$tierDoc = [ordered]@{
  version = 1
  meta = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd')
    sourceConfig = 'data/difficulty-variant-sources.json'
    purpose = 'Campaign-specific mapping from numeric run difficulty to difficulty variant tier ID.'
  }
  campaignDifficultyTiers = $tierMap
}
$variantDoc = [ordered]@{
  version = 1
  meta = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd')
    sourceConfig = 'data/difficulty-variant-sources.json'
    source = 'arknights.wikiru.jp configured relic tables'
    purpose = 'Difficulty-dependent relic effect variants layered over data/relics.json.'
  }
  variantGroups = $groups
}

$tierPath = Join-Path $ProjectRoot 'data\difficulty-tiers.json'
$variantPath = Join-Path $ProjectRoot 'data\relic-effect-variants.json'
[System.IO.File]::WriteAllText($tierPath, ($tierDoc | ConvertTo-Json -Depth 16).Replace("`r`n", "`n"), $Utf8NoBom)
[System.IO.File]::WriteAllText($variantPath, ($variantDoc | ConvertTo-Json -Depth 16).Replace("`r`n", "`n"), $Utf8NoBom)
"Wrote $($sources.Count) tier mappings to $tierPath"
"Wrote $($groups.Count) variant groups to $variantPath"