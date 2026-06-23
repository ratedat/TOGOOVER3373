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
$Utf8Bom = [System.Text.UTF8Encoding]::new($true)

function HtmlEscape([object]$Value) { [System.Net.WebUtility]::HtmlEncode([string]$Value) }
function As-Array($Value) { $items = @(); foreach ($item in $Value) { $items += $item }; $items }
function VariantText($Group) {
  if ($null -eq $Group) { return '' }
  $parts = @()
  foreach ($variant in (As-Array $Group.variants)) {
    $max = if ($null -eq $variant.maxDifficulty) { '∞' } else { [string]$variant.maxDifficulty }
    $parts += ('{0}({1}-{2}): {3}' -f $variant.label, $variant.minDifficulty, $max, $variant.effect)
  }
  $parts -join ' / '
}

$campaigns = As-Array (Get-Content -LiteralPath (Join-Path $ProjectRoot 'data\campaigns.json') -Encoding UTF8 -Raw | ConvertFrom-Json)
$relicDoc = Get-Content -LiteralPath (Join-Path $ProjectRoot 'data\relics.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$variantDoc = Get-Content -LiteralPath (Join-Path $ProjectRoot 'data\relic-effect-variants.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$variantGroups = As-Array $variantDoc.variantGroups

$campaignById = @{}
$campaignOrder = @{}
for ($i = 0; $i -lt $campaigns.Count; $i++) {
  $campaignById[[string]$campaigns[$i].id] = $campaigns[$i]
  $campaignOrder[[string]$campaigns[$i].id] = $i
}
$variantById = @{}
foreach ($group in $variantGroups) { $variantById[[string]$group.relicId] = $group }

$relics = As-Array $relicDoc.relics | Sort-Object @{ Expression = { $campaignOrder[[string]$_.campaignId] } }, @{ Expression = { if ($null -ne $_.number) { [int]$_.number } else { 999999 } } }, id
$csvRows = @()
foreach ($relic in $relics) {
  $campaign = $campaignById[[string]$relic.campaignId]
  if ($null -eq $campaign) { continue }
  $group = if ($variantById.ContainsKey([string]$relic.id)) { $variantById[[string]$relic.id] } else { $null }
  $variantText = VariantText $group
  $displayNo = if ($null -ne $relic.number) { [string]$relic.number } elseif ($relic.PSObject.Properties.Name -contains 'code') { [string]$relic.code } else { '' }
  $csvRows += [pscustomobject][ordered]@{
    checkStatus = ''
    memo = ''
    campaignId = $relic.campaignId
    campaign = ('IS#{0} {1}' -f $campaign.number, $campaign.title)
    displayNo = $displayNo
    number = if ($null -ne $relic.number) { [string]$relic.number } else { '' }
    code = if ($relic.PSObject.Properties.Name -contains 'code') { [string]$relic.code } else { '' }
    id = $relic.id
    name = $relic.name
    category = $relic.category
    price = if ($null -ne $relic.price) { [string]$relic.price } else { '' }
    exchange = if ($null -ne $relic.exchange) { [string]$relic.exchange } else { '' }
    effect = $relic.effect
    effectVariants = $variantText
    sourceAnchor = $relic.sourceAnchor
  }
}

$summaryRows = @()
foreach ($campaign in $campaigns) {
  $items = @($relics | Where-Object { $_.campaignId -eq $campaign.id })
  $numbers = @($items | Where-Object { $null -ne $_.number } | ForEach-Object { [int]$_.number } | Sort-Object)
  $minNo = if ($numbers.Count -gt 0) { ($numbers | Select-Object -First 1) } else { '' }
  $maxNo = if ($numbers.Count -gt 0) { ($numbers | Select-Object -Last 1) } else { '' }
  $missing = @()
  if ($numbers.Count -gt 0) {
    $set = @{}
    foreach ($n in $numbers) { $set[$n] = $true }
    for ($n = [int]$minNo; $n -le [int]$maxNo; $n++) { if (-not $set.ContainsKey($n)) { $missing += $n } }
  }
  $variantCount = @($variantGroups | Where-Object { $_.campaignId -eq $campaign.id }).Count
  $summaryRows += [pscustomobject][ordered]@{
    campaignId = $campaign.id
    campaign = ('IS#{0} {1}' -f $campaign.number, $campaign.title)
    count = $items.Count
    numericCount = $numbers.Count
    specialCodeCount = ($items.Count - $numbers.Count)
    variantRelicCount = $variantCount
    minNo = $minNo
    maxNo = $maxNo
    missingNumbers = ($missing -join ', ')
    emptyEffects = @($items | Where-Object { [string]::IsNullOrWhiteSpace($_.effect) }).Count
  }
}

$reviewDir = Join-Path $ProjectRoot 'review'
if (-not (Test-Path -LiteralPath $reviewDir)) { New-Item -ItemType Directory -Path $reviewDir | Out-Null }
$csvPath = Join-Path $reviewDir 'relic-effects-review.csv'
$summaryPath = Join-Path $reviewDir 'relic-effects-summary.csv'
$htmlPath = Join-Path $reviewDir 'relic-effects-review.html'
$zipPath = Join-Path $reviewDir 'relic-effects-review.zip'
[System.IO.File]::WriteAllText($csvPath, (($csvRows | ConvertTo-Csv -NoTypeInformation) -join "`r`n") + "`r`n", $Utf8Bom)
[System.IO.File]::WriteAllText($summaryPath, (($summaryRows | ConvertTo-Csv -NoTypeInformation) -join "`r`n") + "`r`n", $Utf8Bom)

$totalVariants = $variantGroups.Count
$generated = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$optionParts = @()
foreach ($campaign in $campaigns) {
  $count = @($relics | Where-Object { $_.campaignId -eq $campaign.id }).Count
  $optionParts += ('<option value="{0}">IS#{1} {2} ({3})</option>' -f (HtmlEscape $campaign.id), $campaign.number, (HtmlEscape $campaign.title), $count)
}
$summaryParts = @()
foreach ($summary in $summaryRows) {
  $note = if ([string]::IsNullOrWhiteSpace($summary.missingNumbers)) { ('No.{0}-{1} / 欠番なし' -f $summary.minNo, $summary.maxNo) } else { ('No.{0}-{1} / 欠番: {2}' -f $summary.minNo, $summary.maxNo, $summary.missingNumbers) }
  $summaryParts += ('<div class="summary-card"><div class="summary-title">{0}</div><div class="summary-count">{1}件 / 可変効果 {2}件</div><div class="summary-note">{3}</div></div>' -f (HtmlEscape $summary.campaign), $summary.count, $summary.variantRelicCount, (HtmlEscape $note))
}
$rowParts = @()
foreach ($row in $csvRows) {
  $variantHtml = if ([string]::IsNullOrWhiteSpace($row.effectVariants)) { '' } else { '<div class="variants">' + (HtmlEscape $row.effectVariants) + '</div>' }
  $dataText = HtmlEscape ((@($row.campaign, $row.displayNo, $row.id, $row.name, $row.category, $row.effect, $row.effectVariants, $row.sourceAnchor) -join ' '))
  $rowParts += ('<tr data-campaign="{0}" data-text="{1}"><td class="status"></td><td class="campaign">{2}</td><td class="number">{3}</td><td class="name">{4}</td><td class="category">{5}</td><td class="price">{6}</td><td class="exchange">{7}</td><td class="effect">{8}{9}</td><td class="source">{10}</td></tr>' -f (HtmlEscape $row.campaignId), $dataText, (HtmlEscape $row.campaign), (HtmlEscape $row.displayNo), (HtmlEscape $row.name), (HtmlEscape $row.category), (HtmlEscape $row.price), (HtmlEscape $row.exchange), (HtmlEscape $row.effect), $variantHtml, (HtmlEscape $row.sourceAnchor))
}
$campaignOptions = $optionParts -join "`n"
$summaryCards = $summaryParts -join "`n"
$rowHtml = $rowParts -join "`n"
$html = @"
<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>秘宝効果レビュー</title><style>:root{color-scheme:dark;--bg:#101216;--panel:#181c22;--line:#2b323c;--text:#eef2f6;--muted:#aab4c0;--accent:#62b5e5;--warn:#f5c36b}*{box-sizing:border-box}body{margin:0;font-family:"Yu Gothic UI","Meiryo",system-ui,sans-serif;background:var(--bg);color:var(--text);font-size:14px}header{position:sticky;top:0;z-index:10;background:rgba(16,18,22,.98);border-bottom:1px solid var(--line);padding:16px 20px 12px}h1{margin:0 0 10px;font-size:22px}.meta{color:var(--muted);display:flex;gap:18px;flex-wrap:wrap;margin-bottom:12px}.controls{display:grid;grid-template-columns:minmax(220px,320px) minmax(260px,1fr) auto;gap:10px;align-items:center}select,input,button{width:100%;height:36px;border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:6px;padding:0 10px;font:inherit}button{width:auto;min-width:112px;cursor:pointer;color:var(--bg);background:var(--accent);border-color:var(--accent);font-weight:700}main{padding:16px 20px 28px}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin-bottom:16px}.summary-card{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:10px 12px}.summary-title{font-weight:700;margin-bottom:4px}.summary-count{color:var(--accent)}.summary-note{color:var(--muted);margin-top:4px;font-size:13px}.table-wrap{border:1px solid var(--line);border-radius:6px;overflow:auto;max-height:calc(100vh - 250px);background:#0c0e12}table{border-collapse:collapse;width:100%;min-width:1500px}th,td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:7px 8px;vertical-align:top}th{position:sticky;top:0;z-index:2;background:#202631;color:#dbe5ef;text-align:left;white-space:nowrap}td.status{width:54px}td.campaign{width:190px;color:var(--muted)}td.number{width:72px;text-align:right;font-variant-numeric:tabular-nums}td.name{width:210px;font-weight:700}td.category{width:220px;color:var(--muted)}td.price,td.exchange{width:64px;text-align:center}td.effect{min-width:560px;line-height:1.55}td.source{width:90px;color:var(--muted)}.variants{margin-top:6px;padding-top:6px;border-top:1px solid var(--line);color:var(--warn);font-size:13px}.hidden{display:none}@media(max-width:840px){.controls{grid-template-columns:1fr}.table-wrap{max-height:none}}</style></head><body><header><h1>秘宝効果レビュー</h1><div class="meta"><span>生成: $generated</span><span>件数: <strong id="visibleCount">$($csvRows.Count)</strong> / $($csvRows.Count)</span><span>可変効果: $totalVariants件</span></div><div class="controls"><select id="campaignFilter"><option value="">全キャンペーン</option>$campaignOptions</select><input id="searchBox" type="search" placeholder="名前・効果・分類・IDで検索"><button id="resetButton" type="button">リセット</button></div></header><main><section class="summary">$summaryCards</section><div class="table-wrap"><table><thead><tr><th>確認</th><th>統合戦略</th><th>No.</th><th>秘宝名</th><th>分類</th><th>価格</th><th>交換</th><th>効果</th><th>出典</th></tr></thead><tbody id="relicRows">$rowHtml</tbody></table></div></main><script>const campaignFilter=document.getElementById('campaignFilter');const searchBox=document.getElementById('searchBox');const resetButton=document.getElementById('resetButton');const visibleCount=document.getElementById('visibleCount');const rows=Array.from(document.querySelectorAll('#relicRows tr'));function applyFilters(){const campaign=campaignFilter.value;const query=searchBox.value.trim().toLowerCase();let count=0;for(const row of rows){const show=(!campaign||row.dataset.campaign===campaign)&&(!query||row.dataset.text.toLowerCase().includes(query));row.classList.toggle('hidden',!show);if(show)count+=1;}visibleCount.textContent=String(count);}campaignFilter.addEventListener('change',applyFilters);searchBox.addEventListener('input',applyFilters);resetButton.addEventListener('click',()=>{campaignFilter.value='';searchBox.value='';applyFilters();});</script></body></html>
"@
[System.IO.File]::WriteAllText($htmlPath, $html.Replace("`r`n", "`n"), $Utf8NoBom)
Compress-Archive -LiteralPath $csvPath,$summaryPath,$htmlPath -DestinationPath $zipPath -Force
"Review regenerated. VariantRelics=$totalVariants Rows=$($csvRows.Count)"