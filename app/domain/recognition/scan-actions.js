const commonScanActions = [
  { profile: "runStatusFull", label: "基本情報" },
  { profile: "operatorsFull", label: "オペレーター" },
  { profile: "relicsFull", label: "秘宝" },
];

const campaignScanActionOverrides = {
  is5_sarkaz: [
    { profiles: ["runStatusFull", "is5AgeFull"], label: "サルカズ基礎" },
    { profile: "operatorsFull", label: "オペレーター" },
    { profile: "relicsFull", label: "秘宝" },
    { profile: "is5ThoughtFull", label: "思案" },
  ],
};

const campaignSpecificScanActions = {
  is4_sami: [{ profile: "is4RevelationFull", label: "啓示" }],
  is6_sui: [{ profile: "is6CoinsFull", label: "通宝" }],
};

function copyAction(item) {
  const action = { ...item };
  if (Array.isArray(item.profiles)) action.profiles = [...item.profiles];
  return action;
}

export function getRecognitionScanActions(campaignId) {
  const actions = campaignScanActionOverrides[campaignId]
    || [...commonScanActions, ...(campaignSpecificScanActions[campaignId] || [])];
  return actions.map(copyAction);
}
