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

$CampaignSourcePath = Join-Path $ProjectRoot 'data\wikiru-campaign-sources.json'
$CampaignSourceDoc = Get-Content -LiteralPath $CampaignSourcePath -Raw -Encoding UTF8 | ConvertFrom-Json
$Campaigns = As-Array $CampaignSourceDoc.campaigns
if ($Campaigns.Count -eq 0) { throw "No campaigns configured in $CampaignSourcePath." }

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
  $t = $t -replace '~', ''
  $t = $t -replace "''", ''
  $t = $t -replace '<([^<>]*[\u3040-\u30ff\u3400-\u9fff][^<>]*)>', '＜$1＞'
  $t = $t -replace '<[^>]+>', ''
  $t = $t -replace '\(\([^\)]*\)\)', ''
  $t = $t -replace '\s+', ' '
  $t.Trim()
}

function Clean-WikiEffectText([string]$Text) {
  if ($null -eq $Text) { return '' }
  $t = $Text.Trim()
  if ($t.StartsWith('|')) { $t = $t.Trim('|') }
  $t = $t -replace '^BGCOLOR\([^\)]*\):', ''
  $t = $t -replace '^(?:CENTER|LEFT|RIGHT):', ''
  $t = $t -replace '^~', ''
  $t = $t -replace '^(?:CENTER|LEFT|RIGHT):', ''
  if ($t -match '^&nobold\{(?<inner>[\s\S]*)\};$') {
    $t = $matches.inner
  }
  while ($t -match '&color\([^\)]*\)\{([^{}]*)\};') {
    $t = [regex]::Replace($t, '&color\([^\)]*\)\{([^{}]*)\};', '$1')
  }
  $t = $t -replace '&br\s*/?;', ' '
  $t = $t -replace '&ensp;|&thinsp;|&nbsp;', ' '
  $t = $t -replace '\[\[([^\]>]+)>[^\]]+\]\]', '$1'
  $t = $t -replace '\[\[([^\]]+)\]\]', '$1'
  $t = $t -replace '&tooltip\(([^)]*)\)(?:\{[^{}]*\})?;', '$1'
  $t = $t -replace "''", ''
  $t = $t -replace '~', ''
  $t = $t -replace '<([^<>]*[\u3040-\u30ff\u3400-\u9fff][^<>]*)>', '＜$1＞'
  $t = $t -replace '<[^>]+>', ''
  $t = $t -replace '\s+', ' '
  $t.Trim()
}

function Clean-DifficultyVariantEffectText([string]$Text) {
  $clean = Clean-WikiEffectText $Text
  $clean = $clean -replace '\s*\[[+\-][^\]]+\]', ''
  $clean = $clean -replace '\s+', ' '
  $clean.Trim()
}

function Get-Is4DifficultyTierForLabel([string]$Label) {
  switch ($Label) {
    '通常化' { return [PSCustomObject]@{ tierId='normal'; label='通常化'; minDifficulty=0; maxDifficulty=2; nameSuffix=$null } }
    '寒冷化' { return [PSCustomObject]@{ tierId='cold'; label='寒冷化'; minDifficulty=3; maxDifficulty=5; nameSuffix='α' } }
    '凍土化' { return [PSCustomObject]@{ tierId='frozen'; label='凍土化'; minDifficulty=6; maxDifficulty=8; nameSuffix='β' } }
    '極地化' { return [PSCustomObject]@{ tierId='polar'; label='極地化'; minDifficulty=9; maxDifficulty=$null; nameSuffix='γ' } }
    default { return $null }
  }
}


