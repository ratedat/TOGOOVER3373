param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$ForceDownload
)

chcp 65001 | Out-Null
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$ErrorActionPreference = 'Stop'

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$BaseImageUrl = 'https://arknights.wikiru.jp/'

function Convert-SourcePathToImageUrl([string]$SourcePath) {
  $parts = $SourcePath -split '/'
  $encodedParts = @()
  foreach ($part in $parts) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($part)
    $encodedParts += (-join ($bytes | ForEach-Object { $_.ToString('X2') }))
  }
  $extension = [System.IO.Path]::GetExtension($SourcePath)
  if ([string]::IsNullOrWhiteSpace($extension)) { $extension = '.png' }
  $BaseImageUrl + 'attach2/' + ($encodedParts -join '_') + $extension
}

function As-Array($Value) {
  $items = @()
  foreach ($item in $Value) { $items += $item }
  $items
}

function Normalize-Anchor([string]$Anchor) {
  if ([string]::IsNullOrWhiteSpace($Anchor)) { return '' }
  $a = $Anchor.Trim().TrimStart('#')
  $noMatch = [regex]::Match($a, '^No\.?0*(?<n>\d+)$', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($noMatch.Success) { return ('No{0}' -f [int]$noMatch.Groups['n'].Value) }
  $pcsMatch = [regex]::Match($a, '^PCS0*(?<n>\d+)$', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($pcsMatch.Success) { return ('PCS{0:D2}' -f [int]$pcsMatch.Groups['n'].Value) }
  $a
}

function Get-WikiSource([string]$Page) {
  $url = 'https://arknights.wikiru.jp/?cmd=source&page=' + [uri]::EscapeDataString($Page)
  $html = (curl.exe -sS -L $url 2>$null) -join "`n"
  $match = [regex]::Match($html, '<pre id="source">(?<source>[\s\S]*?)</pre>')
  if (-not $match.Success) { throw "Could not find source pre for $Page" }
  [System.Net.WebUtility]::HtmlDecode($match.Groups['source'].Value)
}

function Add-ImageMapEntry([hashtable]$Map, [string]$CampaignId, [string]$Anchor, [string]$SourcePath) {
  $normalized = Normalize-Anchor $Anchor
  if ([string]::IsNullOrWhiteSpace($normalized) -or [string]::IsNullOrWhiteSpace($SourcePath)) { return }
  $key = '{0}|{1}' -f $CampaignId, $normalized
  if (-not $Map.ContainsKey($key)) {
    $Map[$key] = $SourcePath.Replace('\\', '/')
  }
}

function Get-ImageMapForCampaign($Campaign) {
  $source = Get-WikiSource ($Campaign.page + '/秘宝一覧')
  $map = @{}

  $linkPattern = '&(?:attachref|ref)\((?<path>img/[^,\);\s]+)[^;]*\);>\#(?<anchor>[A-Za-z0-9_]+)'
  foreach ($match in [regex]::Matches($source, $linkPattern)) {
    Add-ImageMapEntry $map $Campaign.id $match.Groups['anchor'].Value $match.Groups['path'].Value
  }

  $lines = $source -split "`n"
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i].Trim()
    $header = [regex]::Match($line, '^#shadowheader\(3,(?<label>No\.?\d+|PCS\d+)')
    if (-not $header.Success) { continue }
    $anchor = Normalize-Anchor $header.Groups['label'].Value
    $end = $lines.Count - 1
    for ($j = $i + 1; $j -lt $lines.Count; $j++) {
      if ($lines[$j].Trim() -match '^#shadowheader\(3,(?:No\.?\d+|PCS\d+)') { $end = $j - 1; break }
    }
    $block = ($lines[$i..$end] -join "`n")
    $image = [regex]::Match($block, '&(?:attachref|ref)\((?<path>img/[^,\);\s]+)')
    if ($image.Success) {
      Add-ImageMapEntry $map $Campaign.id $anchor $image.Groups['path'].Value
    }
  }

  $map
}

