# Recognition Notes

MaaAssistantArknights can be used as a public technical reference for general ADB/OCR architecture and recognition strategy.
Do not copy its source code or assets into this project.

Initial recognition goals:

- capture screenshots through ADB
- identify screens relevant to Integrated Strategies run state
- propose relic/operator/squad updates
- assign confidence levels to suggested updates
- let manual input accept, reject, or correct suggestions

Recognition is intentionally lower priority than the manual and tournament workflows.

## MAA OCR reference

OCR/ADB半自動取得の詳細調査は [maa-ocr-research.md](./maa-ocr-research.md) にまとめる。MAAのROI/OcrDetect/ocrReplace/NumberOcrReplaceの考え方を、本プロジェクトのOCRタスクJSON設計へ反映する。
