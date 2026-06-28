import * as controlActions from "./control-actions.js";
import { clampCoinCount, normalizeCoinFace } from "./domain/special-values.js";
import { adbDetectUrl, adbSelectPathUrl, adbTestUrl, apiJson, recognitionScanCancelUrl, recognitionScanStatusUrl, recognitionScanUrl, resetStateUrl } from "./lib/api.js";
import { normalizeControlV2Screen } from "./domain/control-v2-screens.js";

function parseImportDraft(ui) {
  if (!ui.importDraft.trim()) throw new Error("JSONが空です");
  const parsed = JSON.parse(ui.importDraft);
  if (!parsed || typeof parsed !== "object") throw new Error("状態JSONではありません");
  return parsed;
}

async function getRecognitionScanStatus() {
  return apiJson(recognitionScanStatusUrl);
}

async function refreshRecognitionScanStatus(context, { render = true } = {}) {
  try {
    context.ui.recognitionScanStatus = await getRecognitionScanStatus();
    context.ui.recognitionScanStatusError = "";
    if (render) context.renderControl();
  } catch (error) {
    context.ui.recognitionScanStatusError = error.message;
    if (render) context.renderControl();
  }
}

function stopRecognitionStatusPolling(context) {
  if (context.ui.recognitionScanStatusTimer) clearInterval(context.ui.recognitionScanStatusTimer);
  context.ui.recognitionScanStatusTimer = null;
}

function startRecognitionStatusPolling(context) {
  stopRecognitionStatusPolling(context);
  context.ui.recognitionScanStatusTimer = setInterval(() => {
    refreshRecognitionScanStatus(context).catch(() => {});
  }, 700);
}

async function postRecognitionScan(profileId) {
  const response = await fetch(recognitionScanUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile: profileId, source: "adb" }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error || payload?.result?.reason || `${response.status} ${response.statusText}`;
    const error = new Error(message);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function recognitionProfileListFromButton(button) {
  return String(button.dataset.profiles || button.dataset.profile || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
async function postAdbDetect(settings) {
  return apiJson(adbDetectUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ settings }),
  });
}

async function postAdbTest(settings, { capture = false } = {}) {
  return apiJson(adbTestUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ settings, capture }),
  });
}

async function postAdbPathPicker() {
  return apiJson(adbSelectPathUrl, { method: "POST" });
}

function setChoicePressed(element, active) {
  if (!element) return;
  element.classList.toggle("active", active);
  element.setAttribute("aria-pressed", active ? "true" : "false");
}

export function getChoiceActive(type, id, state, context = {}) {
  if (typeof context.getChoiceActive === "function") return context.getChoiceActive(type, id);
  const key = type === "relic" ? "relics" : "operators";
  return (state[key] || []).includes(id);
}

export function getChoiceCount(ui, state, context = {}) {
  const choiceTab = ui.controlV2ChoiceTab;
  if (choiceTab === "relics") return typeof context.getEffectiveRelicCount === "function" ? context.getEffectiveRelicCount() : (state.relics || []).length;
  if (choiceTab === "operators") return (state.operators || []).length;
  return 0;
}

export function syncControlV2UiAfterStateReplace(ui) {
  const screen = normalizeControlV2Screen(ui.controlV2Screen);
  ui.controlV2Screen = screen;
  if (screen === "operators" || screen === "relics") {
    ui.controlV2ChoiceTab = screen;
  } else if (ui.controlV2ChoiceTab !== "operators" && ui.controlV2ChoiceTab !== "relics") {
    ui.controlV2ChoiceTab = "operators";
  }
  ui.forceFullChoiceRender = true;
}

function replaceControlState(context, nextState) {
  context.replaceState(nextState);
  syncControlV2UiAfterStateReplace(context.ui);
}

function reloadAfterReset(context) {
  if (typeof context.reloadView !== "function") return;
  setTimeout(() => context.reloadView(), 0);
}

