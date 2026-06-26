# Control v2 Design Handoff

この文書は、RHODES OBS COMMANDER3373 の現行 Control v2 UI を再デザインするための引き継ぎ資料です。
Google / Gemini など別環境でデザインを作り直す際に、現在の画面構造、CSS設計、設計思想、維持すべき機能要件を把握できるようにまとめています。

対象実装:

- HTML生成: `app/app.js`
- イベント: `app/control-events.js`
- CSS: `app/styles.css`
- 主要ルート: `/control-v2`

## 1. 現在の設計思想

現行の Control v2 は「OBS配信支援 + 自分用サイドカー + 大会スタッフ入力」の3用途を同じ状態モデルで扱うための、密度高めの業務ツールUIとして設計しています。

基本方針:

- ラン状態を常に確認できるように、上部に固定ヘッダーとステータスカードを置く。
- 1画面に全部詰め込むのはやめ、`共通設定` / `オペレーター` / `秘宝` / `OBS設定` / `サイドカー` に分ける。
- オペレーターと秘宝は大量データなので、共通設定から分離して単独作業画面にする。
- OBS設定はアンカー移動ではなく、Control v2 内の独立画面として扱う。
- 情報は配信用に省略しすぎず、入力/確認画面では根拠が追える密度を優先する。
- デザインはアークナイツ系の暗色・金色アクセントを使っているが、現状は実用優先で視覚設計は粗い。
- ブラウザ運用ではなく Electron アプリ運用を前提にし、1360x920 以上のデスクトップ画面を主対象にする。

## 2. 情報アーキテクチャ

### 共通設定

ラン全体の基礎情報と特殊値、敵効果、ボス、ADB取得をまとめる画面。

含む要素:

- 統合戦略
- 等級 / 難易度
- 分隊
- ランダム分隊効果
- 演目
- 希望
- 耐久値
- シールド
- 指揮Lv
- 特殊値
  - IS#3: 拒絶反応、啓示、大群の呼び声など
  - IS#4: パラダイム、崩壊値、啓示板など
  - IS#5: 思案、時代、構想など
  - IS#6: 通宝、銭、歳時など
- 敵効果 / ボスフラグ
- ADB取得候補

### オペレーター

招集オペレーター選択専用画面。

含む要素:

- 実装状態フィルタ
- レア度フィルタ
- 職業フィルタ
- 職分フィルタ
- 並び順
- 表示列
- オペレーターカードグリッド

### 秘宝

所持秘宝選択専用画面。

含む要素:

- 検索
- カテゴリ
- 表示列
- 手入力秘宝の全解除
- 秘宝カードグリッド

### OBS設定

OBS Browser Source 用URLを扱う画面。

含む要素:

- 標準オーバーレイ
- コンパクト表示
- 横長 S/M/L
- 縦長 S/M/L
- 分割パーツURL
- サイドカー/大会運用メモ

### サイドカー

配信に出さない支援画面。現時点では別ルート `/sidecar` へ移動する。

将来的にはオペレーター/秘宝を Electron の専用 BrowserWindow として剥離し、大会スタッフが別ウィンドウで入力できる導線を想定している。

## 3. 現行HTML構造の概略

実装はvanilla JSでHTML文字列を生成しているため、React等のコンポーネントではありません。
以下は実際の構造を要約したものです。

