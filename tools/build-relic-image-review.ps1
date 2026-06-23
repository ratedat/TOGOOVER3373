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

function As-Array($Value) {
  $items = @()
  foreach ($item in $Value) { $items += $item }
  $items
}

function HtmlEncode-Value([object]$Value) {
  if ($null -eq $Value) { return '' }
  [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

function J([object]$Value) {
  if ($null -eq $Value) { return '' }
  ([string]$Value).Replace('\\', '\\\\').Replace('`r', '').Replace('`n', '\n').Replace('"', '\"')
}

function Get-DisplayNumber($Relic) {
  if ($null -ne $Relic.number) { return ('No.{0:D3}' -f [int]$Relic.number) }
  if ($Relic.sourceAnchor) { return [string]$Relic.sourceAnchor }
  $Relic.id
}

$relicPath = Join-Path $ProjectRoot 'data\relics.json'
$campaignPath = Join-Path $ProjectRoot 'data\campaigns.json'
$imageManifestPath = Join-Path $ProjectRoot 'data\relic-images.json'
$outputPath = Join-Path $ProjectRoot 'review\relic-image-review.html'

$relicDoc = Get-Content -LiteralPath $relicPath -Raw -Encoding UTF8 | ConvertFrom-Json
$relics = As-Array $relicDoc.relics
$campaigns = As-Array (Get-Content -LiteralPath $campaignPath -Raw -Encoding UTF8 | ConvertFrom-Json)
$imageManifest = $null
if (Test-Path -LiteralPath $imageManifestPath) {
  $imageManifest = Get-Content -LiteralPath $imageManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

$campaignById = @{}
foreach ($campaign in $campaigns) { $campaignById[$campaign.id] = $campaign }
$campaignOrder = @{}
for ($i = 0; $i -lt $campaigns.Count; $i++) { $campaignOrder[$campaigns[$i].id] = $i }

$rows = @()
$index = 0
foreach ($relic in $relics) {
  $campaign = $campaignById[$relic.campaignId]
  $order = if ($campaignOrder.ContainsKey($relic.campaignId)) { $campaignOrder[$relic.campaignId] } else { 999 }
  $numSort = if ($null -ne $relic.number) { [int]$relic.number } else { 99999 + $index }
  $localRel = if ($relic.image -and $relic.image.localPath) { ([string]$relic.image.localPath).Replace('\\', '/') } else { '' }
  $localAbs = if ($localRel) { Join-Path $ProjectRoot ($localRel -replace '/', '\') } else { '' }
  $hasFile = $localAbs -and (Test-Path -LiteralPath $localAbs)
  $imageSrc = if ($localRel) { '../' + $localRel } else { '' }
  $rows += [pscustomobject]@{
    relic = $relic
    campaign = $campaign
    campaignOrder = $order
    numberSort = $numSort
    originalIndex = $index
    displayNumber = Get-DisplayNumber $relic
    localRel = $localRel
    imageSrc = $imageSrc
    hasFile = $hasFile
  }
  $index++
}
$rows = $rows | Sort-Object campaignOrder, numberSort, originalIndex

$missingImages = @($rows | Where-Object { -not $_.relic.image }).Count
$missingFiles = @($rows | Where-Object { -not $_.hasFile }).Count
$uniqueImages = @($rows | Where-Object { $_.localRel } | ForEach-Object { $_.localRel } | Sort-Object -Unique).Count
$generatedAt = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

$optionLines = @()
foreach ($campaign in $campaigns) {
  $campaignId = [string]$campaign.id
  $count = @($rows | Where-Object { $_.relic.campaignId -eq $campaignId }).Count
  $optionLines += ('          <option value="{0}">IS#{1} {2} ({3})</option>' -f (HtmlEncode-Value $campaignId), (HtmlEncode-Value $campaign.number), (HtmlEncode-Value $campaign.title), $count)
}
$campaignOptions = $optionLines -join "`n"

$cards = New-Object System.Collections.Generic.List[string]
foreach ($row in $rows) {
  $relic = $row.relic
  $campaign = $row.campaign
  $campaignLabel = if ($campaign) { 'IS#{0} {1}' -f $campaign.number, $campaign.title } else { $relic.campaignId }
  $classes = @('card')
  if (-not $row.hasFile) { $classes += 'is-missing' }
  $searchText = @($relic.name, $row.displayNumber, $relic.id, $relic.category, $relic.effect, $campaignLabel, $row.localRel) -join ' '
  $imageHtml = if ($row.hasFile) {
    '<a class="thumbLink" href="{0}" target="_blank" rel="noreferrer"><img src="{0}" alt="{1}" loading="lazy"></a>' -f (HtmlEncode-Value $row.imageSrc), (HtmlEncode-Value $relic.name)
  } elseif ($row.imageSrc) {
    '<div class="missingThumb">画像ファイルなし<br><span>{0}</span></div>' -f (HtmlEncode-Value $row.localRel)
  } else {
    '<div class="missingThumb">画像メタデータなし</div>'
  }
  $sourceLink = if ($relic.image -and $relic.image.sourceUrl) {
    '<a href="{0}" target="_blank" rel="noreferrer">source</a>' -f (HtmlEncode-Value $relic.image.sourceUrl)
  } else { '<span class="muted">sourceなし</span>' }
  $cardClassHtml = HtmlEncode-Value ($classes -join ' ')
  $campaignIdHtml = HtmlEncode-Value $relic.campaignId
  $searchHtml = HtmlEncode-Value $searchText
  $relicIdHtml = HtmlEncode-Value $relic.id
  $campaignLabelHtml = HtmlEncode-Value $campaignLabel
  $displayNumberHtml = HtmlEncode-Value $row.displayNumber
  $nameHtml = HtmlEncode-Value $relic.name
  $categoryHtml = HtmlEncode-Value $relic.category
  $effectHtml = HtmlEncode-Value $relic.effect
  $localRelHtml = HtmlEncode-Value $row.localRel
  $cards.Add(@"
      <article class="$cardClassHtml" data-campaign="$campaignIdHtml" data-search="$searchHtml" data-relic-id="$relicIdHtml">
        <div class="thumb">$imageHtml</div>
        <div class="body">
          <div class="topline">
            <span class="campaign">$campaignLabelHtml</span>
            <span class="number">$displayNumberHtml</span>
          </div>
          <h2>$nameHtml</h2>
          <div class="meta">$relicIdHtml</div>
          <div class="category">$categoryHtml</div>
          <p class="effect">$effectHtml</p>
          <div class="paths">
            <span>$localRelHtml</span>
            $sourceLink
          </div>
          <div class="reviewControls" role="group" aria-label="review status">
            <button type="button" data-status="ok">OK</button>
            <button type="button" data-status="ng">NG</button>
            <button type="button" data-status="hold">保留</button>
            <button type="button" data-status="clear">解除</button>
          </div>
          <textarea aria-label="memo" placeholder="確認メモ"></textarea>
        </div>
      </article>
"@)
}

$html = @"
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>秘宝画像紐づけレビュー</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #101317;
      --panel: #181d23;
      --panel-2: #20262e;
      --line: #343c46;
      --text: #ecf1f6;
      --muted: #a7b0bb;
      --accent: #72c6a2;
      --warn: #f2b461;
      --bad: #ef7d7d;
      --hold: #92a5ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Yu Gothic UI", "Meiryo", system-ui, sans-serif;
      line-height: 1.5;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 5;
      background: rgba(16, 19, 23, 0.96);
      border-bottom: 1px solid var(--line);
      padding: 14px 18px 16px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 20px;
      letter-spacing: 0;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
      color: var(--muted);
      font-size: 13px;
    }
    .summary span {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 6px;
      padding: 4px 8px;
    }
    .controls {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) 220px 150px;
      gap: 10px;
      align-items: center;
    }
    input, select, textarea, button {
      font: inherit;
    }
    input, select {
      min-height: 36px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel);
      color: var(--text);
      padding: 0 10px;
    }
    main {
      padding: 18px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 12px;
    }
    .card {
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr);
      gap: 12px;
      min-height: 184px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 12px;
    }
    .card.is-hidden { display: none; }
    .card.is-missing { border-color: var(--bad); }
    .card.status-ok { border-color: var(--accent); }
    .card.status-ng { border-color: var(--bad); }
    .card.status-hold { border-color: var(--hold); }
    .thumb {
      width: 96px;
      height: 96px;
      display: grid;
      place-items: center;
      background: #0d1014;
      border: 1px solid var(--line);
      border-radius: 6px;
      overflow: hidden;
    }
    .thumb img {
      max-width: 88px;
      max-height: 88px;
      image-rendering: auto;
      display: block;
    }
    .thumbLink {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
    }
    .missingThumb {
      padding: 8px;
      color: var(--bad);
      font-size: 12px;
      text-align: center;
      overflow-wrap: anywhere;
    }
    .missingThumb span { color: var(--muted); }
    .body { min-width: 0; }
    .topline {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .campaign, .number, .meta, .category, .paths span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    h2 {
      margin: 2px 0 2px;
      font-size: 17px;
      line-height: 1.35;
      letter-spacing: 0;
    }
    .meta, .category, .paths {
      color: var(--muted);
      font-size: 12px;
    }
    .effect {
      margin: 8px 0;
      font-size: 13px;
      color: #dbe2ea;
    }
    .paths {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }
    a { color: var(--accent); }
    .reviewControls {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      margin-top: 10px;
    }
    button {
      min-height: 30px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel-2);
      color: var(--text);
      cursor: pointer;
    }
    button:hover { border-color: var(--accent); }
    .status-ok button[data-status="ok"], .status-ng button[data-status="ng"], .status-hold button[data-status="hold"] {
      border-color: currentColor;
      background: #12161b;
    }
    .status-ok button[data-status="ok"] { color: var(--accent); }
    .status-ng button[data-status="ng"] { color: var(--bad); }
    .status-hold button[data-status="hold"] { color: var(--hold); }
    textarea {
      width: 100%;
      min-height: 54px;
      resize: vertical;
      margin-top: 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #11161c;
      color: var(--text);
      padding: 7px 8px;
      font-size: 13px;
    }
    .muted { color: var(--muted); }
    @media (max-width: 760px) {
      .controls { grid-template-columns: 1fr; }
      .grid { grid-template-columns: 1fr; }
      .card { grid-template-columns: 84px minmax(0, 1fr); }
      .thumb { width: 84px; height: 84px; }
      .thumb img { max-width: 78px; max-height: 78px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>秘宝画像紐づけレビュー</h1>
    <div class="summary">
      <span>生成: $(HtmlEncode-Value $generatedAt)</span>
      <span>秘宝: $($rows.Count)</span>
      <span>画像付き: $($rows.Count - $missingImages)</span>
      <span>ユニーク画像: $uniqueImages</span>
      <span>画像メタデータなし: $missingImages</span>
      <span>ローカル画像なし: $missingFiles</span>
      <span id="visibleCount">表示: $($rows.Count)</span>
    </div>
    <div class="controls">
      <input id="search" type="search" placeholder="秘宝名・No・ID・効果・画像パスで検索">
      <select id="campaignFilter">
        <option value="all">全キャンペーン</option>
$campaignOptions
      </select>
      <select id="statusFilter">
        <option value="all">全ステータス</option>
        <option value="unset">未確認</option>
        <option value="ok">OK</option>
        <option value="ng">NG</option>
        <option value="hold">保留</option>
      </select>
    </div>
  </header>
  <main>
    <section class="grid" id="grid">
$($cards -join "`n")
    </section>
  </main>
  <script>
    const storagePrefix = 'relic-image-review:';
    const cards = Array.from(document.querySelectorAll('.card'));
    const search = document.getElementById('search');
    const campaignFilter = document.getElementById('campaignFilter');
    const statusFilter = document.getElementById('statusFilter');
    const visibleCount = document.getElementById('visibleCount');

    function key(card, name) {
      return storagePrefix + card.dataset.relicId + ':' + name;
    }

    function setStatus(card, status) {
      card.classList.remove('status-ok', 'status-ng', 'status-hold');
      card.dataset.status = '';
      if (status && status !== 'clear') {
        card.classList.add('status-' + status);
        card.dataset.status = status;
        localStorage.setItem(key(card, 'status'), status);
      } else {
        localStorage.removeItem(key(card, 'status'));
      }
      applyFilters();
    }

    function applyFilters() {
      const query = search.value.trim().toLowerCase();
      const campaign = campaignFilter.value;
      const status = statusFilter.value;
      let count = 0;
      for (const card of cards) {
        const statusValue = card.dataset.status || 'unset';
        const matchesQuery = !query || card.dataset.search.toLowerCase().includes(query);
        const matchesCampaign = campaign === 'all' || card.dataset.campaign === campaign;
        const matchesStatus = status === 'all' || statusValue === status;
        const visible = matchesQuery && matchesCampaign && matchesStatus;
        card.classList.toggle('is-hidden', !visible);
        if (visible) count++;
      }
      visibleCount.textContent = '表示: ' + count;
    }

    for (const card of cards) {
      const savedStatus = localStorage.getItem(key(card, 'status'));
      if (savedStatus) setStatus(card, savedStatus);
      const textarea = card.querySelector('textarea');
      textarea.value = localStorage.getItem(key(card, 'memo')) || '';
      textarea.addEventListener('input', () => localStorage.setItem(key(card, 'memo'), textarea.value));
      for (const button of card.querySelectorAll('button[data-status]')) {
        button.addEventListener('click', () => setStatus(card, button.dataset.status));
      }
    }

    search.addEventListener('input', applyFilters);
    campaignFilter.addEventListener('change', applyFilters);
    statusFilter.addEventListener('change', applyFilters);
    applyFilters();
  </script>
</body>
</html>
"@

$outDir = Split-Path -Parent $outputPath
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
[System.IO.File]::WriteAllText($outputPath, $html.Replace("`r`n", "`n"), $Utf8NoBom)
"Relic image review HTML written: $outputPath rows=$($rows.Count) uniqueImages=$uniqueImages missingImages=$missingImages missingFiles=$missingFiles"