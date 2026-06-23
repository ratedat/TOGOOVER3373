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

function As-Array($Value) {
  $items = @()
  foreach ($item in $Value) { $items += $item }
  $items
}

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

function Get-WikiSource([string]$Page) {
  $url = 'https://arknights.wikiru.jp/?cmd=source&page=' + [uri]::EscapeDataString($Page)
  $html = (curl.exe -sS -L $url 2>$null) -join "`n"
  $match = [regex]::Match($html, '<pre id="source">(?<source>[\s\S]*?)</pre>')
  if (-not $match.Success) { throw "Could not find source pre for $Page" }
  [System.Net.WebUtility]::HtmlDecode($match.Groups['source'].Value)
}

function Split-WikiTableLine([string]$Line) {
  $line = $Line.Trim()
  if ($line.StartsWith('|')) { $line = $line.Substring(1) }
  if ($line.EndsWith('|')) { $line = $line.Substring(0, $line.Length - 1) }
  $line -split '\|'
}

function ConvertTo-PlainText([string]$Cell) {
  if ($null -eq $Cell) { return '' }
  $text = [System.Net.WebUtility]::HtmlDecode($Cell)
  $text = $text -replace '&br;', "`n"
  $text = $text -replace '&ensp;|&nbsp;', ' '
  $text = $text -replace '&tooltip\((?<v>[^\)]+)\);', '${v}'
  $guard = 0
  while ($text -match '&color\([^\)]*\)\{([^{}]*)\};' -and $guard -lt 20) {
    $text = [regex]::Replace($text, '&color\([^\)]*\)\{(?<v>[^{}]*)\};', '${v}')
    $guard++
  }
  $text = [regex]::Replace($text, '\[\[(?<label>[^>\]]+)>(?<target>[^\]]+)\]\]', '${label}')
  $text = [regex]::Replace($text, '\[\[(?<label>[^\]]+)\]\]', '${label}')
  $text = [regex]::Replace($text, '&(?:ref|attachref)\(.*?\);', '')
  $text = [regex]::Replace($text, '&[a-zA-Z0-9_]+;', '')
  $text = $text -replace '[ \t]+', ' '
  (($text -split "`n") | ForEach-Object { $_.Trim() } | Where-Object { $_ }) -join "`n"
}

function Get-PlainTextList([string]$Cell) {
  $text = ConvertTo-PlainText $Cell
  if ([string]::IsNullOrWhiteSpace($text)) { return @() }
  @($text -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique)
}

function Get-WikiLinkLabel([string]$Cell) {
  if ($Cell -match '\[\[(?<inner>[^\]]+)\]\]') {
    $inner = $Matches['inner']
    if ($inner -match '^(?<label>.+?)>(?<target>.+)$') { return (ConvertTo-PlainText $Matches['label']) }
    return (ConvertTo-PlainText $inner)
  }
  ConvertTo-PlainText $Cell
}

function Get-WikiLinkTarget([string]$Cell) {
  if ($Cell -match '\[\[(?<inner>[^\]]+)\]\]') {
    $inner = $Matches['inner']
    if ($inner -match '^(?<label>.+?)>(?<target>.+)$') { return (ConvertTo-PlainText $Matches['target']) }
    return (ConvertTo-PlainText $inner)
  }
  ''
}

function Get-ImageInfo([string]$Cell) {
  $match = [regex]::Match($Cell, '&(?:ref|attachref)\((?<args>.*?)\);(?:>(?<target>[^\]]+))?')
  if (-not $match.Success) { return $null }
  $args = @($match.Groups['args'].Value -split ',' | ForEach-Object { $_.Trim() })
  $sourcePath = $args[0].Replace('\\', '/')
  $alt = ''
  if ($args.Count -gt 1) { $alt = $args[$args.Count - 1] }
  [pscustomobject][ordered]@{
    sourcePath = $sourcePath
    alt = $alt
    target = (ConvertTo-PlainText $match.Groups['target'].Value)
  }
}

