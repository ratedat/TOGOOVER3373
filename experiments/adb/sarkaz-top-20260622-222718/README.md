# ADB実証メモ: サルカズ トップ画面

- 実施日時: 2026-06-22 22時台
- 対象: MuMu Player 12 / com.YoStarJP.Arknights / サルカズの炉辺奇談トップ画面
- 使用ADB: M:\Program Files\Netease\MuMu Player 12\shell\adb.exe
- 使用serial: 127.0.0.1:16384

## ADBで直接取れたもの

- 接続端末一覧、対象serial、画面サイズ・密度
- 起動中アプリとActivity: com.YoStarJP.Arknights/com.u8.sdk.U8UnityContext
- アプリバージョン: versionCode=2000128 / versionName=35.7.01
- PID: 2865
- スクリーンショット: 2560x1440相当の横画面PNG
- Unityの最上位View: resource-id=com.YoStarJP.Arknights:id/unitySurfaceView / content-desc=Game view
- 外部保存領域: /sdcard/Android/data/com.YoStarJP.Arknights/files 以下

## ADBだけでは取れなかったもの

- Unity内のUIテキスト、秘宝名、分隊名、現在値などはUIAutomator XMLに出ない
- /data/user/0/com.YoStarJP.Arknights は Permission denied
- run-as は package not debuggable
- BattleLog は空、FileStorage内の BattleLogNeedToUpload.json は0 bytes
- logcat直近出力から現在の統合戦略状態は確認できなかった

## 外部保存領域の所見

- Bundles等の静的/更新リソースは読める
- 小規模ファイルは購入・GUID・BattleLogアップロード待ちなどで、現在のローグライク進行状態らしいJSON/DBは見つからない
- OBBも読めるがライブ状態取得には直接向かない

## 速度

- adb shell screencap + pull: avg 1396.8ms / min 1355.9ms / max 1467.4ms
- adb exec-out screencap -p: avg 1213.7ms / min 1188.7ms / max 1233.9ms
- 最新再取得: 1408.5ms / 4,179,319 bytes
- UIAutomator dump + pull: avg 2288.2ms / min 2260.7ms / max 2312.6ms、かつUnity内部テキストなし

## Windows標準OCRの結果

- Windows.Media.Ocr / ja が使用可能
- フル画面OCRで約215文字を取得
- 誤認識はあるが、固定位置のメニュー名・数値・画面状態は利用可能そう

最新OCRテキスト:

```text
炉 辺 畚 談 。 、 、 104 仮 説 集 HYPOTHESESCOMPUTON LV ・ 魂 の 交 流 守 則 CGO! 儀 式 保 存 館 NEW ー WITCHCRAFTARCHIVES 歴 史 再 編 59 投 資 シ ス テ ム 628 18 ー 魂 に 直 面 ト 探 検 開 始 ィ IN STORYWE GO 0 印 象 再 構 築 く X 〉 通 常 探 索 五 ロ 多 面 探 索 勲 章 シ リ ー ズ
```

読めている/推定できる例:

- サルカズの炉辺奇談トップ画面であること: 「炉辺畚談」などに崩れるが位置で補正可能
- 仮説集Lv: 104
- 「魂の交流守則」
- 「儀式保存館」
- 「歴史再編」および 59
- 「投資システム」および 628
- 「探索開始」
- 「通常探索」「多面探索」「勲章シリーズ」

## 設計判断

- ADBはキャプチャ取得・画面状態確認・端末制御の土台にする
- ゲーム内状態はADBのXML/ファイルから直接読む設計にはしない
- 自動/半自動取得は「ADBスクリーンショット + 固定領域OCR + アイコン/テンプレート照合」を主軸にする
- OBS表示・大会用途では、手入力/第三者入力を正として保持し、OCR結果は候補補助・差分検出として使う
- 秘宝所持・ボスフラグ・思案/時代/銭などは、まず手入力UIを作り、その後画面別OCR/テンプレート照合を段階的に追加する

## 保存ファイル

- screenshot_latest.png: 最新ADBキャプチャ
- window.xml: UIAutomator XML
- windows_ocr_latest.txt/json: OCR結果
- adb_probe_facts.json: 端末/アプリ/権限情報
- adb_external_storage_probe.json / adb_external_small_dirs.json: 外部保存領域確認
- adb_capture_benchmark.csv / adb_execout_benchmark.csv: キャプチャ速度計測
