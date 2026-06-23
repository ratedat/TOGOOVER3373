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

$operatorPath = Join-Path $ProjectRoot 'data\operators.json'
$imageManifestPath = Join-Path $ProjectRoot 'data\operator-images.json'
$outputPath = Join-Path $ProjectRoot 'review\operator-image-review.html'

$operatorDoc = Get-Content -LiteralPath $operatorPath -Raw -Encoding UTF8 | ConvertFrom-Json
$operators = As-Array $operatorDoc.operators
$imageManifest = $null
if (Test-Path -LiteralPath $imageManifestPath) {
  $imageManifest = Get-Content -LiteralPath $imageManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

$rows = @()
foreach ($operator in $operators) {
  $localRel = if ($operator.image -and $operator.image.localPath) { ([string]$operator.image.localPath).Replace('\\', '/') } else { '' }
  $localAbs = if ($localRel) { Join-Path $ProjectRoot ($localRel -replace '/', '\') } else { '' }
  $hasFile = $localAbs -and (Test-Path -LiteralPath $localAbs)
  $rows += [pscustomobject]@{
    operator = $operator
    localRel = $localRel
    imageSrc = if ($localRel) { '../' + $localRel } else { '' }
    hasFile = $hasFile
  }
}

$missingImages = @($rows | Where-Object { -not $_.operator.image }).Count
$missingFiles = @($rows | Where-Object { -not $_.hasFile }).Count
$uniqueImages = @($rows | Where-Object { $_.localRel } | ForEach-Object { $_.localRel } | Sort-Object -Unique).Count
$japanUnreleasedCount = @($rows | Where-Object { $_.operator.isJapanUnreleased }).Count
$generatedAt = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

$rarityOptions = @()
foreach ($rarity in @(6,5,4,3,2,1)) {
  $count = @($rows | Where-Object { [int]$_.operator.rarity -eq $rarity }).Count
  if ($count -gt 0) { $rarityOptions += ('        <option value="{0}">★{0} ({1})</option>' -f $rarity, $count) }
}
$rarityOptionsHtml = $rarityOptions -join "`n"

$classOptions = @()
$classes = @($rows | ForEach-Object { $_.operator.class } | Where-Object { $_ } | Sort-Object -Unique)
foreach ($class in $classes) {
  $count = @($rows | Where-Object { $_.operator.class -eq $class }).Count
  $classOptions += ('        <option value="{0}">{0} ({1})</option>' -f (HtmlEncode-Value $class), $count)
}
$classOptionsHtml = $classOptions -join "`n"

$cards = New-Object System.Collections.Generic.List[string]
foreach ($row in $rows) {
  $operator = $row.operator
  $classesForCard = @('card')
  if (-not $row.hasFile) { $classesForCard += 'is-missing' }
  if ($operator.isJapanUnreleased) { $classesForCard += 'is-japan-unreleased' }
  $searchText = @($operator.name, $operator.id, $operator.class, $operator.branch, $operator.wikiPage, $row.localRel, ($operator.obtainMethods -join ' '), ($operator.recruitmentTags -join ' ')) -join ' '
  $imageHtml = if ($row.hasFile) {
    '<a class="portraitLink" href="{0}" target="_blank" rel="noreferrer"><img src="{0}" alt="{1}" loading="lazy"></a>' -f (HtmlEncode-Value $row.imageSrc), (HtmlEncode-Value $operator.name)
  } elseif ($row.imageSrc) {
    '<div class="missingPortrait">画像ファイルなし<br><span>{0}</span></div>' -f (HtmlEncode-Value $row.localRel)
  } else {
    '<div class="missingPortrait">画像メタデータなし</div>'
  }
  $sourceLink = if ($operator.image -and $operator.image.sourceUrl) {
    '<a href="{0}" target="_blank" rel="noreferrer">source</a>' -f (HtmlEncode-Value $operator.image.sourceUrl)
  } else { '<span class="muted">sourceなし</span>' }
  $cardClassHtml = HtmlEncode-Value ($classesForCard -join ' ')
  $idHtml = HtmlEncode-Value $operator.id
  $nameHtml = HtmlEncode-Value $operator.name
  $classHtml = HtmlEncode-Value $operator.class
  $branchHtml = HtmlEncode-Value $operator.branch
  $wikiPageHtml = HtmlEncode-Value $operator.wikiPage
  $localRelHtml = HtmlEncode-Value $row.localRel
  $searchHtml = HtmlEncode-Value $searchText
  $displayOrder = [int]$operator.displayOrder
  $rarity = [int]$operator.rarity
  $isJapanUnreleased = [bool]$operator.isJapanUnreleased
  $japanUnreleasedAttr = if ($isJapanUnreleased) { 'true' } else { 'false' }
  $releaseBadge = if ($isJapanUnreleased) { '<span class="releaseBadge">日本未実装</span>' } else { '' }
  $cards.Add(@"
      <article class="$cardClassHtml" data-id="$idHtml" data-rarity="$rarity" data-class="$classHtml" data-name="$nameHtml" data-order="$displayOrder" data-japan-unreleased="$japanUnreleasedAttr" data-search="$searchHtml">
        <div class="portrait">$imageHtml</div>
        <div class="body">
          <div class="topline">
            <span class="rarity">★$rarity</span>
            $releaseBadge
            <span class="job">$classHtml / $branchHtml</span>
          </div>
          <h2>$nameHtml</h2>
          <div class="meta">$idHtml</div>
          <div class="meta">$wikiPageHtml</div>
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
  <title>オペレーター画像紐づけレビュー</title>
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
      --bad: #ef7d7d;
      --hold: #92a5ff;
      --spoiler: #f08c62;
      --gold: #f2c86b;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: "Yu Gothic UI", "Meiryo", system-ui, sans-serif; line-height: 1.5; }
    header { position: sticky; top: 0; z-index: 5; background: rgba(16, 19, 23, 0.96); border-bottom: 1px solid var(--line); padding: 14px 18px 16px; }
    h1 { margin: 0 0 10px; font-size: 20px; letter-spacing: 0; }
    .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; color: var(--muted); font-size: 13px; }
    .summary span { border: 1px solid var(--line); background: var(--panel); border-radius: 6px; padding: 4px 8px; }
    .controls { display: grid; grid-template-columns: minmax(220px, 1fr) 150px 170px 170px 150px 180px; gap: 10px; align-items: center; }
    input, select, textarea, button { font: inherit; }
    input, select { min-height: 36px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--text); padding: 0 10px; }
    .toggle { min-height: 36px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--text); padding: 0 10px; font-size: 13px; }
    .toggle input { min-height: 0; }
    main { padding: 18px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; }
    .card { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 12px; min-height: 176px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 12px; }
    .card.is-hidden { display: none; }
    .card.is-missing { border-color: var(--bad); }
    .card.is-japan-unreleased { border-color: color-mix(in srgb, var(--spoiler), var(--line) 45%); }
    .card.status-ok { border-color: var(--accent); }
    .card.status-ng { border-color: var(--bad); }
    .card.status-hold { border-color: var(--hold); }
    .portrait { width: 92px; height: 92px; display: grid; place-items: center; background: #0d1014; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
    .portrait img { width: 80px; height: 80px; object-fit: contain; display: block; }
    .portraitLink { display: grid; place-items: center; width: 100%; height: 100%; }
    .missingPortrait { padding: 8px; color: var(--bad); font-size: 12px; text-align: center; overflow-wrap: anywhere; }
    .missingPortrait span { color: var(--muted); }
    .body { min-width: 0; }
    .topline { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 12px; }
    .rarity { color: var(--gold); font-weight: 700; }
    .releaseBadge { flex: 0 0 auto; color: var(--spoiler); border: 1px solid color-mix(in srgb, var(--spoiler), transparent 45%); border-radius: 5px; padding: 0 5px; font-size: 11px; }
    .job, .meta, .paths span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    h2 { margin: 2px 0 2px; font-size: 17px; line-height: 1.35; letter-spacing: 0; }
    .meta, .paths { color: var(--muted); font-size: 12px; }
    .paths { display: flex; gap: 8px; align-items: center; justify-content: space-between; margin-top: 8px; }
    a { color: var(--accent); }
    .reviewControls { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 10px; }
    button { min-height: 30px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel-2); color: var(--text); cursor: pointer; }
    button:hover { border-color: var(--accent); }
    .status-ok button[data-status="ok"], .status-ng button[data-status="ng"], .status-hold button[data-status="hold"] { border-color: currentColor; background: #12161b; }
    .status-ok button[data-status="ok"] { color: var(--accent); }
    .status-ng button[data-status="ng"] { color: var(--bad); }
    .status-hold button[data-status="hold"] { color: var(--hold); }
    textarea { width: 100%; min-height: 48px; resize: vertical; margin-top: 8px; border: 1px solid var(--line); border-radius: 6px; background: #11161c; color: var(--text); padding: 7px 8px; font-size: 13px; }
    .muted { color: var(--muted); }
    @media (max-width: 880px) { .controls { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 620px) { .controls { grid-template-columns: 1fr; } .grid { grid-template-columns: 1fr; } .card { grid-template-columns: 84px minmax(0, 1fr); } .portrait { width: 84px; height: 84px; } }
  </style>
</head>
<body>
  <header>
    <h1>オペレーター画像紐づけレビュー</h1>
    <div class="summary">
      <span>生成: $(HtmlEncode-Value $generatedAt)</span>
      <span>オペレーター: $($rows.Count)</span>
      <span>画像付き: $($rows.Count - $missingImages)</span>
      <span>ユニーク画像: $uniqueImages</span>
      <span>画像メタデータなし: $missingImages</span>
      <span>ローカル画像なし: $missingFiles</span>
      <span>日本未実装: $japanUnreleasedCount</span>
      <span id="visibleCount">表示: $($rows.Count - $japanUnreleasedCount)</span>
    </div>
    <div class="controls">
      <input id="search" type="search" placeholder="名前・ID・職業・職分・画像パスで検索">
      <select id="rarityFilter">
        <option value="all">全レアリティ</option>
$rarityOptionsHtml
      </select>
      <select id="classFilter">
        <option value="all">全職業</option>
$classOptionsHtml
      </select>
      <select id="sortMode">
        <option value="rarityDesc">レアリティ降順</option>
        <option value="rarityAsc">レアリティ昇順</option>
        <option value="nameAsc">名前順</option>
        <option value="sourceOrder">Wiki表順</option>
      </select>
      <select id="statusFilter">
        <option value="all">全ステータス</option>
        <option value="unset">未確認</option>
        <option value="ok">OK</option>
        <option value="ng">NG</option>
        <option value="hold">保留</option>
      </select>
      <label class="toggle"><input id="showUnreleased" type="checkbox">日本未実装を表示</label>
    </div>
  </header>
  <main>
    <section class="grid" id="grid">
$($cards -join "`n")
    </section>
  </main>
  <script>
    const storagePrefix = 'operator-image-review:';
    const grid = document.getElementById('grid');
    const cards = Array.from(document.querySelectorAll('.card'));
    const search = document.getElementById('search');
    const rarityFilter = document.getElementById('rarityFilter');
    const classFilter = document.getElementById('classFilter');
    const sortMode = document.getElementById('sortMode');
    const statusFilter = document.getElementById('statusFilter');
    const showUnreleased = document.getElementById('showUnreleased');
    const visibleCount = document.getElementById('visibleCount');

    function key(card, name) { return storagePrefix + card.dataset.id + ':' + name; }

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

    function compareCards(a, b) {
      const mode = sortMode.value;
      if (mode === 'rarityAsc') return Number(a.dataset.rarity) - Number(b.dataset.rarity) || Number(a.dataset.order) - Number(b.dataset.order);
      if (mode === 'nameAsc') return a.dataset.name.localeCompare(b.dataset.name, 'ja') || Number(a.dataset.order) - Number(b.dataset.order);
      if (mode === 'sourceOrder') return Number(a.dataset.order) - Number(b.dataset.order);
      return Number(b.dataset.rarity) - Number(a.dataset.rarity) || Number(a.dataset.order) - Number(b.dataset.order);
    }

    function applySort() {
      const sorted = cards.slice().sort(compareCards);
      for (const card of sorted) grid.appendChild(card);
    }

    function applyFilters() {
      const query = search.value.trim().toLowerCase();
      const rarity = rarityFilter.value;
      const cls = classFilter.value;
      const status = statusFilter.value;
      let count = 0;
      for (const card of cards) {
        const statusValue = card.dataset.status || 'unset';
        const matchesQuery = !query || card.dataset.search.toLowerCase().includes(query);
        const matchesRarity = rarity === 'all' || card.dataset.rarity === rarity;
        const matchesClass = cls === 'all' || card.dataset.class === cls;
        const matchesStatus = status === 'all' || statusValue === status;
        const matchesRelease = showUnreleased.checked || card.dataset.japanUnreleased !== 'true';
        const visible = matchesQuery && matchesRarity && matchesClass && matchesStatus && matchesRelease;
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
    rarityFilter.addEventListener('change', applyFilters);
    classFilter.addEventListener('change', applyFilters);
    statusFilter.addEventListener('change', applyFilters);
    showUnreleased.addEventListener('change', applyFilters);
    sortMode.addEventListener('change', () => { applySort(); applyFilters(); });
    applySort();
    applyFilters();
  </script>
</body>
</html>
"@

$outDir = Split-Path -Parent $outputPath
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
[System.IO.File]::WriteAllText($outputPath, $html.Replace("`r`n", "`n"), $Utf8NoBom)
"Operator image review HTML written: $outputPath rows=$($rows.Count) uniqueImages=$uniqueImages missingImages=$missingImages missingFiles=$missingFiles"