```html
<body class="control-v2-body">
  <div id="app" class="control-v2-app">
    <header class="control-v2-topbar">
      <div class="control-v2-title">
        <span>IS#5</span>
        <div>
          <h1>サルカズの炉辺奇談</h1>
          <p>魂に直面・18 / 分隊未選択</p>
        </div>
      </div>

      <nav class="control-v2-actions" aria-label="Control v2 画面切り替え">
        <div class="control-v2-nav-buttons" role="tablist" aria-label="編集画面">
          <button class="control-v2-nav-button active" data-action="control-v2-screen" data-screen="common">共通設定</button>
          <button class="control-v2-nav-button" data-action="control-v2-screen" data-screen="operators">オペレーター</button>
          <button class="control-v2-nav-button" data-action="control-v2-screen" data-screen="relics">秘宝</button>
          <button class="control-v2-nav-button" data-action="control-v2-screen" data-screen="obs">OBS設定</button>
          <a class="control-v2-nav-button" href="/sidecar">サイドカー</a>
        </div>
        <div class="control-v2-utility-actions">
          <span class="save-status">保存済み</span>
          <button class="ghost" data-action="reset-state">リセット</button>
        </div>
      </nav>
    </header>

    <main class="control-v2-workbench">
      <section class="control-v2-status-strip" aria-label="現在のラン状態">
        <div class="control-v2-status-card">
          <span>統合戦略</span>
          <strong>IS#5</strong>
          <em>サルカズの炉辺奇談</em>
        </div>
      </section>

      <!-- screen=common -->
      <section class="control-v2-screen control-v2-primary-grid">
        <section class="control-v2-panel control-v2-run-panel">...</section>
        <section class="control-v2-panel control-v2-special-panel">...</section>
        <section class="control-v2-panel control-v2-effect-panel">...</section>
        <section class="control-v2-panel control-v2-recognition-panel">...</section>
      </section>

      <!-- screen=operators -->
      <section class="control-v2-screen control-v2-single-choice-screen">
        <section class="control-v2-panel control-v2-choice-panel">
          <div class="control-v2-panel-head">
            <h2>オペレーター</h2>
            <span>413件 / 招集0名</span>
          </div>
          <div class="control-v2-filter-grid">...</div>
          <div class="list-area operator-pick-grid">...</div>
        </section>
      </section>

      <!-- screen=relics -->
      <section class="control-v2-screen control-v2-single-choice-screen">
        <section class="control-v2-panel control-v2-choice-panel">
          <div class="control-v2-panel-head">
            <h2>秘宝</h2>
            <span>296件 / 所持0件</span>
          </div>
          <div class="control-v2-filter-grid compact">...</div>
          <div class="list-area relic-pick-grid">...</div>
        </section>
      </section>

      <!-- screen=obs -->
      <section class="control-v2-screen control-v2-obs-screen" aria-label="OBS設定">
        <section class="control-v2-panel control-v2-obs-panel">OBSプリセット...</section>
        <section class="control-v2-panel control-v2-obs-panel">分割パーツ...</section>
        <section class="control-v2-panel control-v2-obs-panel control-v2-obs-sidecar-note">サイドカー / 大会運用...</section>
      </section>
    </main>
  </div>
</body>
```

## 4. 現行CSSトークン

```css
:root {
  color-scheme: dark;
  --bg: #10100f;
  --panel: rgba(24, 24, 22, 0.92);
  --panel-soft: rgba(35, 34, 31, 0.76);
  --panel-strong: rgba(10, 10, 9, 0.9);
  --line: rgba(255, 255, 255, 0.12);
  --line-strong: rgba(255, 255, 255, 0.22);
  --text: #f2efe6;
  --muted: #b8b1a3;
  --faint: #80796c;
  --accent: #d8483f;
  --accent-2: #d7a847;
  --info: #5bb5b0;
  --ok: #71b66b;
  --warning: #e1b453;
  --danger: #e05050;
  --radius: 8px;
  --shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
  font-family: "Yu Gothic UI", "Meiryo", system-ui, sans-serif;
}
```

現在の配色は、暗い黒茶ベースに赤と金をアクセントにしています。ただし現在の見た目は暫定で、Google側で再設計するなら以下の点は変更して構いません。

- 色相はアークナイツらしい黒/灰/黄を残しつつ、単調な暗色面を減らす。
- パネル境界が多いため、情報グループごとの視覚階層を整理する。
- フォントサイズは全体に小さめ。入力作業中心ならもう少し読みやすくする余地あり。
- 長時間作業するアプリなので、コントラストと疲労感のバランスを優先する。