function Get-Is4DifficultyVariantsFromBlock([string[]]$BlockLines) {
  $variants = @()
  foreach ($row in $BlockLines) {
    $trim = $row.Trim()
    if (-not $trim.StartsWith('|')) { continue }
    $cells = Split-WikiRow $trim
    if ($cells.Count -lt 5) { continue }
    $tier = Get-Is4DifficultyTierForLabel (Clean-WikiText $cells[3])
    if ($null -eq $tier) { continue }
    $variants += [PSCustomObject]@{
      tierId = $tier.tierId
      label = $tier.label
      minDifficulty = $tier.minDifficulty
      maxDifficulty = $tier.maxDifficulty
      nameSuffix = $tier.nameSuffix
      effect = Clean-DifficultyVariantEffectText $cells[4]
    }
  }
  $variants
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

function Get-RelicDetailsFromBlock([string[]]$BlockLines) {
  $result = [PSCustomObject]@{
    price = $null
    exchange = $null
    effect = $null
    flavorText = $null
    effectVariants = @()
  }

  for ($i = 0; $i -lt $BlockLines.Count; $i++) {
    $line = $BlockLines[$i].Trim()
    if (-not ($line.StartsWith('|') -and $line -match '~効果')) { continue }

    $headerCells = Split-WikiRow $line
    $cleanHeader = @($headerCells | ForEach-Object { Clean-WikiText $_ })
    $effectIndex = -1
    $priceIndex = -1
    $exchangeIndex = -1
    for ($h = 0; $h -lt $cleanHeader.Count; $h++) {
      if ($cleanHeader[$h] -eq '効果') { $effectIndex = $h }
      if ($cleanHeader[$h] -eq '価格') { $priceIndex = $h }
      if ($cleanHeader[$h] -eq '交換') { $exchangeIndex = $h }
    }
    if ($effectIndex -lt 0) { continue }

    $foundEffect = $false
    for ($j = $i + 1; $j -lt $BlockLines.Count; $j++) {
      $row = $BlockLines[$j].Trim()
      if (-not $row.StartsWith('|')) { continue }
      $cells = Split-WikiRow $row
      if ($cells.Count -le $effectIndex) { continue }
      $cleanCells = @($cells | ForEach-Object { Clean-WikiText $_ })
      if ($cleanCells[0] -match 'ロック解除条件') { break }

      if ($priceIndex -ge 0 -and $priceIndex -lt $cleanCells.Count -and $cleanCells[$priceIndex] -ne '' -and $cleanCells[$priceIndex] -ne '~') {
        $result.price = $cleanCells[$priceIndex]
      }
      if ($exchangeIndex -ge 0 -and $exchangeIndex -lt $cleanCells.Count -and $cleanCells[$exchangeIndex] -ne '' -and $cleanCells[$exchangeIndex] -ne '~') {
        $result.exchange = $cleanCells[$exchangeIndex]
      }

      $effectText = Clean-DifficultyVariantEffectText $cells[$effectIndex]
      if ($effectText -eq '' -or $effectText -eq '効果') { continue }

      $tier = $null
      if ($effectIndex -gt 0 -and ($effectIndex - 1) -lt $cleanCells.Count) {
        $tier = Get-Is4DifficultyTierForLabel $cleanCells[$effectIndex - 1]
      }

      if ($null -ne $tier) {
        $result.effectVariants += [PSCustomObject]@{
          tierId = $tier.tierId
          label = $tier.label
          minDifficulty = $tier.minDifficulty
          maxDifficulty = $tier.maxDifficulty
          nameSuffix = $tier.nameSuffix
          effect = $effectText
        }
        if ([string]::IsNullOrWhiteSpace($result.effect)) { $result.effect = $effectText }
        $foundEffect = $true
        continue
      }

      if ($foundEffect) {
        if ([string]::IsNullOrWhiteSpace($result.flavorText) -and $effectText -ne $result.effect) {
          $result.flavorText = $effectText
        }
        return $result
      }

      $result.effect = $effectText
      $foundEffect = $true

      for ($k = $j + 1; $k -lt $BlockLines.Count; $k++) {
        $flavorRow = $BlockLines[$k].Trim()
        if (-not $flavorRow.StartsWith('|')) { break }
        $flavorCells = Split-WikiRow $flavorRow
        if ($flavorCells.Count -le $effectIndex) { continue }
        $cleanFlavorCells = @($flavorCells | ForEach-Object { Clean-WikiText $_ })
        if ($cleanFlavorCells[0] -match 'ロック解除条件') { break }
        $flavorText = Clean-WikiEffectText $flavorCells[$effectIndex]
        if ($flavorText -ne '' -and $flavorText -ne $result.effect) {
          $result.flavorText = $flavorText
          break
        }
      }
      return $result
    }
  }

  $result
}

function Get-MimicSquadEffectOptions([string]$Source) {
  $options = @()
  $inRegion = $false
  $pending = $null
  $index = 0

  foreach ($rawLine in ($Source -split "`n")) {
    $line = $rawLine.Trim()
    if ($line -match '^#region\(奇想天外分隊の組み合わせ一覧\)') {
      $inRegion = $true
      continue
    }
    if ($inRegion -and $line -match '^#endregion') { break }
    if (-not $inRegion -or -not $line.StartsWith('|')) { continue }

    $cells = Split-WikiRow $line
    if ($cells.Count -lt 2) { continue }
    $sourceName = Clean-WikiText $cells[0]
    $effectRaw = $cells[1].Trim()
    if ([string]::IsNullOrWhiteSpace($sourceName) -or $sourceName -eq '組み合わせ') { continue }

    if ($effectRaw -eq '~') {
      if ($null -ne $pending) {
        $pending.combinationSources += $sourceName
        $index++
        $comboLabel = ($pending.combinationSources -join ' + ')
        $options += [PSCustomObject]@{
          id = ('is5_sarkaz_mimic_{0:D2}' -f $index)
          label = ('組み合わせ{0:D2}: {1}' -f $index, $comboLabel)
          combinationSources = $pending.combinationSources
          effect = $pending.effect
        }
        $pending = $null
      }
      continue
    }

    if ($effectRaw -notmatch 'BGCOLOR') { continue }
    $effect = Clean-WikiEffectText $effectRaw
    if ([string]::IsNullOrWhiteSpace($effect) -or $effect -eq '効果') { continue }
    $pending = [PSCustomObject]@{
      combinationSources = @($sourceName)
      effect = $effect
    }
  }

  if ($null -ne $pending) {
    $index++
    $comboLabel = ($pending.combinationSources -join ' + ')
    $options += [PSCustomObject]@{
      id = ('is5_sarkaz_mimic_{0:D2}' -f $index)
      label = ('組み合わせ{0:D2}: {1}' -f $index, $comboLabel)
      combinationSources = $pending.combinationSources
      effect = $pending.effect
    }
  }

  $options
}

function Get-SuiShadowEffectOptions([string]$Source) {
  $options = @()
  $inRegion = $false
  $index = 0
  foreach ($rawLine in ($Source -split "`n")) {
    $line = $rawLine.Trim()
    if ($line -match '^#region\(歳影反響分隊の効果一覧\)') {
      $inRegion = $true
      continue
    }
    if ($inRegion -and $line -match '^#endregion') { break }
    if (-not $inRegion -or -not $line.StartsWith('|') -or $line -notmatch 'BGCOLOR') { continue }

    $cells = Split-WikiRow $line
    if ($cells.Count -lt 1) { continue }
    $effect = Clean-WikiEffectText $line
    if ([string]::IsNullOrWhiteSpace($effect) -or $effect -eq '効果' -or $effect -eq '400') { continue }

    $index++
    $labelText = if ($effect.Length -gt 28) { $effect.Substring(0, 28) + '...' } else { $effect }
    $options += [PSCustomObject]@{
      id = ('is6_sui_shadow_echo_{0:D2}' -f $index)
      label = ('効果{0:D2}: {1}' -f $index, $labelText)
      effect = $effect
    }
  }
  $options
}

$AllRelics = @()
$AllSquads = @()
$SummaryRows = @()

foreach ($campaign in $Campaigns) {
  $mainSource = Get-WikiSource $campaign.page
  $relicSource = Get-WikiSource ($campaign.page + '/秘宝一覧')

  $category = $null
  $numbers = New-Object System.Collections.Generic.List[int]
  $relicCountBefore = $AllRelics.Count
  $relicLines = $relicSource -split "`n"
  for ($ri = 0; $ri -lt $relicLines.Count; $ri++) {
    $line = $relicLines[$ri].Trim()
    if ($line -match '^\*+(?<cat>No\.\d+.*?|PCS\?.*?|.+?)\s+\[#') {
      $category = Clean-WikiText $matches.cat
      continue
    }
    if ($line -match '^#shadowheader\(3,(?:(?:No\.(?<num>\d+))|(?<code>PCS\d+))\s*(?<name>.*?)(?:\s*\[#(?<anchor>[^\]]+)\])?\)$') {
      $isNumberedRelic = $matches.ContainsKey('num') -and -not [string]::IsNullOrWhiteSpace($matches.num)
      $num = if ($isNumberedRelic) { [int]$matches.num } else { $null }
      $code = if ($matches.ContainsKey('code') -and -not [string]::IsNullOrWhiteSpace($matches.code)) { $matches.code } else { $null }
      $relicName = Clean-WikiText $matches.name
      $anchor = if ($matches.ContainsKey('anchor') -and -not [string]::IsNullOrWhiteSpace($matches.anchor)) { $matches.anchor } elseif ($isNumberedRelic) { 'No' + $num } else { $code }
      $blockEnd = $relicLines.Count - 1
      for ($bi = $ri + 1; $bi -lt $relicLines.Count; $bi++) {
        if ($relicLines[$bi].Trim() -match '^#shadowheader\(3,(?:No\.|PCS\d+)') {
          $blockEnd = $bi - 1
          break
        }
      }
      $details = Get-RelicDetailsFromBlock $relicLines[$ri..$blockEnd]

      if ($isNumberedRelic) { $numbers.Add($num) }
      $idSuffix = if ($isNumberedRelic) { '{0:D3}' -f $num } else { $code.ToLowerInvariant() }
      $relicObject = [ordered]@{
        id = ('{0}_relic_{1}' -f $campaign.id, $idSuffix)
        campaignId = $campaign.id
        number = $num
        name = $relicName
        category = $category
        price = $details.price
        exchange = $details.exchange
        effect = $details.effect
        flavorText = $details.flavorText
        sourceAnchor = $anchor
      }
      if ($null -ne $code) { $relicObject.code = $code }
      if ($details.effectVariants -and @($details.effectVariants).Count -gt 0) { $relicObject.effectVariants = @($details.effectVariants) }
      $AllRelics += [PSCustomObject]$relicObject
    }
  }

  $inSquad = $false
  $startedSquadTable = $false
  $lastSquad = $null
  $squadIndex = 0
  $squadCountBefore = $AllSquads.Count
  foreach ($line in ($mainSource -split "`n")) {
    if ($line -match '^\*\*戦術分隊') {
      $inSquad = $true
      $startedSquadTable = $false
      continue
    }
    if ($inSquad -and $startedSquadTable -and $line -match '^\*\*') { break }
    if (-not $inSquad -or -not $line.Trim().StartsWith('|')) { continue }
    $cells = Split-WikiRow $line
    if ($cells.Count -lt 4) { continue }
    $cleanCells = @($cells | ForEach-Object { Clean-WikiText $_ })
    if ($cleanCells[0] -match '画像|アイコン|使用可能分隊|分隊制限' -or $cleanCells[1] -match '^名前$|^説明$') { continue }

    $rawName = $cells[1].Trim()
    $name = $cleanCells[1]
    $effect = $cleanCells[2]
    if ([string]::IsNullOrWhiteSpace($effect)) { continue }

    if (($rawName -eq '~' -or $name -eq '') -and $lastSquad -ne $null) {
      $lastSquad.upgrades += [PSCustomObject]@{ effect = $effect }
      continue
    }
    if ($name -notmatch '分隊$') { continue }

    $startedSquadTable = $true
    $squadIndex++
    $squad = [PSCustomObject]@{
      id = ('{0}_squad_{1:D2}' -f $campaign.id, $squadIndex)
      campaignId = $campaign.id
      name = $name
      effect = $effect
      upgrades = @()
    }
    $AllSquads += $squad
    $lastSquad = $squad
  }

  if ($campaign.id -eq 'is5_sarkaz') {
    $mimicSquad = $AllSquads | Where-Object { $_.campaignId -eq 'is5_sarkaz' -and $_.name -eq '奇想天外分隊' } | Select-Object -First 1
    if ($null -ne $mimicSquad) {
      $mimicSquad | Add-Member -MemberType NoteProperty -Name randomEffectOptions -Value (Get-MimicSquadEffectOptions $mainSource) -Force
    }
  }

  if ($campaign.id -eq 'is6_sui') {
    $shadowSquad = $AllSquads | Where-Object { $_.campaignId -eq 'is6_sui' -and $_.name -eq '歳影反響分隊' } | Select-Object -First 1
    if ($null -ne $shadowSquad) {
      $shadowSquad | Add-Member -MemberType NoteProperty -Name randomEffectOptions -Value (Get-SuiShadowEffectOptions $mainSource) -Force
    }
  }

  $distinct = @($numbers | Sort-Object -Unique)
  $max = if ($distinct.Count -gt 0) { ($distinct | Measure-Object -Maximum).Maximum } else { 0 }
  $missing = @()
  if ($max -gt 0) {
    for ($i = 1; $i -le $max; $i++) {
      if ($distinct -notcontains $i) { $missing += $i }
    }
  }

  $SummaryRows += [PSCustomObject]@{
    campaignId = $campaign.id
    title = $campaign.title
    relics = $AllRelics.Count - $relicCountBefore
    squads = $AllSquads.Count - $squadCountBefore
    maxRelicNo = $max
    missingRelicNos = $missing
  }
}

$meta = [PSCustomObject]@{
  generatedAt = $GeneratedAt
  source = 'arknights.wikiru.jp PukiWiki source pages'
  note = 'Extracted for OBS overlay state display. Relics include names, categories, prices, exchange flags, base effect text, and flavor text. Difficulty-dependent variants are generated separately.'
}

$sortedRelics = $AllRelics | Sort-Object campaignId, @{ Expression = {
  if ($null -ne $_.number) { return [double]$_.number }
  if ($_.PSObject.Properties.Name -contains 'code') {
    $match = [regex]::Match([string]$_.code, '^PCS(?<n>\d+)$')
    if ($match.Success) { return 213 + ([double]$match.Groups['n'].Value / 100) }
  }
  return 999999
}}, id
$relicDoc = [PSCustomObject]@{ meta = $meta; relics = $sortedRelics }
$squadDoc = [PSCustomObject]@{ meta = $meta; squads = $AllSquads | Sort-Object campaignId, id }
$relicPath = Join-Path $ProjectRoot 'data\relics.json'
[System.IO.File]::WriteAllText($relicPath, ($relicDoc | ConvertTo-Json -Depth 12), $Utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $ProjectRoot 'data\squads.json'), ($squadDoc | ConvertTo-Json -Depth 12), $Utf8NoBom)

