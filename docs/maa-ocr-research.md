# MAA OCR調査メモ

作成日: 2026-06-22

## 対象

- MaaAssistantArknights/MaaAssistantArknights dev-v2
- 調査対象: OCR実装、タスクJSON、統合戦略関連リソース
- 本プロジェクト目的: OBS用オーバーレイの半自動入力に使えるOCR/画像認識設計の抽出

## 参照した主要ファイル

- https://github.com/MaaAssistantArknights/MaaAssistantArknights
- https://github.com/MaaAssistantArknights/MaaAssistantArknights/tree/dev-v2/resource
- https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/dev-v2/src/MaaCore/Vision/OCRer.cpp
- https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/dev-v2/src/MaaCore/Vision/RegionOCRer.cpp
- https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/dev-v2/src/MaaCore/Vision/TemplDetOCRer.cpp
- https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/dev-v2/src/MaaCore/Vision/Config/OCRerConfig.cpp
- https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/dev-v2/src/MaaCore/Config/TaskData.cpp
- https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/dev-v2/resource/tasks/tasks.json
- https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/dev-v2/resource/tasks/Roguelike/base.json
- https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/dev-v2/resource/tasks/Roguelike/Sarkaz.json
- https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/dev-v2/resource/tasks/Roguelike/Sami.json
- https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/dev-v2/resource/tasks/Roguelike/JieGarden.json

## MAAのOCR構成

- MAAはAndroid UIツリーではなく、スクリーンショット画像に対する画像認識を主軸にしている。
- README上でも画像認識ベースのツールとして説明され、OpenCV、PaddleOCR、FastDeploy、onnxruntimeが使われている。
- `resource`配下に `PaddleOCR`、`PaddleCharOCR`、`tasks`、`roguelike`、`template` が分かれており、モデル・タスク定義・ローグライク戦略データが分離されている。
- OCRエンジン実装は `OcrPack` 経由でPaddleOCR ONNXモデルをロードする。
- `OCRer` はOCR結果に対して、矩形補正、空白trim、正規表現置換、期待語フィルタを順番に実行する。

## タスクJSONで使っているOCRパラメータ

MAAの `OcrDetect` タスクで本プロジェクトに参考になる項目:

- `roi`: 画面内の認識範囲。MAAは概ね1280x720基準。本プロジェクトのMuMuキャプチャは2560x1440なので2倍スケールで流用できる。
- `text`: 期待文字列。空配列の場合はOCR結果を取得する目的で使っている。
- `fullMatch`: 完全一致要求。招集オペレーター名など短い固有名詞に向く。
- `isAscii`: 数値や英字用のOCRモデル/処理に寄せるフラグ。
- `withoutDet`: 検出器を使わず、ROI全体を文字列として認識する。固定領域の数値・短文に向く。
- `ocrReplace`: OCR後の正規表現置換。誤認識補正の中心。
- `replaceFull`: 置換ヒット時に全文を指定値へ置き換える。候補正規化に使える。
- `binThreshold`: グレースケール二値化閾値。小さい数字・白文字抽出に使える。
- `useRaw`: 二値化画像ではなく元画像をOCRへ渡す選択。

## MAAの後処理で特に重要な点

1. OCR結果をそのまま使わない。必ず正規化レイヤーを通す。
2. 数値OCRは専用の置換セットを持つ。MAAの `NumberOcrReplace` では、`[Oo] -> 0`、`[Ii] -> 1`、`[Ll] -> 1`、`B -> 8`、空白除去などを行っている。
3. 期待語リストがある場合、OCR結果に期待語が含まれたら結果文字列を期待語そのものへ置き換える。これにより多少のOCR揺れを吸収できる。
4. 統合戦略の処理では、分隊・招集・商店・決算・特殊値などをそれぞれ別ROIで読む設計になっている。

## ローグライク関連の参考タスク

- `RoguelikeCustom-HijackSquad`: `roi [0,383,1280,142]`。分隊領域を広くOCRし、`ocrReplace`で崩れやすい分隊名を補正している。
- `RoguelikeRecruitOcr`: 招集画面の職分/券種らしき短い文字列を小ROIでOCR。
- `RoguelikeRecruitSupportOcr`: 助戦/招集候補の名前帯を横長ROIでOCR。
- `RoguelikeSettlementOcr-*`: 決算画面の数値を `NumberOcrReplace` ベースで複数ROIから取得。
- `Sami@Roguelike@CheckCollapsalParadigms*`: サーミの崩壊/パラダイム系表示を期待語リストで判定。
- `Sami@Roguelike@FoldartalGainOcr`: 啓示板系の語彙を期待語リストで判定。
- `JieGarden@Roguelike@CoppersAnalyzer-*`: 歳の銭/交換系表示で、テンプレート検出 + 相対OCRに近い構成を使っている。

## 分隊選択画面への適用実験

対象スクリーンショット:

- `O:\Arknights_Rogue_OBSTool\experiments\adb\sarkaz-squad-select-20260622-224312\screenshot.png`