function Test-ImageFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  $file = Get-Item -LiteralPath $Path
  if ($file.Length -le 0) { return $false }
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $buffer = New-Object byte[] 12
    $read = $stream.Read($buffer, 0, $buffer.Length)
    if ($read -ge 8 -and $buffer[0] -eq 0x89 -and $buffer[1] -eq 0x50 -and $buffer[2] -eq 0x4E -and $buffer[3] -eq 0x47) { return $true }
    if ($read -ge 3 -and $buffer[0] -eq 0xFF -and $buffer[1] -eq 0xD8 -and $buffer[2] -eq 0xFF) { return $true }
    if ($read -ge 6) {
      $sig = [System.Text.Encoding]::ASCII.GetString($buffer, 0, 6)
      if ($sig -eq 'GIF87a' -or $sig -eq 'GIF89a') { return $true }
    }
    if ($read -ge 12) {
      $riff = [System.Text.Encoding]::ASCII.GetString($buffer, 0, 4)
      $webp = [System.Text.Encoding]::ASCII.GetString($buffer, 8, 4)
      if ($riff -eq 'RIFF' -and $webp -eq 'WEBP') { return $true }
    }
    return $false
  }
  finally {
    $stream.Dispose()
  }
}

function Download-Image([string]$SourcePath, [string]$LocalPath) {
  $sourceUrl = Convert-SourcePathToImageUrl $SourcePath
  $parent = Split-Path -Parent $LocalPath
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
  if (-not $ForceDownload -and (Test-ImageFile $LocalPath)) { return 'cached' }

  $tmpPath = $LocalPath + '.download'
  if (Test-Path -LiteralPath $tmpPath) { Remove-Item -LiteralPath $tmpPath -Force }
  & curl.exe -sS -f -L --retry 3 --retry-delay 1 $sourceUrl -o $tmpPath
  if ($LASTEXITCODE -ne 0) { throw "curl failed for $sourceUrl" }
  if (-not (Test-ImageFile $tmpPath)) { throw "Downloaded file is not a recognized image: $sourceUrl" }
  Move-Item -LiteralPath $tmpPath -Destination $LocalPath -Force
  'downloaded'
}

$campaignSourcePath = Join-Path $ProjectRoot 'data\wikiru-campaign-sources.json'
$campaignSourceDoc = Get-Content -LiteralPath $campaignSourcePath -Raw -Encoding UTF8 | ConvertFrom-Json
$campaigns = As-Array $campaignSourceDoc.campaigns
$relicPath = Join-Path $ProjectRoot 'data\relics.json'
$relicDoc = Get-Content -LiteralPath $relicPath -Raw -Encoding UTF8 | ConvertFrom-Json
$relics = As-Array $relicDoc.relics

$imageMap = @{}
foreach ($campaign in $campaigns) {
  $campaignMap = Get-ImageMapForCampaign $campaign
  foreach ($key in $campaignMap.Keys) { $imageMap[$key] = $campaignMap[$key] }
}