function relicBadges(meta = {}) {
  const autoOnly = meta.template && !meta.manual;
  return [
    autoOnly ? '<span class="item-badge template">自動</span>' : '',
    meta.manual && meta.template ? '<span class="item-badge template">手動+自動</span>' : '',
  ].filter(Boolean).join("");
}

function updateRelicChoiceMeta(element, meta) {
  if (!element || !meta) return;
  element.classList.toggle("template-active", Boolean(meta.template && !meta.manual));
  const badges = element.querySelector(".item-badges");
  if (badges) badges.innerHTML = relicBadges(meta);
}

function refreshChoiceCountLabels(ui, state, context) {
  document.querySelectorAll(".control-v2-relic-count").forEach((node) => {
    node.textContent = node.textContent.replace(/所持\d+件/, `所持${context.getEffectiveRelicCount?.() ?? (state.relics || []).length}件`);
  });
  document.querySelectorAll(".control-v2-operator-count").forEach((node) => {
    node.textContent = node.textContent.replace(/招集\d+名/, `招集${(state.operators || []).length}名`);
  });
}

function toggleChoiceElement(element, type, id, context) {
  if (context.view === "sidecar") {
    context.mutate((state) => controlActions.toggleChoice(state, type, id));
    return;
  }
  const renderAfterToggle = Boolean(context.ui.forceFullChoiceRender);
  context.ui.forceFullChoiceRender = false;
  context.mutate((state) => controlActions.toggleChoice(state, type, id), { render: renderAfterToggle });
  if (renderAfterToggle) return;
  const state = context.getState();
  const active = getChoiceActive(type, id, state, context);
  setChoicePressed(element, active);
  if (type === "relic") updateRelicChoiceMeta(element, context.getRelicChoiceMeta?.(id));
  refreshChoiceCountLabels(context.ui, state, context);
}

function isControlView(context) {
  return context.view === "control-v2" || context.view === "sidecar";
}