MAAの `RoguelikeCustom-HijackSquad` ROI `[0,383,1280,142]` を2560x1440へ2倍スケールし、`[0,766,2560,284]` として切り出した。さらに分隊カード別に切り出した。

保存先:

- `O:\Arknights_Rogue_OBSTool\experiments\adb\sarkaz-squad-select-20260622-224312\maa_style_roi_crops`
- `O:\Arknights_Rogue_OBSTool\experiments\adb\sarkaz-squad-select-20260622-224312\maa_style_roi_ocr.json`

Windows OCR結果:

```text
maa_hijack_squad_scaled: 霊 魂 護 送 分 隊 新 エ リ ア に 入 る た び 、 妙 博 学 多 識 分 隊 初 期 負 荷 臨 界 点 + 10 、 位 置 測 定 分 隊 ス ポ ッ ト 更 新 回 数 + 1 、 初 期 指 揮 分 隊 最 大 耐 久 値 + 5 、 戦 闘 終 編 成 上 限 +.
squad_card_1: 霊 魂 護 送 分 隊 新 エ リ ア に 入 る た び 、 妙 想 + 2 、 負 荷 臨 界 点 + 1
squad_card_2: 博 学 多 識 分 隊 初 期 負 荷 臨 界 点 + IO 、 初 期 希 望 + 2
squad_card_3: 位 置 測 定 分 隊 ス ポ ッ ト 更 新 回 数 + 1 、 初 期 構 想 + 1 。 各 ス ポ ッ ト の 初 回 更 新 時 に 構 想 を 消 費 し な い
squad_card_4: 指 揮 分 隊 最 大 耐 久 値 + 5 、 戦 闘 終 了 時 に 追 加 で 耐 久 値 を 1 回 復 す る 編 成 上 限 + 人 数 + 2 。 ス 予 備 隊 フ
squad_title_and_status: 指 揮 Lv 当 ー 分 隊 選 択 4 / 4 0 / 10
```

所見:

- 広域ROIは全カードの概要取得に向く。
- カード別ROIは分隊名と効果文の対応付けに向く。
- `+ IO` はMAAの数値置換ルールを使えば `+ 10` に補正可能。
- 分隊名は空白除去後、既知分隊名辞書へ近似一致すれば安定する。
- 選択中分隊はOCRではなく、カード枠・選択マーク・明度差の画像特徴で判定した方がよい。

## 本プロジェクトで採る設計

### 1. OCRタスクをJSON化する

各画面ごとに以下のようなタスク定義を持つ。

```json
{
  "id": "is5.squad.cards",
  "screen": "is5_squad_select",
  "roiBase": "1280x720",
  "roi": [0, 383, 1280, 142],
  "mode": "ocr",
  "normalize": ["remove_spaces", "jp_numeric", "dictionary_match"],
  "dictionary": "is5_squads"
}
```

### 2. OCR結果は候補として扱う

保存する値:

- rawText
- normalizedText
- matchedId
- score
- roi
- sourceImage
- timestamp
- confidence/status: auto / needs_review / manual_override

### 3. 補正辞書を分ける

- global numeric: `O/o -> 0`, `I/l/L -> 1`, `B -> 8`, 空白除去
- Japanese UI: `分 隊 -> 分隊` のような空白除去、長音/記号の揺れ補正
- IS別辞書: 分隊名、秘宝名、特殊値名、ボスフラグ名
- mode-specific: サルカズの思案/時代、サーミの崩壊値/啓示、歳の銭など

### 4. RegionOCRer相当を作る

固定ROIを二値化し、文字がある矩形だけをさらに絞ってからOCRする。用途:

- 耐久値
- 希望
- 等級/難易度
- 思案
- 時代
- 銭
- 崩壊値

### 5. TemplDetOCRer相当を作る

テンプレート/アイコン/カード枠を検出し、その相対位置をOCRする。用途:

- 秘宝カードのアイコン検出 + 名前/説明OCR
- 招集オペレーターカードの顔/職分/名前OCR
- 選択中分隊のハイライト検出
- ボスフラグ秘宝の所持検出

## 採らない方がよいもの

- MAAのC++実装をそのままコピーしない。AGPL-3.0の影響が強くなるため、設計参考に留める。
- 最初からPaddleOCR/ONNXランタイムを必須化しない。省リソース方針ではWindows OCRで開始し、必要な画面だけ後でPaddleOCRを追加する。
- OCRだけで確定扱いにしない。大会/配信用途では誤表示が致命的なので、手入力・第三者入力・確認待ち状態を必ず残す。

## 次の実装候補

1. `tools/ocr-probe.ps1` またはNode/Pythonラッパーを作り、ADBスクショ -> ROI crop -> Windows OCR -> JSON出力をワンコマンド化する。
2. `data/recognition/ocr-tasks.json` を作り、分隊選択・トップ画面・招集画面のROIを登録する。
3. `data/recognition/normalize-rules.json` にMAA式の数値補正と日本語空白除去を入れる。
4. 既存の分隊データを辞書として使い、OCR結果から `squadId` を近似一致で返す。
5. OBS UI側は `autoSuggestion` と `manualValue` を分け、OCR結果が怪しい場合は確認待ちにする。