## 5. 現行CSSの主要レイアウト

### アプリ全体

```css
.control-v2-body {
  min-height: 100vh;
  background: #10100f;
  overflow: auto;
}

.control-v2-app {
  min-height: 100vh;
  background: radial-gradient(circle at 0 0, rgba(216,72,63,0.12), transparent 32%), var(--bg);
}

.control-v2-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  background: rgba(10, 10, 9, 0.96);
  backdrop-filter: blur(10px);
}

.control-v2-workbench {
  display: grid;
  gap: 12px;
  padding: 12px;
}
```

### 上部ナビゲーション

```css
.control-v2-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: end;
}

.control-v2-nav-buttons,
.control-v2-utility-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.control-v2-nav-button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 11px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}

.control-v2-nav-button.active {
  border-color: rgba(215,168,71,0.78);
  background: linear-gradient(180deg, rgba(215,168,71,0.2), rgba(255,255,255,0.055));
  color: #fff7e2;
}
```

### ステータスストリップ

```css
.control-v2-status-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.control-v2-status-card {
  min-width: 0;
  display: grid;
  gap: 3px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025));
}
```

### 共通設定グリッド

```css
.control-v2-primary-grid {
  display: grid;
  grid-template-columns: minmax(300px, 0.85fr) minmax(420px, 1.2fr) minmax(420px, 1.2fr);
  gap: 12px;
  align-items: start;
}

.control-v2-panel {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(22, 22, 20, 0.9);
  box-shadow: 0 12px 34px rgba(0,0,0,0.2);
  overflow: hidden;
}

.control-v2-panel-head {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 11px;
  border-bottom: 1px solid var(--line);
  background: rgba(255,255,255,0.035);
}
```

### オペレーター / 秘宝画面

```css
.control-v2-choice-panel {
  display: grid;
  grid-template-rows: auto auto minmax(560px, calc(100vh - 330px));
}

.control-v2-filter-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  padding: 9px;
  border-bottom: 1px solid var(--line);
}

.control-v2-filter-grid.compact {
  grid-template-columns: minmax(180px, 1.5fr) minmax(130px, 1fr) 92px auto;
  align-items: end;
}

.control-v2-choice-panel .list-area {
  height: 100%;
  max-height: none;
  border: 0;
  border-radius: 0;
  padding: 9px;
  overflow: auto;
  align-content: start;
  grid-auto-rows: max-content;
}

.control-v2-choice-panel .operator-pick-grid {
  grid-template-columns: repeat(var(--operator-grid-columns), minmax(0, 1fr));
}

.control-v2-choice-panel .relic-pick-grid {
  grid-template-columns: repeat(var(--relic-grid-columns), minmax(0, 1fr));
}
```

### OBS設定画面

```css
.control-v2-obs-screen {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.control-v2-obs-sidecar-note {
  grid-column: 1 / -1;
}

.control-v2-obs-screen .obs-url-grid {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}
```

### レスポンシブ

```css
@media (max-width: 1380px) {
  .control-v2-status-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .control-v2-primary-grid { grid-template-columns: minmax(300px, 0.9fr) minmax(430px, 1.1fr); }
  .control-v2-effect-panel { grid-column: 1 / -1; }
}

@media (max-width: 900px) {
  .control-v2-topbar { grid-template-columns: 1fr; }
  .control-v2-status-strip,
  .control-v2-primary-grid,
  .control-v2-form-grid,
  .control-v2-special-grid,
  .control-v2-boss-selectors { grid-template-columns: 1fr; }
  .control-v2-filter-grid,
  .control-v2-filter-grid.compact { grid-template-columns: 1fr; }
  .control-v2-choice-panel { grid-template-rows: auto auto minmax(420px, 72vh); }
  .control-v2-obs-screen { grid-template-columns: 1fr; }
}
```

## 6. 現行UIの弱点

再デザイン時に特に見直したい点です。