$campaignsJson = Get-Content -LiteralPath (Join-Path $ProjectRoot 'data\campaigns.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# Integrated Strategies Data Summary')
$lines.Add('')
$lines.Add("Generated from arknights.wikiru.jp on $GeneratedAt.")
$lines.Add('')
$lines.Add('This summary is for checking extracted overlay data. Full extracted data is in `data/relics.json` and `data/squads.json`.')
$lines.Add('')
foreach ($campaign in $campaignsJson) {
  $relics = @($relicDoc.relics | Where-Object { $_.campaignId -eq $campaign.id })
  $squads = @($squadDoc.squads | Where-Object { $_.campaignId -eq $campaign.id })
  $row = $SummaryRows | Where-Object { $_.campaignId -eq $campaign.id } | Select-Object -First 1
  $variantRelics = @($relics | Where-Object { $_.PSObject.Properties.Name -contains 'effectVariants' -and @($_.effectVariants).Count -gt 0 })
  $lines.Add(('## {0}' -f $campaign.fullTitle))
  $lines.Add('')
  $lines.Add(('- Campaign ID: `{0}`' -f $campaign.id))
  $lines.Add(('- Relics: {0}' -f $relics.Count))
  $lines.Add(('- Squads: {0}' -f $squads.Count))
  if ($variantRelics.Count -gt 0) {
    $lines.Add(('- Relics with effect variants: {0}' -f $variantRelics.Count))
  }
  if ($row.missingRelicNos.Count -gt 0) {
    $lines.Add(('- Missing relic numbers in source/extraction: {0}' -f ($row.missingRelicNos -join ', ')))
  }
  $lines.Add('')
  $lines.Add('### Relic Categories')
  foreach ($group in ($relics | Group-Object category | Sort-Object Name)) {
    $categoryName = if ([string]::IsNullOrWhiteSpace($group.Name)) { '(uncategorized)' } else { $group.Name }
    $lines.Add(('- {0}: {1}' -f $categoryName, $group.Count))
  }
  $lines.Add('')
  $lines.Add('### Squads')
  foreach ($squad in $squads) {
    $upgradeText = if ($squad.upgrades -and $squad.upgrades.Count -gt 0) { (' + upgrades x{0}' -f $squad.upgrades.Count) } else { '' }
    $lines.Add(('- {0}{1}' -f $squad.name, $upgradeText))
  }
  $lines.Add('')
}
[System.IO.File]::WriteAllText((Join-Path $ProjectRoot 'docs\data-summary.md'), ($lines -join "`n") + "`n", $Utf8NoBom)

$SummaryRows | Format-Table -AutoSize
"TOTAL relics=$($AllRelics.Count) squads=$($AllSquads.Count)"
