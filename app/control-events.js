import * as controlActions from "./control-actions.js";
import { clampCoinCount, normalizeCoinFace } from "./domain/special-values.js";
import { apiJson, resetStateUrl } from "./lib/api.js";

function parseImportDraft(ui) {
  if (!ui.importDraft.trim()) throw new Error("JSONが空です");
  const parsed = JSON.parse(ui.importDraft);
  if (!parsed || typeof parsed !== "object") throw new Error("状態JSONではありません");
  return parsed;
}

function setChoicePressed(element, active) {
  if (!element) return;
  element.classList.toggle("active", active);
  element.setAttribute("aria-pressed", active ? "true" : "false");
}

function refreshChoiceCountLabels(ui, state) {
  const subtitle = document.querySelector(".panel-header .panel-subtitle");
  if (!subtitle) return;
  if (ui.tab === "relics") {
    subtitle.textContent = subtitle.textContent.replace(/所持\d+件/, `所持${state.relics.length}件`);
  } else if (ui.tab === "operators") {
    subtitle.textContent = subtitle.textContent.replace(/招集\d+名/, `招集${state.operators.length}名`);
  }
}

function toggleChoiceElement(element, type, id, context) {
  context.mutate((state) => controlActions.toggleChoice(state, type, id), { render: false });
  const state = context.getState();
  const active = type === "relic" ? state.relics.includes(id) : state.operators.includes(id);
  setChoicePressed(element, active);
  refreshChoiceCountLabels(context.ui, state);
}

function isControlView(context) {
  return context.view === "control";
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
    if (action === "tab") { context.ui.tab = button.dataset.tab; context.renderControl(); return; }
    if (action === "toggle-relic") { toggleChoiceElement(button, "relic", id, context); return; }
    if (action === "toggle-operator") { toggleChoiceElement(button, "operator", id, context); return; }
    if (action === "clear-relics") context.mutate(controlActions.clearRelics);
    if (action === "reset-state") {
      if (confirm("状態を初期化しますか？")) {
        context.replaceState(await apiJson(resetStateUrl, { method: "POST" }));
        context.renderControl();
        context.setNotice("状態を初期化しました。");
      }
    }
    if (action === "add-boss-flag") {
      const text = context.ui.bossDraft.trim();
      if (text) context.mutate((state) => { controlActions.addBossFlag(state, text); context.ui.bossDraft = ""; });
    }
    if (action === "remove-boss-flag") context.mutate((state) => controlActions.removeBossFlag(state, Number(button.dataset.index)));
    if (action === "dismiss-suggestion") context.mutate((state) => controlActions.dismissSuggestion(state, Number(button.dataset.index)));
    if (action === "copy-state-json") {
      await navigator.clipboard.writeText(JSON.stringify(context.getState(), null, 2));
      context.setNotice("状態JSONをコピーしました。");
    }
    if (action === "import-state-now") {
      try {
        context.replaceState(parseImportDraft(context.ui));
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
        context.replaceState(pending);
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
    if (target.matches("[data-ui]")) {
      context.ui[target.dataset.ui] = target.value;
      context.renderControl();
      return;
    }
    const field = target.dataset.field;
    if (field) {
      context.mutate((state) => controlActions.updateRunField(state, field, target.value, target.checked));
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
