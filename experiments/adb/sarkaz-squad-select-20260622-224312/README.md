# ADB実証メモ: サルカズ 分隊選択画面

- 実施日時: 2026-06-22 22:43頃
- 対象: MuMu Player 12 / com.YoStarJP.Arknights / サルカズの炉辺奇談 分隊選択画面
- 使用serial: 127.0.0.1:16384

## 結論

ADBのUIAutomator XMLには今回もUnityの `Game view` しか出ないため、分隊名や効果文はXMLから直接取得できない。
ただし、ADBスクリーンショットをWindows標準OCRに掛けると、分隊選択画面の見出し、数値、表示中の分隊名、効果文はかなり取得できる。

## ADBで直接取れたもの

- スクリーンショット: `screenshot.png`
- UIAutomator XML: `window.xml`
- XML内のUnity view: `com.YoStarJP.Arknights:id/unitySurfaceView` / `content-desc="Game view"`
- スクリーンショット取得時間: 約875.9ms
- XML dump + pull: 約2236.2ms

## XMLで取れなかったもの

- 分隊名
- 分隊効果文
- 選択中分隊
- 耐久値/指揮LvなどのUnity内テキスト

## OCRで読めた主な内容

- `分隊選択`
- `指揮Lv`
- `0 / 10`
- `22`
- `霊魂護送分隊`
- `博学多識分隊`
- `位置測定分隊`
- `指揮分隊`
- `新エリアに入るたび、妙想+2、負荷臨界点+1`
- `初期負荷臨界点+10、初期希望+2` 相当。ただしOCRでは `+ IO` と誤認識
- `スポット更新回数+1、初期構想+1。各スポットの初回更新時に構想を消費しない`
- `最大耐久値+5、戦闘終了時に追加で耐久値を1回復する`
- `編成上限 + 人数 +2。予備隊を招集する` 相当。ただし一部崩れあり

## 実装上の扱い

分隊選択画面は、ADBスクリーンショットOCRで半自動取得できる見込みがある。
ただしOCRの生テキストをそのまま保存するのではなく、次の補正を入れるべき。

- 固定領域で分隊カードごとに切り出す
- OCR結果の空白を除去する
- `IO` -> `10` など数値誤認識を補正する
- 既知の分隊名リストに対して近似一致させる
- 選択状態は文字ではなくカード枠/チェック/ハイライトの画像特徴で判定する

## 生OCR

```text
22 指 揮 Lv 戸 ー 耐 久 値 分 隊 選 択 0 / 10 、 Ⅳ 、 当 霊 魂 護 送 分 隊 新 エ リ ア に 入 る た び 、 妙 想 + 2 、 負 荷 臨 界 点 + 1 0 指 揮 分 隊 最 大 耐 久 値 + 5 、 戦 闘 終 了 時 に 追 加 で 耐 久 値 を 1 回 復 す る 位 置 測 定 分 隊 博 学 多 識 分 隊 初 期 負 荷 臨 界 点 + IO 、 初 期 希 望 + 2 ス ポ ッ ト 更 新 回 数 + 1 、 初 期 構 想 + 1 。 各 ス ポ ッ ト の 初 回 更 新 時 に 構 想 を 消 費 し な い 編 成 上 限 +. 人 数 + 2 。 ス 予 備 隊 オ 招 集 す る
```

## XML抜粋

```xml
<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="1"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.YoStarJP.Arknights" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][2560,1440]"><node index="0" text="" resource-id="" class="android.widget.LinearLayout" package="com.YoStarJP.Arknights" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][2560,1440]"><node index="0" text="" resource-id="android:id/content" class="android.widget.FrameLayout" package="com.YoStarJP.Arknights" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][2560,1440]"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.YoStarJP.Arknights" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][2560,1440]"><node index="0" text="" resource-id="com.YoStarJP.Arknights:id/unitySurfaceView" class="android.view.View" package="com.YoStarJP.Arknights" content-desc="Game view" checkable="false" checked="false" clickable="false" enabled="true" focusable="true" focused="true" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][2560,1440]" /></node></node></node></node></hierarchy>
```