- パネルが多く、画面全体の視線誘導が弱い。
- 「共通設定」内の情報密度が高く、特殊値・ボス・ADB候補の優先度が同列に見える。
- オペレーター/秘宝はカード数が少ないと余白が間延びして見える。
- 暗色背景に同系統のパネルが重なり、階層差がやや弱い。
- 赤/金アクセントはあるが、操作対象・現在状態・危険操作の視覚言語がまだ整理されていない。
- OBS設定とサイドカー/大会運用の関係性がまだ説明的で、実作業導線としては弱い。
- 大会スタッフが使う「剥離ウィンドウ」導線は未実装。

## 7. 再デザインで守るべき機能要件

見た目は大きく変えてよいですが、以下は維持したい要件です。

- Electronデスクトップアプリとして初心者が扱えること。
- コマンドライン操作を前提にしないこと。
- `共通設定` / `オペレーター` / `秘宝` / `OBS設定` / `サイドカー` のトップ導線を明確なボタンまたはタブとして維持すること。
- `OBS設定` は同一画面内アンカーではなく、独立した画面として扱うこと。
- オペレーターと秘宝は、それぞれ独立画面にすること。
- 大量データを扱うため、検索/フィルタ/表示列変更を目立つ位置に置くこと。
- 日本語入力、IME、select表示、長い名称の省略表示に配慮すること。
- ADB/OCR取得は候補レビュー方式で、承認前に本体状態へ直接反映しないこと。
- OBSオーバーレイは配信画面占有率を抑えるため、プリセットと分割パーツの両方を扱うこと。
- 大会用に、将来的な別ウィンドウ化/スタッフ入力/レビューキューへ拡張できること。

## 8. 推奨する再デザイン方向

### 方向性A: 管制卓型

一番現実的な方向。上部にラン状態、左にナビ、中央に現在作業、右にレビュー/警告/サマリーを置く。

向いている用途:

- 個人配信
- 自分用サイドカー
- 大会スタッフ入力

### 方向性B: タスク別ワークスペース型

トップに大きなモード切り替えを置き、各画面を完全に別作業として見せる。

向いている用途:

- 初心者向け
- 操作ミスを減らす
- 各タスクを段階的に案内する

### 方向性C: 大会運用型

スタッフ入力、承認待ち、現在配信中表示、OBS反映状態を主役にする。

向いている用途:

- 大会配信
- 第三者入力
- 複数人運用

現時点では、通常利用にも大会利用にも耐えるため、AをベースにしつつBの分かりやすさを取り込むのが良いです。

## 9. Googleへ渡す依頼文例

以下をそのままデザイン依頼に使えます。

```text
Arknights Integrated Strategies 用のElectronデスクトップアプリUIを再設計してください。
用途はOBS配信用オーバーレイ管理、自分用の統合戦略サイドカー、大会スタッフ入力です。

現行UIは暗色テーマの業務ツール型で、上部に現在ラン状態、画面切替ボタン、ステータスカードがあります。
画面は「共通設定」「オペレーター」「秘宝」「OBS設定」「サイドカー」に分かれています。

重要要件:
- 初心者がGUIだけで操作できる。
- コマンドライン操作を前提にしない。
- オペレーターと秘宝は大量データなので独立画面にする。
- OBS設定はアンカーではなく独立画面にする。
- 配信用の情報と入力作業用の情報を混ぜすぎない。
- 大会スタッフ用に将来的な別ウィンドウ化とレビューキューを想定する。
- 1360x920以上のElectronデスクトップ画面を主対象にする。
- ダークテーマでも文字が読みやすいコントラストにする。

現在の課題:
- パネルが多く視線誘導が弱い。
- 情報密度が高く優先順位が分かりづらい。
- カード数が少ない画面で余白が間延びする。
- OBS設定と大会運用の導線がまだ弱い。

アークナイツらしい黒/灰/金の雰囲気は残しつつ、配信支援ツールとして実用的で、長時間操作しても疲れにくいUIにしてください。
```
