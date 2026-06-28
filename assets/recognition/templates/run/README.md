# Run screen recognition templates

These small PNG templates are cropped from Japanese 1280x720 Arknights Integrated Strategies screens and are used by RHODES OBS COMMANDER3373 for template-anchored OCR.

Active OCR anchors:
- `IdeaIcon.png`: reads the conception value below the icon. The thought burden gauge is intentionally not used as run data.
- `HopeCurrentArrow.png` and `HopeCurrentFullArrow.png`: read current hope in non-full and full states.
- `HopeMaxArrow.png`: reads maximum hope.
- `IngotIcon.png`: reads originium ingots.
- `LifeIcon.png`: reads current life points.
- `ShieldIcon.png`: reads shield value.
- `OperatorCardCodeNameFlag.png`: reads operator names on the current squad/operator card screen.

Navigation marker assets:
- `RelicButton.png`
- `OperatorButton.png`
- `ThoughtButton.png`

The navigation marker assets are kept separate from active OCR anchors so future tap-position template matching can use them without changing the OCR candidate flow.
