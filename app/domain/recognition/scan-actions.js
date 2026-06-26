const commonScanActions = [
  { profile: "runStatusFull", label: "基本情報" },
  { profile: "operatorsFull", label: "オペレーター" },
  { profile: "relicsFull", label: "秘宝" },
];

const campaignSpecificScanActions = {
  is4_sami: [{ profile: "is4RevelationFull", label: "啓示" }],
  is5_sarkaz: [{ profile: "is5ThoughtFull", label: "思案" }],
  is6_sui: [{ profile: "is6CoinsFull", label: "通宝" }],
};

export function getRecognitionScanActions(campaignId) {
  const actions = [...commonScanActions, ...(campaignSpecificScanActions[campaignId] || [])];
  return actions.map((item) => ({ ...item }));
}