$manifestRows = @()
$missingRows = @()
$downloaded = 0
$cached = 0
$failed = @()
foreach ($relic in $relics) {
  $anchorCandidates = @()
  if ($relic.sourceAnchor) { $anchorCandidates += (Normalize-Anchor $relic.sourceAnchor) }
  if ($null -ne $relic.number) {
    $anchorCandidates += ('No{0}' -f [int]$relic.number)
    $anchorCandidates += ('No{0:D3}' -f [int]$relic.number)
  }
  if ($relic.PSObject.Properties.Name -contains 'code' -and $relic.code) { $anchorCandidates += (Normalize-Anchor $relic.code) }
  $anchorCandidates = @($anchorCandidates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)

  $sourcePath = $null
  foreach ($anchor in $anchorCandidates) {
    $key = '{0}|{1}' -f $relic.campaignId, (Normalize-Anchor $anchor)
    if ($imageMap.ContainsKey($key)) { $sourcePath = $imageMap[$key]; break }
  }

  if ([string]::IsNullOrWhiteSpace($sourcePath)) {
    $missingRows += [ordered]@{ relicId=$relic.id; campaignId=$relic.campaignId; sourceAnchor=$relic.sourceAnchor; name=$relic.name }
    continue
  }

  $sourceUrl = Convert-SourcePathToImageUrl $sourcePath
  $localRelPath = ('assets/relics/wikiru/{0}' -f $sourcePath).Replace('\\', '/').Replace('//', '/')
  $localPath = Join-Path $ProjectRoot ($localRelPath -replace '/', '\')
  try {
    $status = Download-Image $sourcePath $localPath
    if ($status -eq 'downloaded') { $downloaded++ } else { $cached++ }
    $imageObject = [pscustomobject][ordered]@{
      source = 'arknights.wikiru.jp'
      sourcePath = $sourcePath
      sourceUrl = $sourceUrl
      localPath = $localRelPath
    }
    if ($relic.PSObject.Properties.Name -contains 'image') {
      $relic.image = $imageObject
    } else {
      $relic | Add-Member -MemberType NoteProperty -Name image -Value $imageObject
    }
    $manifestRows += [ordered]@{ relicId=$relic.id; campaignId=$relic.campaignId; sourceAnchor=$relic.sourceAnchor; sourcePath=$sourcePath; sourceUrl=$sourceUrl; localPath=$localRelPath }
  }
  catch {
    $failed += [ordered]@{ relicId=$relic.id; campaignId=$relic.campaignId; sourcePath=$sourcePath; sourceUrl=$sourceUrl; error=$_.Exception.Message }
  }
}

$imageByRelicId = @{}
foreach ($row in $manifestRows) {
  $imageByRelicId[$row['relicId']] = [pscustomobject][ordered]@{
    source = 'arknights.wikiru.jp'
    sourcePath = $row['sourcePath']
    sourceUrl = $row['sourceUrl']
    localPath = $row['localPath']
  }
}
foreach ($relic in $relicDoc.relics) {
  if (-not $imageByRelicId.ContainsKey($relic.id)) { continue }
  if ($relic.PSObject.Properties.Name -contains 'image') {
    $relic.image = $imageByRelicId[$relic.id]
  } else {
    $relic | Add-Member -MemberType NoteProperty -Name image -Value $imageByRelicId[$relic.id] -Force
  }
}
[System.IO.File]::WriteAllText($relicPath, ($relicDoc | ConvertTo-Json -Depth 16).Replace("`r`n", "`n"), $Utf8NoBom)

$manifest = [ordered]@{
  version = 1
  meta = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd')
    source = 'arknights.wikiru.jp relic list image refs'
    assetRoot = 'assets/relics/wikiru'
  }
  summary = [ordered]@{
    relics = $relics.Count
    withImages = $manifestRows.Count
    missingImages = $missingRows.Count
    failedDownloads = $failed.Count
    downloaded = $downloaded
    cached = $cached
    uniqueSourceImages = @($manifestRows | ForEach-Object { $_.sourcePath } | Sort-Object -Unique).Count
  }
  images = $manifestRows
  missing = $missingRows
  failed = $failed
}
[System.IO.File]::WriteAllText((Join-Path $ProjectRoot 'data\relic-images.json'), ($manifest | ConvertTo-Json -Depth 12).Replace("`r`n", "`n"), $Utf8NoBom)

if ($failed.Count -gt 0) { throw "Image sync had $($failed.Count) download failures. See data/relic-images.json." }
if ($missingRows.Count -gt 0) { throw "Image sync had $($missingRows.Count) missing mappings. See data/relic-images.json." }
"Relic images synced: relics=$($relics.Count) withImages=$($manifestRows.Count) uniqueSourceImages=$($manifest.summary.uniqueSourceImages) downloaded=$downloaded cached=$cached"