# Third-Party Notices

RHODES OBS COMMANDER3373 is licensed under AGPL-3.0-only. See `LICENSE` for the full license text.

## MaaAssistantArknights

This project references and adapts ADB/OCR automation design, OCR task structures, and selected OCR replacement rules from MaaAssistantArknights by Maa Team. MaaAssistantArknights is licensed under AGPL-3.0-only.

- Project: https://github.com/MaaAssistantArknights/MaaAssistantArknights
- License: AGPL-3.0-only

When code, data structures, or implementation details are copied or adapted from MaaAssistantArknights, keep source attribution near the adapted files and preserve applicable license notices.

MaaAssistantArknights logos, trademarks, and brand assets are not imported into this project.

Vendored reference files are kept under `third_party/maa`; generated OCR rule data is stored under `data/recognition/maa-ocr-rules.json`.

MAA OCR configs, dictionaries, and optional ONNX model files may be synchronized into `third_party/maa/resource` by `npm run ocr:sync-maa` or `npm run ocr:sync-maa:models`. Keep these files under the same AGPL-3.0-only attribution.

## MFAToolsPlus

This project uses MFAToolsPlus as a reference implementation for MAAFramework developer tooling patterns, including MaaTasker session setup and small recognition probe payloads. MFAToolsPlus is a developer tool for RHODES maintainers; it is not vendored into release builds.

- Project: https://github.com/SweetSmellFox/MFAToolsPlus
- License: GPL-3.0

If RHODES copies MFAToolsPlus code directly in future work, keep source attribution near the copied files and preserve applicable GPL-compatible notices.

## GLM-OCR

This project can optionally call a user-installed local GLM-OCR SDK or local GLM-OCR server for verification-only OCR experiments. GLM-OCR packages and model files are not bundled with RHODES OBS COMMANDER3373.

- Project: https://github.com/zai-org/GLM-OCR
- Code license: Apache-2.0
- Model license: MIT

## uv

The app can optionally download uv into the local GLM-OCR runtime directory to install a managed Python runtime and isolated GLM-OCR venv. uv is not bundled with the EXE.

- Project: https://github.com/astral-sh/uv
- License: MIT OR Apache-2.0