function New-OperatorId([string]$Name, [string]$SourcePath, [int]$Rarity, [hashtable]$SeenIds) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($SourcePath).ToLowerInvariant()
  if ($base.StartsWith('icon_')) { $base = $base.Substring(5) }
  if ($base.EndsWith('_icon')) { $base = $base.Substring(0, $base.Length - 5) }
  $base = [regex]::Replace($base, '[^a-z0-9]+', '_').Trim('_')
  if ([string]::IsNullOrWhiteSpace($base)) { $base = ('r{0}_{1}' -f $Rarity, ([Math]::Abs($Name.GetHashCode()))) }
  $id = $base
  $suffix = 2
  while ($SeenIds.ContainsKey($id)) {
    $id = '{0}_{1}' -f $base, $suffix
    $suffix++
  }
  $SeenIds[$id] = $true
  $id
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

function Get-OperatorTables($Config) {
  $tables = @()
  try {
    $source = Get-WikiSource $Config.sourcePage
    foreach ($match in [regex]::Matches($source, '#include\((?<page>[^,\)]+),notitle\)')) {
      $page = $match.Groups['page'].Value.Trim()
      $rarityMatch = [regex]::Match($page, $Config.tablePagePattern)
      if (-not $rarityMatch.Success) { continue }
      $tables += [pscustomobject][ordered]@{ rarity = [int]$rarityMatch.Groups['rarity'].Value; page = $page }
    }
  }
  catch {
    $tables = @()
  }
  if ($tables.Count -eq 0) {
    foreach ($table in (As-Array $Config.fallbackTables)) {
      $tables += [pscustomobject][ordered]@{ rarity = [int]$table.rarity; page = [string]$table.page }
    }
  }
  $tables | Sort-Object @{ Expression = 'rarity'; Descending = $true }
}

$configPath = Join-Path $ProjectRoot 'data\wikiru-operator-sources.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$tables = @(Get-OperatorTables $config)
if ($tables.Count -eq 0) { throw 'No operator source tables found.' }

$operators = @()
$manifestRows = @()
$failed = @()
$downloaded = 0
$cached = 0
$seenIds = @{}
$displayOrder = 0

