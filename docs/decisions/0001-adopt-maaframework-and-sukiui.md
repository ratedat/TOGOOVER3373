# ADR-0001: MAAFramework と SukiUI/Avalonia を主軸にする

## Status
Accepted

## Date
2026-06-30

## Context
RHODES OBS COMMANDER3373 は、ADB 接続、スクリーンショット取得、OCR、テンプレート検出、候補補正、OBS 表示を同時に扱う必要がある。これまで Electron/Tauri + Web UI と自前 OCR adapter を拡張してきたが、OCR 精度・ADB 差異・テンプレート調整に作業が集中しすぎている。

一方で MAAFramework は MAA の画像認識経験を基にした自動化フレームワークであり、Controller、Resource、Tasker、Custom Recognition/Action を持つ。C# binding は .NET 7+、Windows/Linux/macOS、x64/arm64 を対象としており、Avalonia/SukiUI と同じ .NET 側に寄せやすい。

SukiUI は Avalonia 向けのデスクトップ UI ライブラリで、Light/Dark テーマ、テーマカラー、追加コントロール、Toast/Dialog などを提供する。設定、状態確認、候補管理、デバッグ導線が多い RHODES には Web UI より適した方向性になる。

MFAToolsPlus は Avalonia ベースの MAAFramework 開発補助ツールであり、`MaaResource -> MaaController -> MaaTasker` の初期化、`AppendRecognition` による OCR/TemplateMatch 検証、認識結果可視化の実例として参照する。

## Decision
新しい本命クライアントを `apps/rhodes-suki` に追加し、長期的には以下へ移行する。

- UI: Avalonia + SukiUI
- 画像認識/ADB/OCR/テンプレート: MAAFramework
- OCR 補助: GLM-OCR は任意導入の高精度補助として維持
- OBS 連携/状態管理/ローグ固有候補化: RHODES 側に残す
- 開発補助: MFAToolsPlus を参照し、必要な薄い実装だけ RHODES に取り込む
- Resource 生成: 既存の `maa-tasks.json` / `scan-profiles.json` を MAA pipeline に変換し、publish 前に `rhodes-generated.json` を更新する

Electron/Tauri 版は、SukiUI 版が機能を引き継ぐまで検証済み実装として保持する。新規の OCR/ADB 改善は原則 MAAFramework 側に寄せ、Windows OCR や単体 PaddleOCR の自前拡張は旧互換に降格する。

基準解像度は 1280x720 とする。これは 16:9 解像度であり、テンプレートや ROI の初期座標系として扱う。

## Alternatives Considered

### Electron 継続
- Pros: 既存実装をそのまま使える
- Cons: 配布サイズが大きく、デスクトップ設定 UI として過剰。OCR/ADB の自前実装が増え続ける
- Rejected: 今後の主軸にはしない

### Tauri + Web UI 継続
- Pros: Electron より軽い。OBS ブラウザソースとの親和性が高い
- Cons: MAAFramework C# binding と UI を直接つなぐには Rust/Web の橋渡しが増える
- Rejected: OBS 表示は Web を残せるが、管理 UI の主軸にはしない

### 自前 OCR adapter 継続
- Pros: 既存コードの延長で改善できる
- Cons: MAA が既に解いている問題を再実装し続けることになる
- Rejected: 旧互換と検証用に限定する

## Consequences
- MAAFramework ファミリーのツールとして説明しやすくなり、上流エンジニアに相談しやすい単位へ分割できる
- RHODES 固有ロジックと MAAFramework 連携の責務が分かれる
- .NET/Avalonia のビルド・配布パイプラインを追加で維持する必要がある
- AGPL-3.0-only の本プロジェクトと LGPL-3.0-only の MAAFramework/SukiUI 依存を明確に表示する必要がある
- MFAToolsPlus 由来の具体的なコードをコピーする場合は GPL-3.0 表示と帰属を残す必要がある

## Sources
- SukiUI README: https://github.com/kikipoulet/SukiUI
- SukiUI Launch docs: https://kikipoulet.github.io/SukiUI/documentation/getting-started/launch.html
- MaaFramework README: https://github.com/MaaXYZ/MaaFramework/blob/main/README_en.md
- MaaFramework.Binding.CSharp README: https://github.com/MaaXYZ/MaaFramework.Binding.CSharp
- MFAToolsPlus README: https://github.com/SweetSmellFox/MFAToolsPlus