export function registerControlEvents(app, context) {
  app.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !isControlView(context)) return;
    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === "add-special-effect") {
      const fieldId = button.dataset.specialPickerField;
      const container = button.closest("[data-special-picker]");
      const value = container?.querySelector("[data-special-picker-select]")?.value;
      if (fieldId && value) {
        context.mutate((state) => controlActions.addSpecialEffect(state, context.getCampaign().id, fieldId, value));
      }
      return;
    }
    if (action === "remove-special-effect") {
      const fieldId = button.dataset.specialPickerField;
      if (fieldId && id) {
        context.mutate((state) => controlActions.removeSpecialEffect(state, context.getCampaign().id, fieldId, id));
      }
      return;
    }
    if (action === "add-revelation-board-rhetoric") {
      const fieldId = button.dataset.revelationBoardField;
      const rhetoricId = button.dataset.rhetoricId;
      if (fieldId && rhetoricId) {
        const campaignId = context.getCampaign().id;
        const fieldConfig = context.getSpecialFieldConfig(campaignId, fieldId) || { id: fieldId };
        context.mutate((state) => controlActions.addRevelationBoardRhetoric(state, campaignId, fieldId, rhetoricId, fieldConfig, context.normalizeRevelationBoardValue));
      }
      return;
    }
    if (action === "remove-revelation-board-rhetoric") {
      const fieldId = button.dataset.revelationBoardField;
      const index = Number(button.dataset.index);
      if (fieldId && Number.isInteger(index)) {
        const campaignId = context.getCampaign().id;
        const fieldConfig = context.getSpecialFieldConfig(campaignId, fieldId) || { id: fieldId };
        context.mutate((state) => controlActions.removeRevelationBoardRhetoric(state, campaignId, fieldId, index, fieldConfig, context.normalizeRevelationBoardValue));
      }
      return;
    }
    if (action === "add-effect-stack-entry") {
      const fieldId = button.dataset.effectStackField;
      const container = button.closest("[data-effect-stack-builder]");
      const effectId = container?.querySelector('[data-effect-stack-input="effect"]')?.value;
      if (fieldId && effectId) {
        const campaignId = context.getCampaign().id;
        const fieldConfig = context.getSpecialFieldConfig(campaignId, fieldId) || { id: fieldId };
        const count = clampCoinCount(container?.querySelector('[data-effect-stack-input="count"]')?.value);
        const stateId = context.normalizeStackState(fieldConfig, container?.querySelector('[data-effect-stack-input="state"]')?.value, campaignId);
        context.mutate((state) => controlActions.addEffectStackEntry(state, campaignId, fieldId, { effectId, count, stateId }, fieldConfig, context.mergeEffectStackEntries));
      }
      return;
    }
    if (action === "remove-effect-stack-entry") {
      const fieldId = button.dataset.effectStackField;
      const index = Number(button.dataset.index);
      if (fieldId && Number.isInteger(index)) {
        context.mutate((state) => controlActions.removeEffectStackEntry(state, context.getCampaign().id, fieldId, index));
      }
      return;
    }
    if (action === "add-coin-entry") {
      const fieldId = button.dataset.coinField;
      const container = button.closest("[data-coin-builder]");
      const coinId = container?.querySelector('[data-coin-input="coin"]')?.value;
      if (fieldId && coinId) {
        const count = clampCoinCount(container?.querySelector('[data-coin-input="count"]')?.value);
        const statusId = container?.querySelector('[data-coin-input="status"]')?.value || null;
        const face = normalizeCoinFace(container?.querySelector('[data-coin-input="face"]')?.value);
        context.mutate((state) => controlActions.addCoinEntry(state, context.getCampaign().id, fieldId, { coinId, count, statusId, face }));
      }
      return;
    }
    if (action === "remove-coin-entry") {
      const fieldId = button.dataset.coinField;
      const index = Number(button.dataset.index);
      if (fieldId && Number.isInteger(index)) {
        context.mutate((state) => controlActions.removeCoinEntry(state, context.getCampaign().id, fieldId, index));
      }
      return;
    }
    if (action === "control-v2-screen") {
      const screen = normalizeControlV2Screen(button.dataset.screen);
      context.ui.controlV2Screen = screen;
      if (screen === "operators" || screen === "relics") context.ui.controlV2ChoiceTab = screen;
      context.renderControl();
      return;
    }
    if (action === "control-v2-choice-tab") {
      const choiceTab = button.dataset.choiceTab === "relics" ? "relics" : "operators";
      context.ui.controlV2ChoiceTab = choiceTab;
      context.ui.controlV2Screen = choiceTab;
      context.renderControl();
      return;
    }
    if (action === "toggle-relic") { toggleChoiceElement(button, "relic", id, context); return; }
    if (action === "toggle-operator") { toggleChoiceElement(button, "operator", id, context); return; }
    if (action === "clear-relics") context.mutate(controlActions.clearRelics);
    if (action === "adb-browse-path") {
      button.disabled = true;
      context.setNotice("ADB実行ファイルを選択してください。");
      try {
        const result = await postAdbPathPicker();
        if (!result.canceled && result.path) {
          context.mutate((state) => controlActions.updateAdbSetting(state, "adbPath", result.path));
          context.setNotice("ADBパスを反映しました。");
        } else {
          context.setNotice("ADBパス選択をキャンセルしました。");
        }
      } catch (error) {
        context.setNotice(`ADBパス選択失敗: ${error.message}`);
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (action === "adb-detect") {
      button.disabled = true;
      context.setNotice("ADB接続候補を検出しています。");
      try {
        context.ui.adbDetection = await postAdbDetect(context.getState().adb);
        context.ui.adbTestResult = null;
        context.renderControl();
        const deviceCount = context.ui.adbDetection?.devices?.length || 0;
        context.setNotice(`ADB検出完了: 端末${deviceCount}件`);
      } catch (error) {
        context.ui.adbDetection = null;
        context.setNotice(`ADB検出失敗: ${error.message}`);
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (action === "adb-test" || action === "adb-screenshot-test") {
      button.disabled = true;
      const capture = action === "adb-screenshot-test";
      context.setNotice(capture ? "ADBスクリーンショットテストを実行しています。" : "ADB接続テストを実行しています。");
      try {
        context.ui.adbTestResult = await postAdbTest(context.getState().adb, { capture });
        context.renderControl();
        const path = context.ui.adbTestResult?.screenshot?.path;
        context.setNotice(path ? `ADBスクリーンショットを保存しました: ${path}` : "ADBテストが完了しました。");
      } catch (error) {
        context.ui.adbTestResult = { ok: false, error: error.message };
        context.renderControl();
        context.setNotice(`ADBテスト失敗: ${error.message}`);
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (action === "adb-use-candidate") {
      const adbPath = button.dataset.adbPath || "";
      context.mutate((state) => controlActions.updateAdbSetting(state, "adbPath", adbPath));
      context.setNotice("ADBパスを反映しました。");
      return;
    }
    if (action === "adb-use-device") {
      const serial = button.dataset.adbSerial || "";
      context.mutate((state) => controlActions.updateAdbSetting(state, "serial", serial));
      context.setNotice("接続先を反映しました。");
      return;
    }
    if (action === "trigger-recognition-scan") {
      const profileIds = recognitionProfileListFromButton(button);
      if (!profileIds.length) return;
      const startedAt = new Date().toISOString();
      button.disabled = true;
      context.ui.recognitionScanStatus = {
        active: { profileId: profileIds.join(","), profileLabel: button.textContent?.trim() || profileIds.join(","), source: "adb", status: "starting", stage: "request", startedAt, updatedAt: startedAt, log: [] },
        lastScan: context.ui.recognitionScanStatus?.lastScan || null,
      };
      context.renderControl();
      startRecognitionStatusPolling(context);
      context.setNotice(profileIds.length > 1 ? `ADB連続スキャンを開始しました: ${profileIds.length}件` : "ADBスキャンを開始しました。コンパネに進行状況を表示します。");
      try {
        let totalCount = 0;
        let totalAutoCount = 0;
        const logPaths = [];
        for (const profileId of profileIds) {
          const payload = await postRecognitionScan(profileId);
          if (payload.state) replaceControlState(context, payload.state);
          totalCount += payload.result?.suggestions?.length || 0;
          totalAutoCount += payload.result?.autoApplied?.length || 0;
          if (payload.result?.logPath) logPaths.push(payload.result.logPath);
        }
        await refreshRecognitionScanStatus(context, { render: false });
        context.renderControl();
        const logPath = logPaths.length ? ` / Log: ${logPaths.at(-1)}` : "";
        context.setNotice(`ADBスキャン完了: 候補${totalCount}件 / 自動反映${totalAutoCount}件${logPath}`);
      } catch (error) {
        await refreshRecognitionScanStatus(context, { render: false });
        context.renderControl();
        context.setNotice(`ADBスキャン中止/失敗: ${error.message}`);
      } finally {
        stopRecognitionStatusPolling(context);
        button.disabled = false;
      }
      return;
    }
    if (action === "cancel-recognition-scan") {
      await fetch(recognitionScanCancelUrl, { method: "POST" });
      await refreshRecognitionScanStatus(context, { render: false });
      context.renderControl();
      context.setNotice("ADBスキャン停止を要求しました。");
      return;
    }
    if (action === "reset-state") {
      if (confirm("状態を初期化しますか？")) {
        replaceControlState(context, await apiJson(resetStateUrl, { method: "POST" }));
        context.setNotice("状態を初期化しました。画面を再読み込みします。");
        reloadAfterReset(context);
      }
      return;
    }
    if (action === "add-boss-flag") {
      const text = context.ui.bossDraft.trim();
      if (text) context.mutate((state) => { controlActions.addBossFlag(state, text); context.ui.bossDraft = ""; });
    }
    if (action === "remove-boss-flag") context.mutate((state) => controlActions.removeBossFlag(state, Number(button.dataset.index)));
    if (action === "dismiss-suggestion") context.mutate((state) => controlActions.dismissSuggestion(state, Number(button.dataset.index)));
    if (action === "copy-text") {
      const value = button.dataset.value || "";
      if (!value) return;
      await navigator.clipboard.writeText(value);
      context.setNotice(`${button.dataset.copyLabel || "URL"}をコピーしました。`);
      return;
    }
    if (action === "copy-state-json") {
      await navigator.clipboard.writeText(JSON.stringify(context.getState(), null, 2));
      context.setNotice("状態JSONをコピーしました。");
    }
    if (action === "import-state-now") {
      try {
        replaceControlState(context, parseImportDraft(context.ui));
        context.renderControl();
        context.scheduleSave();
        context.setNotice("JSONを直接反映しました。");
      } catch (error) { context.setNotice(error.message); }
    }
    if (action === "submit-tournament-state") {
      try {
        const pending = parseImportDraft(context.ui);
        context.mutate((state) => controlActions.holdTournamentState(state, pending));
        context.setNotice("大会入力として保留しました。ボス/大会タブで反映できます。");
      } catch (error) { context.setNotice(error.message); }
    }
    if (action === "approve-tournament") {
      const pending = context.getState().tournament?.pendingState;
      if (pending) {
        replaceControlState(context, pending);
        context.getState().tournament = { pendingState: null, lastSubmissionAt: null, submittedBy: null };
        context.renderControl();
        context.scheduleSave();
        context.setNotice("大会入力を反映しました。");
      }
    }
    if (action === "reject-tournament") context.mutate(controlActions.clearTournamentState);
  });

  app.addEventListener("keydown", (event) => {
    if (!isControlView(context)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest('.operator-choice[data-action="toggle-operator"], .relic-choice[data-action="toggle-relic"]');
    if (!target) return;
    event.preventDefault();
    const id = target.dataset.id;
    if (target.dataset.action === "toggle-relic") {
      toggleChoiceElement(target, "relic", id, context);
    } else {
      toggleChoiceElement(target, "operator", id, context);
    }
  });

  app.addEventListener("input", (event) => {
    if (!isControlView(context)) return;
    const target = event.target;
    if (target.matches("[data-adb-setting]")) {
      context.ui.adbDetection = null;
      context.ui.adbTestResult = null;
      context.mutate((state) => controlActions.updateAdbSetting(state, target.dataset.adbSetting, target.value, target.checked), { render: false });
      return;
    }
    if (!target.matches("[data-ui]")) return;
    const key = target.dataset.ui;
    context.ui[key] = target.value;
    if (key === "relicSearch") {
      if (!event.isComposing && !context.refreshRelicListOnly()) context.renderControl();
    }
  });

  app.addEventListener("compositionend", (event) => {
    if (!isControlView(context)) return;
    const target = event.target;
    if (!target.matches('[data-ui="relicSearch"]')) return;
    context.ui.relicSearch = target.value;
    if (!context.refreshRelicListOnly()) context.renderControl();
  });

  app.addEventListener("change", (event) => {
    if (!isControlView(context)) return;
    const target = event.target;
    if (target.matches("[data-adb-setting]")) {
      context.ui.adbDetection = null;
      context.ui.adbTestResult = null;
      context.mutate((state) => controlActions.updateAdbSetting(state, target.dataset.adbSetting, target.value, target.checked));
      return;
    }
    if (target.matches("[data-ui]")) {
      context.ui[target.dataset.ui] = target.value;
      context.renderControl();
      return;
    }
    const field = target.dataset.field;
    if (field) {
      context.mutate((state) => controlActions.updateRunField(state, field, target.value, target.checked));
      return;
    }
    const bossSelect = target.dataset.bossSelect;
    if (bossSelect) {
      context.mutate((state) => controlActions.updateBossSelect(state, context.getCampaign().id, bossSelect, target.value));
    }
    const bossToggle = target.dataset.bossToggle;
    if (bossToggle) {
      context.mutate((state) => controlActions.updateBossToggle(state, context.getCampaign().id, bossToggle, target.value, target.checked));
    }
    const specialVisibility = target.dataset.specialVisibility;
    if (specialVisibility) {
      const campaign = context.getCampaign();
      const fieldConfig = (campaign.specialFields || []).find((field) => field.id === specialVisibility) || { id: specialVisibility };
      const key = context.getSpecialOverlayToggleKey(fieldConfig);
      context.mutate((state) => controlActions.updateSpecialVisibility(state, campaign.id, key, target.checked));
    }
    const revelationBoardSelect = target.dataset.revelationBoardSelect;
    if (revelationBoardSelect) {
      const campaignId = context.getCampaign().id;
      const fieldConfig = context.getSpecialFieldConfig(campaignId, revelationBoardSelect) || { id: revelationBoardSelect };
      context.mutate((state) => controlActions.updateRevelationBoardSlot(state, campaignId, revelationBoardSelect, target.dataset.kind, target.value, fieldConfig, context.normalizeRevelationBoardValue));
    }
    const specialField = target.dataset.specialField;
    if (specialField) {
      const campaignId = context.getCampaign().id;
      const fieldConfig = context.getSpecialFieldConfig(campaignId, specialField);
      context.mutate((state) => controlActions.updateSpecialField(state, campaignId, specialField, target.value, fieldConfig));
    }
    const specialEffectToggle = target.dataset.specialEffectToggle;
    if (specialEffectToggle) {
      context.mutate((state) => controlActions.updateSpecialEffectToggle(state, context.getCampaign().id, specialEffectToggle, target.value, target.checked));
    }
    const specialRankedField = target.dataset.specialRankedField;
    if (specialRankedField) {
      context.mutate((state) => controlActions.updateSpecialRankedField(state, context.getCampaign().id, specialRankedField, target.dataset.effectParent, target.value));
    }

    const effectStackEntryCount = target.dataset.effectStackEntryCount;
    if (effectStackEntryCount) {
      const campaignId = context.getCampaign().id;
      const fieldConfig = context.getSpecialFieldConfig(campaignId, effectStackEntryCount) || { id: effectStackEntryCount };
      context.mutate((state) => controlActions.updateEffectStackEntryCount(state, campaignId, effectStackEntryCount, Number(target.dataset.index), target.value, fieldConfig, context.mergeEffectStackEntries));
    }
    const effectStackEntryState = target.dataset.effectStackEntryState;
    if (effectStackEntryState) {
      const campaignId = context.getCampaign().id;
      const fieldConfig = context.getSpecialFieldConfig(campaignId, effectStackEntryState) || { id: effectStackEntryState };
      const stateId = context.normalizeStackState(fieldConfig, target.value, campaignId);
      context.mutate((state) => controlActions.updateEffectStackEntryState(state, campaignId, effectStackEntryState, Number(target.dataset.index), stateId, fieldConfig, context.mergeEffectStackEntries));
    }
    const revelationRhetoricCount = target.dataset.revelationBoardRhetoricCount;
    if (revelationRhetoricCount) {
      const campaignId = context.getCampaign().id;
      const fieldConfig = context.getSpecialFieldConfig(campaignId, revelationRhetoricCount) || { id: revelationRhetoricCount };
      context.mutate((state) => controlActions.updateRevelationBoardRhetoricCount(state, campaignId, revelationRhetoricCount, Number(target.dataset.index), target.value, fieldConfig, context.normalizeRevelationBoardValue));
    }
    const coinEntryCount = target.dataset.coinEntryCount;
    if (coinEntryCount) {
      context.mutate((state) => controlActions.updateCoinEntryCount(state, context.getCampaign().id, coinEntryCount, Number(target.dataset.index), target.value));
    }
    const coinEntryStatus = target.dataset.coinEntryStatus;
    if (coinEntryStatus) {
      context.mutate((state) => controlActions.updateCoinEntryStatus(state, context.getCampaign().id, coinEntryStatus, Number(target.dataset.index), target.value));
    }
    const coinEntryFace = target.dataset.coinEntryFace;
    if (coinEntryFace) {
      context.mutate((state) => controlActions.updateCoinEntryFace(state, context.getCampaign().id, coinEntryFace, Number(target.dataset.index), target.value));
    }
  });
}
