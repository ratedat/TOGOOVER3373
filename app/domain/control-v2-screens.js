export const controlV2ScreenOptions = [
  {
    id: "common",
    label: "共通設定",
    description: "統合戦略、等級、分隊、ラン基本値をまとめて編集します。",
    detachPath: "/control-v2?screen=common",
  },
  {
    id: "operators",
    label: "オペレーター",
    description: "招集済みオペレーターをフィルター、並び替え、列数指定で選択します。",
    detachPath: "/control-v2?screen=operators",
  },
  {
    id: "relics",
    label: "秘宝",
    description: "所持秘宝を検索、カテゴリ、表示列で絞り込みながら選択します。",
    detachPath: "/control-v2?screen=relics",
  },
  {
    id: "special",
    label: "特殊値",
    description: "啓示、思案、通宝、構想などシリーズ固有値を個別入力します。",
    detachPath: "/control-v2?screen=special",
  },
  {
    id: "obs",
    label: "OBS設定",
    description: "OBSに貼るURL、スクロール速度、分割パーツを管理します。",
    detachPath: "/control-v2?screen=obs",
  },
  {
    id: "sidecar",
    label: "サイドカー",
    description: "配信外で使う確認、ADB/OCR取得、レビュー用の支援画面です。",
    detachPath: "/sidecar",
  },
];

export const controlV2ScreenIds = controlV2ScreenOptions.map((item) => item.id);

const controlV2ScreenMap = new Map(controlV2ScreenOptions.map((item) => [item.id, item]));

export function normalizeControlV2Screen(value) {
  return controlV2ScreenMap.has(value) ? value : "common";
}

export function getControlV2ScreenMeta(value) {
  return controlV2ScreenMap.get(normalizeControlV2Screen(value));
}