foreach ($table in $tables) {
  $source = Get-WikiSource $table.page
  $lineRecords = @()
  $inJapanUnreleased = $false
  foreach ($sourceLine in ($source -split "`n")) {
    if ($sourceLine -match '^\*\*日本未実装キャラ') {
      $inJapanUnreleased = $true
      continue
    }
    if ($inJapanUnreleased -and $sourceLine -match '^#endregion') {
      $inJapanUnreleased = $false
      continue
    }
    if ($sourceLine -match '^\|\[\[&(?:ref|attachref)\(') {
      $lineRecords += [pscustomobject][ordered]@{
        line = $sourceLine
        isJapanUnreleased = $inJapanUnreleased
        sourceSection = if ($inJapanUnreleased) { 'japan_unreleased' } else { 'standard' }
      }
    }
  }
  foreach ($lineRecord in $lineRecords) {
    $line = $lineRecord.line
    $isJapanUnreleased = [bool]$lineRecord.isJapanUnreleased
    $sourceSection = [string]$lineRecord.sourceSection
    $cells = @(Split-WikiTableLine $line)
    if ($cells.Count -lt 4) { continue }
    $imageInfo = Get-ImageInfo $cells[0]
    if ($null -eq $imageInfo -or [string]::IsNullOrWhiteSpace($imageInfo.sourcePath)) { continue }
    $name = Get-WikiLinkLabel $cells[1]
    if ([string]::IsNullOrWhiteSpace($name)) { $name = $imageInfo.alt }
    $pageName = Get-WikiLinkTarget $cells[1]
    if ([string]::IsNullOrWhiteSpace($pageName)) { $pageName = $imageInfo.target }
    $class = ConvertTo-PlainText $cells[2]
    $branch = ConvertTo-PlainText $cells[3]
    $obtainMethods = @()
    $recruitmentTags = @()
    if ($cells.Count -gt 12) { $obtainMethods = @(Get-PlainTextList $cells[12]) }
    if ($cells.Count -gt 13) { $recruitmentTags = @(Get-PlainTextList $cells[13]) }

    $id = New-OperatorId $name $imageInfo.sourcePath ([int]$table.rarity) $seenIds
    $sourceUrl = Convert-SourcePathToImageUrl $imageInfo.sourcePath
    $localRelPath = ('assets/operators/wikiru/{0}' -f $imageInfo.sourcePath).Replace('\\', '/').Replace('//', '/')
    $localPath = Join-Path $ProjectRoot ($localRelPath -replace '/', '\')
    try {
      $status = Download-Image $imageInfo.sourcePath $localPath
      if ($status -eq 'downloaded') { $downloaded++ } else { $cached++ }
    }
    catch {
      $failed += [ordered]@{ operatorId = $id; name = $name; rarity = [int]$table.rarity; sourcePath = $imageInfo.sourcePath; sourceUrl = $sourceUrl; error = $_.Exception.Message }
    }

    $image = [ordered]@{
      source = 'arknights.wikiru.jp'
      sourcePath = $imageInfo.sourcePath
      sourceUrl = $sourceUrl
      localPath = $localRelPath
    }
    $operators += [ordered]@{
      id = $id
      name = $name
      rarity = [int]$table.rarity
      class = $class
      branch = $branch
      obtainMethods = $obtainMethods
      recruitmentTags = $recruitmentTags
      wikiPage = $pageName
      sourceTable = $table.page
      sourceSection = $sourceSection
      isJapanUnreleased = $isJapanUnreleased
      hiddenByDefault = $isJapanUnreleased
      displayOrder = $displayOrder
      image = $image
    }
    $manifestRows += [ordered]@{ operatorId = $id; name = $name; rarity = [int]$table.rarity; sourceTable = $table.page; sourceSection = $sourceSection; isJapanUnreleased = $isJapanUnreleased; sourcePath = $imageInfo.sourcePath; sourceUrl = $sourceUrl; localPath = $localRelPath }
    $displayOrder++
  }
}

$operatorDoc = [ordered]@{
  version = 1
  meta = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd')
    source = 'arknights.wikiru.jp operator tables'
    sourcePage = $config.sourcePage
    sourceUrl = $config.meta.sourceUrl
    note = 'Generated by tools/sync-operator-data.ps1. Re-run the script after wiki updates to add new operators and images.'
  }
  operators = $operators
}
[System.IO.File]::WriteAllText((Join-Path $ProjectRoot 'data\operators.json'), ($operatorDoc | ConvertTo-Json -Depth 14).Replace("`r`n", "`n"), $Utf8NoBom)

$manifest = [ordered]@{
  version = 1
  meta = [ordered]@{
    generatedAt = (Get-Date -Format 'yyyy-MM-dd')
    source = 'arknights.wikiru.jp operator table image refs'
    assetRoot = 'assets/operators/wikiru'
  }
  summary = [ordered]@{
    operators = $operators.Count
    withImages = $manifestRows.Count
    failedDownloads = $failed.Count
    downloaded = $downloaded
    cached = $cached
    uniqueSourceImages = @($manifestRows | ForEach-Object { $_.sourcePath } | Sort-Object -Unique).Count
    japanUnreleased = @($operators | Where-Object { $_['isJapanUnreleased'] }).Count
  }
  images = $manifestRows
  failed = $failed
}
[System.IO.File]::WriteAllText((Join-Path $ProjectRoot 'data\operator-images.json'), ($manifest | ConvertTo-Json -Depth 12).Replace("`r`n", "`n"), $Utf8NoBom)

if ($failed.Count -gt 0) { throw "Operator image sync had $($failed.Count) download failures. See data/operator-images.json." }
"Operator data synced: operators=$($operators.Count) uniqueSourceImages=$($manifest.summary.uniqueSourceImages) downloaded=$downloaded cached=$cached"