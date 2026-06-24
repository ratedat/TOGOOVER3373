function decodeBasicHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&br;/g, "\n")
    .replace(/&ensp;|&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function splitWikiTableLine(line) {
  let value = String(line || "").trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  return value.split("|");
}

function plainText(value) {
  let text = decodeBasicHtmlEntities(value);
  text = text.replace(/BGCOLOR\([^)]+\):/g, "");
  text = text.replace(/&color\([^)]*\)\{([^{}]*)\};/g, "$1");
  text = text.replace(/\[\[([^>\]]+)>([^\]]+)\]\]/g, "$1");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(/\(\([^)]*\)\)/g, "");
  text = text.replace(/[ \t]+/g, " ");
  return text.trim();
}

function wikiLinkParts(value) {
  const text = decodeBasicHtmlEntities(value);
  const match = text.match(/\[\[(?<inner>[^\]]+)\]\]/);
  if (!match?.groups?.inner) {
    const fallback = plainText(text);
    return { name: fallback, wikiPage: fallback };
  }
  const inner = match.groups.inner;
  const [label, target] = inner.includes(">") ? inner.split(">", 2) : [inner, inner];
  return {
    name: plainText(label),
    wikiPage: plainText(target),
  };
}

function normalizeDate(value) {
  const match = String(value || "").match(/(?<year>\d{4})[/-](?<month>\d{1,2})[/-](?<day>\d{1,2})/);
  if (!match?.groups) return null;
  return [
    match.groups.year,
    match.groups.month.padStart(2, "0"),
    match.groups.day.padStart(2, "0"),
  ].join("-");
}

function normalizeKey(value) {
  return plainText(value).replace(/\s+/g, "").toLowerCase();
}

export function extractImplementationHistory(source) {
  const rows = [];
  for (const line of String(source || "").split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = splitWikiTableLine(line);
    if (cells.length < 9) continue;
    const rarity = Number(plainText(cells[0]));
    const implementationDate = normalizeDate(cells[4]);
    if (!Number.isInteger(rarity) || !implementationDate) continue;
    const link = wikiLinkParts(cells[3]);
    if (!link.name) continue;
    rows.push({
      implementationOrder: rows.length,
      rarity,
      class: plainText(cells[1]),
      branch: plainText(cells[2]),
      name: link.name,
      wikiPage: link.wikiPage || link.name,
      implementationDate,
      recruitmentPool: plainText(cells[5]),
      publicRecruitment: plainText(cells[6]),
      otherObtainMethod: plainText(cells[7]),
      cnImplementationDate: normalizeDate(cells[8]),
    });
  }
  return rows;
}

export function mergeImplementationHistory(operators = [], history = []) {
  const byWikiPage = new Map();
  const byName = new Map();
  for (const row of history || []) {
    byWikiPage.set(normalizeKey(row.wikiPage || row.name), row);
    byName.set(normalizeKey(row.name), row);
  }

  const matchedHistoryKeys = new Set();
  const enrichedOperators = (operators || []).map((operator) => {
    const row = byWikiPage.get(normalizeKey(operator.wikiPage || operator.name))
      || byName.get(normalizeKey(operator.name));
    if (!row) return operator;
    matchedHistoryKeys.add(normalizeKey(row.wikiPage || row.name));
    return {
      ...operator,
      implementationOrder: row.implementationOrder,
      implementationDate: row.implementationDate,
      cnImplementationDate: row.cnImplementationDate,
      implementationSource: "オペレーター実装履歴",
    };
  });

  const unmatchedHistoryRows = (history || []).filter((row) => !matchedHistoryKeys.has(normalizeKey(row.wikiPage || row.name)));
  const operatorsWithoutImplementationDate = enrichedOperators.filter((item) => !item.implementationDate).length;
  return {
    operators: enrichedOperators,
    unmatchedHistoryRows,
    summary: {
      historyRows: history.length,
      matchedOperators: enrichedOperators.length - operatorsWithoutImplementationDate,
      unmatchedHistoryRows: unmatchedHistoryRows.length,
      operatorsWithoutImplementationDate,
    },
  };
}
