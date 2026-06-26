# RHODES OBS COMMANDER3373 起動ガイド

この文書は、配信・大会運用・開発デバッグでアプリをどう起動するかをまとめたものです。

## まず使う人向け

配布版がある場合は、次の exe を起動します。

```text
dist\RHODES OBS COMMANDER3373-0.1.0-x64.exe
```

展開済みディレクトリから直接起動する場合は、次の exe でも起動できます。

```text
dist\win-unpacked\RHODES OBS COMMANDER3373.exe
```

起動時にローカルサーバーのポート番号を聞かれます。通常は既定値の `5173` のままで問題ありません。OBS Browser Source のURLもこのポート番号を使います。

## ソースフォルダから起動する場合

コマンドを打たずに起動したい場合は、リポジトリ直下の次のファイルをダブルクリックします。

```text
start-windows.vbs
```

初回のみ、依存関係が不足していれば自動で `npm install` が走ります。完了後にデスクトップアプリが起動します。

この起動方法では、古い `5173` / `5174` / `5200` のローカルサーバーが残っている場合に停止してから起動します。

## 開発・デバッグ用の起動

PowerShellで作業する場合は、まずリポジトリへ移動します。

```powershell
cd O:\Arknights_Rogue_OBSTool
```

Control v2をElectronアプリで開く標準デバッグ起動です。

```powershell
npm.cmd run app:debug
```

内部的には `ARKNIGHTS_STATE_DIR=data` を使い、`http://127.0.0.1:5173/control-v2` を開きます。人間デバッグはブラウザ単体ではなく、基本的にこのElectronアプリ側で行います。

ポートを明示して起動したい場合は、次の形を使います。

```powershell
npm.cmd run app -- --view control-v2 --port 5173
```

Electronを使わず、ローカルWebサーバーだけ起動したい場合は次です。

```powershell
npm.cmd run dev
```

この場合はブラウザで各URLを開きます。

## よく使う画面URL

既定ポート `5173` の例です。起動時に別ポートを選んだ場合は、URL内の `5173` を置き換えてください。

| 用途 | URL |
| --- | --- |
| 旧Control | `http://127.0.0.1:5173/control` |
| Control v2 | `http://127.0.0.1:5173/control-v2` |
| Sidecar | `http://127.0.0.1:5173/sidecar` |
| OBS overlay | `http://127.0.0.1:5173/overlay` |

Control v2は画面を分けて開けます。

```text
http://127.0.0.1:5173/control-v2?screen=common
http://127.0.0.1:5173/control-v2?screen=operators
http://127.0.0.1:5173/control-v2?screen=relics
http://127.0.0.1:5173/control-v2?screen=special
http://127.0.0.1:5173/control-v2?screen=obs
```

## OBS Browser Source用URL

通常のまとめ表示です。

```text
http://127.0.0.1:5173/overlay
```

レイアウト別表示です。

```text
http://127.0.0.1:5173/overlay?layout=vertical&size=small
http://127.0.0.1:5173/overlay?layout=vertical&size=medium
http://127.0.0.1:5173/overlay?layout=vertical&size=large
http://127.0.0.1:5173/overlay?layout=horizontal&size=small
http://127.0.0.1:5173/overlay?layout=horizontal&size=medium
http://127.0.0.1:5173/overlay?layout=horizontal&size=large
http://127.0.0.1:5173/overlay?layout=full
```

OBS上でパーツを自由配置したい場合は、分割パーツURLを個別のBrowser Sourceにします。

```text
http://127.0.0.1:5173/overlay/part/status
http://127.0.0.1:5173/overlay/part/relics
http://127.0.0.1:5173/overlay/part/operators
http://127.0.0.1:5173/overlay/part/effects
http://127.0.0.1:5173/overlay/part/bosses
http://127.0.0.1:5173/overlay/part/special
```

## ADB連携作業時の起動

ADB連携の確認も、基本はElectronアプリを起動して行います。

```powershell
cd O:\Arknights_Rogue_OBSTool
npm.cmd run app:debug
```

ADB取得はブラウザのHTMLだけでは端末操作できません。Electronアプリ内のローカルNodeサーバーがADB実行を担当します。

ADB実行ファイルが見つからない場合は、Android platform-toolsをPATHに入れるか、次の環境変数で明示します。

```powershell
$env:ARKNIGHTS_ADB_PATH = "C:\path\to\adb.exe"
```

現在のControl v2では、選択中の統合戦略に応じてADB取得ボタンを出し分けます。

| 選択中IS | 表示される取得ボタン |
| --- | --- |
| IS#2 / IS#3 | 基本情報、オペレーター、秘宝 |
| IS#4 | 基本情報、オペレーター、秘宝、啓示 |
| IS#5 | 基本情報、オペレーター、秘宝、思案 |
| IS#6 | 基本情報、オペレーター、秘宝、通宝 |

取得結果は即座にOverlayへ反映せず、候補としてレビュー待ちに入れる設計です。誤認識や誤取得があり得るため、承認導線を通して反映する方針です。

## 検証・ビルド

テストだけ実行します。

```powershell
npm.cmd test
```

Electronの起動確認だけ行います。

```powershell
npm.cmd run app:smoke
```

テストとElectronディレクトリビルドをまとめて行います。

```powershell
npm.cmd run verify:desktop
```

配布用portable exeを作ります。

```powershell
npm.cmd run dist:win
```

## 状態ファイルとリセット

実行中の入力状態は、開発起動では主に次のファイルに保存されます。

```text
data/current-state.json
```

このファイルはGit管理対象外です。リセット操作をすると、現在のラン入力状態が初期化されます。リセット後に表示や選択状態が変に見える場合は、まずアプリの再読み込み、それでも直らなければアプリ再起動を行ってください。

## よくある問題

### OBSに何も出ない

OBS Browser Sourceのポート番号が、アプリ起動時に選んだポートと一致しているか確認します。

### ポートが競合して起動しない

起動時のポート選択で `5174` や `5200` など別ポートを選びます。OBS側URLのポート番号も同じ値へ変更します。

### ADB executable was not found と出る

ADBがPATHにない状態です。Android platform-toolsをインストールするか、`ARKNIGHTS_ADB_PATH` に `adb.exe` の場所を設定します。

### 二重起動した

通常は単一起動ガードにより既存ウィンドウが前面に出ます。もし古いサーバーだけが残っている場合は、`start-windows.vbs` から起動すると既知ポートの古いサーバーを止めてから起動します。
