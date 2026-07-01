using System.Globalization;
using System.Text.Json.Nodes;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesRecognitionCandidateApplier
{
    private const string Is4CampaignId = "is4_sami";
    private const string Is5CampaignId = "is5_sarkaz";
    private const string Is6CampaignId = "is6_sui";
    private static readonly HashSet<string> KnownCampaignIds =
    [
        "is2_phantom",
        "is3_mizuki",
        Is4CampaignId,
        Is5CampaignId,
        Is6CampaignId,
    ];

    public static SukiCandidateApplySummary ApplyRunStatus(
        JsonObject state,
        IEnumerable<MaaCandidatePreview> candidates,
        DateTimeOffset now)
    {
        return Apply(state, candidates, now, runStatusOnly: true);
    }

    public static SukiCandidateApplySummary Apply(
        JsonObject state,
        IEnumerable<MaaCandidatePreview> candidates,
        DateTimeOffset now)
    {
        return Apply(state, candidates, now, runStatusOnly: false);
    }

    private static SukiCandidateApplySummary Apply(
        JsonObject state,
        IEnumerable<MaaCandidatePreview> candidates,
        DateTimeOffset now,
        bool runStatusOnly)
    {
        var candidateList = NormalizeCandidatesForApply(candidates);
        var applied = new List<string>();
        var handledIndexes = ApplyCampaignCandidates(state, candidateList, applied);
        if (!runStatusOnly)
            handledIndexes.UnionWith(ApplyIs5SpecialCandidates(state, candidateList, applied));
        var ignored = 0;
        for (var index = 0; index < candidateList.Count; index++)
        {
            if (handledIndexes.Contains(index))
                continue;

            var candidate = candidateList[index];
            if (!ApplyCandidate(state, candidate, applied, runStatusOnly))
            {
                ignored++;
            }
        }

        if (applied.Count > 0)
            state["updatedAt"] = now.UtcDateTime.ToString("O");

        return new SukiCandidateApplySummary(applied.Count, ignored, applied);
    }

    private static List<MaaCandidatePreview> NormalizeCandidatesForApply(IEnumerable<MaaCandidatePreview> candidates)
    {
        var normalized = new List<MaaCandidatePreview>();
        var bestRunStatusByField = new Dictionary<string, int>(StringComparer.Ordinal);

        foreach (var candidate in candidates)
        {
            if (!CandidateIsKind(candidate, "runStatus"))
            {
                normalized.Add(candidate);
                continue;
            }

            var field = CandidateId(candidate.Field, candidate.Value);
            if (string.IsNullOrWhiteSpace(field))
            {
                normalized.Add(candidate);
                continue;
            }

            if (!bestRunStatusByField.TryGetValue(field, out var existingIndex))
            {
                bestRunStatusByField[field] = normalized.Count;
                normalized.Add(candidate);
                continue;
            }

            var existing = normalized[existingIndex];
            if ((candidate.Confidence ?? 0) > (existing.Confidence ?? 0))
                normalized[existingIndex] = candidate;
        }

        return normalized;
    }

    private static HashSet<int> ApplyCampaignCandidates(
        JsonObject state,
        IReadOnlyList<MaaCandidatePreview> candidates,
        ICollection<string> applied)
    {
        var handled = new HashSet<int>();
        for (var index = 0; index < candidates.Count; index++)
        {
            var candidate = candidates[index];
            if (!CandidateIsKind(candidate, "runStatus") || !candidate.Field.Equals("campaignId", StringComparison.Ordinal))
                continue;

            if (ApplyCampaignContextCandidate(state, candidate, applied))
                handled.Add(index);
        }
        return handled;
    }

    private static bool ApplyCandidate(
        JsonObject state,
        MaaCandidatePreview candidate,
        ICollection<string> applied,
        bool runStatusOnly)
    {
        if (CandidateIsKind(candidate, "runStatus"))
            return ApplyRunStatusCandidate(state, candidate, applied);

        if (runStatusOnly)
            return false;

        if (CandidateIsKind(candidate, "operator"))
            return ApplyStringSetCandidate(state, "operators", candidate.OperatorId, candidate.Value, applied, "operator");

        if (CandidateIsKind(candidate, "relic"))
            return ApplyRelicCandidate(state, candidate, applied);

        if (CandidateIsKind(candidate, "revelation"))
            return ApplyRevelationCandidate(state, candidate, applied);

        if (CandidateIsKind(candidate, "coin"))
            return ApplyCoinCandidate(state, candidate, applied);

        return false;
    }

    private static HashSet<int> ApplyIs5SpecialCandidates(
        JsonObject state,
        IReadOnlyList<MaaCandidatePreview> candidates,
        ICollection<string> applied)
    {
        var handled = new HashSet<int>();
        handled.UnionWith(ApplyThoughtCandidates(state, candidates, applied));
        handled.UnionWith(ApplyAgeCandidates(state, candidates, applied));
        return handled;
    }

    private static bool ApplyRunStatusCandidate(JsonObject state, MaaCandidatePreview candidate, ICollection<string> applied)
    {
        var run = EnsureObject(state, "run");
        var field = candidate.Field.Trim();
        switch (field)
        {
            case "hope":
                return ApplyInt(run, field, candidate.Value, 0, 999, applied);
            case "maxHope":
                return ApplyInt(run, field, candidate.Value, 0, 999, applied);
            case "ingot":
                return ApplyInt(run, field, candidate.Value, 0, 9999, applied);
            case "lifePoints":
                return ApplyInt(run, field, candidate.Value, 0, 999, applied);
            case "shield":
                return ApplyInt(run, field, candidate.Value, 0, 999, applied);
            case "commandLevel":
                return ApplyInt(run, field, candidate.Value, 1, 99, applied);
            case "difficulty":
                return ApplyInt(run, field, candidate.Value, 1, 99, applied);
            case "squadId":
                return ApplyString(run, field, candidate.Value, applied, clearSquad: true);
            case "squadRandomEffectOptionId":
                return ApplyString(run, field, candidate.Value, applied);
            case "campaignId":
                return ApplyCampaignContextCandidate(state, candidate, applied);
            case "idea":
                return ApplyIdea(run, candidate, applied);
            default:
                return false;
        }
    }

    private static bool ApplyInt(JsonObject run, string field, string value, int min, int max, ICollection<string> applied)
    {
        if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number))
            return false;

        run[field] = Math.Clamp(number, min, max);
        applied.Add(field);
        return true;
    }

    private static bool ApplyString(JsonObject run, string field, string value, ICollection<string> applied, bool clearSquad = false)
    {
        var text = value.Trim();
        if (string.IsNullOrWhiteSpace(text))
            return false;

        run[field] = text;
        if (clearSquad)
        {
            run["squad"] = null;
            run["squadRandomEffectOptionId"] = null;
        }
        applied.Add(field);
        return true;
    }

    private static bool ApplyCampaignContextCandidate(JsonObject state, MaaCandidatePreview candidate, ICollection<string> applied)
    {
        var campaignId = CandidateId(candidate.Value, candidate.CampaignId);
        if (string.IsNullOrWhiteSpace(campaignId) || !KnownCampaignIds.Contains(campaignId))
            return false;

        var run = EnsureObject(state, "run");
        var previousCampaignId = JsonString(run, "campaignId");
        run["campaignId"] = campaignId;
        if (!string.Equals(previousCampaignId, campaignId, StringComparison.Ordinal))
            ResetRunValues(run);

        applied.Add("campaignId");
        return true;
    }

    private static bool ApplyIdea(JsonObject run, MaaCandidatePreview candidate, ICollection<string> applied)
    {
        if (!int.TryParse(candidate.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) || value < 0)
            return false;

        var campaign = EnsureIs5SpecialFromRun(run, candidate);
        if (campaign is null)
            return false;

        campaign["idea"] = Math.Min(999, value);
        applied.Add("idea");
        return true;
    }

    private static IReadOnlyCollection<int> ApplyThoughtCandidates(
        JsonObject state,
        IReadOnlyList<MaaCandidatePreview> candidates,
        ICollection<string> applied)
    {
        var valid = new List<(int Index, string ThoughtId)>();
        for (var index = 0; index < candidates.Count; index++)
        {
            var candidate = candidates[index];
            if (!candidate.Kind.Equals("thought", StringComparison.OrdinalIgnoreCase))
                continue;

            var thoughtId = CandidateId(candidate.ThoughtId, candidate.Value);
            if (string.IsNullOrWhiteSpace(thoughtId) || !CandidateCampaignIsIs5(candidate))
                continue;

            valid.Add((index, thoughtId));
        }

        if (valid.Count == 0)
            return [];

        var run = EnsureObject(state, "run");
        var campaign = EnsureIs5SpecialFromRun(run, valid.Select(item => candidates[item.Index]));
        if (campaign is null)
            return [];

        var ids = new List<string>();
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var item in valid)
        {
            if (!counts.ContainsKey(item.ThoughtId))
                ids.Add(item.ThoughtId);
            counts[item.ThoughtId] = counts.GetValueOrDefault(item.ThoughtId) + 1;
        }

        var thought = new JsonArray();
        foreach (var thoughtId in ids)
        {
            thought.Add(new JsonObject
            {
                ["effectId"] = thoughtId,
                ["count"] = counts[thoughtId],
                ["stateId"] = null,
            });
        }
        campaign["thought"] = thought;

        var handled = new HashSet<int>();
        foreach (var item in valid)
        {
            handled.Add(item.Index);
            applied.Add($"thought:{item.ThoughtId}");
        }
        return handled;
    }

    private static IReadOnlyCollection<int> ApplyAgeCandidates(
        JsonObject state,
        IReadOnlyList<MaaCandidatePreview> candidates,
        ICollection<string> applied)
    {
        var valid = new List<(int Index, MaaCandidatePreview Candidate, string AgeId)>();
        for (var index = 0; index < candidates.Count; index++)
        {
            var candidate = candidates[index];
            if (!candidate.Kind.Equals("age", StringComparison.OrdinalIgnoreCase))
                continue;

            var ageId = CandidateId(candidate.AgeId, candidate.Value);
            if (string.IsNullOrWhiteSpace(ageId) || !CandidateCampaignIsIs5(candidate))
                continue;

            valid.Add((index, candidate, ageId));
        }

        if (valid.Count == 0)
            return [];

        var run = EnsureObject(state, "run");
        var campaign = EnsureIs5SpecialFromRun(run, valid.Select(item => item.Candidate));
        if (campaign is null)
            return [];

        var best = valid
            .OrderByDescending(item => item.Candidate.Confidence ?? 0)
            .ThenBy(item => item.Index)
            .First();
        campaign["age"] = best.AgeId;

        var handled = new HashSet<int>();
        foreach (var item in valid)
        {
            handled.Add(item.Index);
            applied.Add($"age:{item.AgeId}");
        }
        return handled;
    }

    private static bool ApplyRelicCandidate(JsonObject state, MaaCandidatePreview candidate, ICollection<string> applied)
    {
        var run = EnsureObject(state, "run");
        var currentCampaignId = JsonString(run, "campaignId");
        if (!string.IsNullOrWhiteSpace(candidate.CampaignId)
            && !string.IsNullOrWhiteSpace(currentCampaignId)
            && !candidate.CampaignId.Equals(currentCampaignId, StringComparison.Ordinal))
        {
            return false;
        }

        return ApplyStringSetCandidate(state, "relics", candidate.RelicId, candidate.Value, applied, "relic");
    }

    private static bool ApplyRevelationCandidate(JsonObject state, MaaCandidatePreview candidate, ICollection<string> applied)
    {
        if (!CandidateCampaignIs(candidate, Is4CampaignId))
            return false;

        var effectId = CandidateId(candidate.EffectId, candidate.Value);
        if (string.IsNullOrWhiteSpace(effectId))
            return false;

        var fieldId = NormalizeRevelationFieldId(candidate.FieldId);
        var slotKind = candidate.SlotKind.Trim().ToLowerInvariant();
        if (slotKind is not ("cause" or "causeid" or "structure" or "structureid" or "rhetoric" or "rhetoricid"))
            return false;

        var run = EnsureObject(state, "run");
        var campaign = EnsureCampaignSpecialFromRun(run, Is4CampaignId);
        if (campaign is null)
            return false;

        var board = EnsureObject(campaign, fieldId);
        if (slotKind is "cause" or "causeid")
        {
            board["causeId"] = effectId;
            applied.Add($"revelation:cause:{effectId}");
            return true;
        }

        if (slotKind is "structure" or "structureid")
        {
            board["structureId"] = effectId;
            applied.Add($"revelation:structure:{effectId}");
            return true;
        }

        board["rhetorics"] = MergeCountedEntries(
            board["rhetorics"] as JsonArray,
            effectId,
            Math.Clamp(candidate.Count <= 0 ? 1 : candidate.Count, 1, 99));
        applied.Add($"revelation:rhetoric:{effectId}");
        return true;
    }

    private static bool ApplyCoinCandidate(JsonObject state, MaaCandidatePreview candidate, ICollection<string> applied)
    {
        if (!CandidateCampaignIs(candidate, Is6CampaignId))
            return false;

        var coinId = CandidateId(candidate.CoinId, candidate.Value);
        if (string.IsNullOrWhiteSpace(coinId))
            return false;

        var run = EnsureObject(state, "run");
        var campaign = EnsureCampaignSpecialFromRun(run, Is6CampaignId);
        if (campaign is null)
            return false;

        var fieldId = string.IsNullOrWhiteSpace(candidate.FieldId) ? "coins" : candidate.FieldId.Trim();
        var entries = MergeCoinEntries(
            campaign[fieldId] as JsonArray,
            coinId,
            string.IsNullOrWhiteSpace(candidate.StatusId) ? null : candidate.StatusId.Trim(),
            candidate.Face.Equals("back", StringComparison.OrdinalIgnoreCase) ? "back" : "front",
            Math.Clamp(candidate.Count <= 0 ? 1 : candidate.Count, 1, 99));
        campaign[fieldId] = entries;
        applied.Add($"coin:{coinId}");
        return true;
    }

    private static bool ApplyStringSetCandidate(
        JsonObject state,
        string propertyName,
        string primaryValue,
        string fallbackValue,
        ICollection<string> applied,
        string appliedPrefix)
    {
        var value = string.IsNullOrWhiteSpace(primaryValue) ? fallbackValue.Trim() : primaryValue.Trim();
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var values = new HashSet<string>(StringComparer.Ordinal);
        var array = new JsonArray();
        if (state[propertyName] is JsonArray existing)
        {
            foreach (var item in existing)
            {
                var text = item?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(text) || !values.Add(text))
                    continue;
                array.Add(text);
            }
        }

        if (!values.Add(value))
            return false;

        array.Add(value);
        state[propertyName] = array;
        applied.Add($"{appliedPrefix}:{value}");
        return true;
    }

    private static JsonObject EnsureObject(JsonObject parent, string propertyName)
    {
        if (parent[propertyName] is JsonObject existing)
            return existing;

        var created = new JsonObject();
        parent[propertyName] = created;
        return created;
    }

    private static JsonObject? EnsureIs5SpecialFromRun(JsonObject run, MaaCandidatePreview candidate)
    {
        return EnsureIs5SpecialFromRun(run, [candidate]);
    }

    private static JsonObject? EnsureIs5SpecialFromRun(JsonObject run, IEnumerable<MaaCandidatePreview> candidates)
    {
        if (candidates.Any(candidate => !CandidateCampaignIsIs5(candidate)))
            return null;

        return EnsureCampaignSpecialFromRun(run, Is5CampaignId);
    }

    private static JsonObject? EnsureCampaignSpecialFromRun(JsonObject run, string campaignId)
    {
        var currentCampaignId = JsonString(run, "campaignId");
        if (!string.IsNullOrWhiteSpace(currentCampaignId)
            && !currentCampaignId.Equals(campaignId, StringComparison.Ordinal))
        {
            return null;
        }

        run["campaignId"] ??= campaignId;
        var special = EnsureObject(run, "special");
        return EnsureObject(special, campaignId);
    }

    private static bool CandidateCampaignIsIs5(MaaCandidatePreview candidate)
    {
        return CandidateCampaignIs(candidate, Is5CampaignId);
    }

    private static bool CandidateCampaignIs(MaaCandidatePreview candidate, string campaignId)
    {
        return string.IsNullOrWhiteSpace(candidate.CampaignId)
            || candidate.CampaignId.Equals(campaignId, StringComparison.Ordinal);
    }

    private static bool CandidateIsKind(MaaCandidatePreview candidate, string kind)
    {
        return candidate.Kind.Equals(kind, StringComparison.OrdinalIgnoreCase);
    }

    private static string CandidateId(string primaryValue, string fallbackValue)
    {
        var value = string.IsNullOrWhiteSpace(primaryValue) ? fallbackValue : primaryValue;
        return value.Trim();
    }

    private static string NormalizeRevelationFieldId(string fieldId)
    {
        var value = fieldId.Trim();
        return string.IsNullOrWhiteSpace(value) || value.Equals("revelationBoard", StringComparison.Ordinal)
            ? "revelation"
            : value;
    }

    private static JsonArray MergeCountedEntries(JsonArray? existing, string effectId, int count)
    {
        var entries = new Dictionary<string, int>(StringComparer.Ordinal);
        if (existing is not null)
        {
            foreach (var item in existing)
            {
                if (item is not JsonObject entry)
                    continue;

                var id = JsonString(entry, "effectId");
                if (string.IsNullOrWhiteSpace(id))
                    continue;

                var existingCount = JsonInt(entry, "count");
                entries[id] = Math.Clamp(entries.GetValueOrDefault(id) + Math.Max(1, existingCount), 1, 99);
            }
        }

        entries[effectId] = Math.Clamp(entries.GetValueOrDefault(effectId) + count, 1, 99);
        var result = new JsonArray();
        foreach (var entry in entries)
        {
            result.Add(new JsonObject
            {
                ["effectId"] = entry.Key,
                ["count"] = entry.Value,
            });
        }
        return result;
    }

    private static JsonArray MergeCoinEntries(JsonArray? existing, string coinId, string? statusId, string face, int count)
    {
        var entries = new Dictionary<string, (string CoinId, string? StatusId, string Face, int Count)>(StringComparer.Ordinal);
        if (existing is not null)
        {
            foreach (var item in existing)
            {
                if (item is not JsonObject entry)
                    continue;

                var id = JsonString(entry, "coinId");
                if (string.IsNullOrWhiteSpace(id))
                    continue;

                var existingStatusId = JsonString(entry, "statusId");
                var existingFace = JsonString(entry, "face").Equals("back", StringComparison.OrdinalIgnoreCase) ? "back" : "front";
                var key = CoinEntryKey(id, existingStatusId, existingFace);
                var existingCount = Math.Max(1, JsonInt(entry, "count"));
                entries[key] = entries.TryGetValue(key, out var current)
                    ? current with { Count = Math.Clamp(current.Count + existingCount, 1, 99) }
                    : (id, string.IsNullOrWhiteSpace(existingStatusId) ? null : existingStatusId, existingFace, Math.Clamp(existingCount, 1, 99));
            }
        }

        var targetKey = CoinEntryKey(coinId, statusId, face);
        entries[targetKey] = entries.TryGetValue(targetKey, out var target)
            ? target with { Count = Math.Clamp(target.Count + count, 1, 99) }
            : (coinId, statusId, face, count);

        var result = new JsonArray();
        foreach (var entry in entries.Values)
        {
            result.Add(new JsonObject
            {
                ["coinId"] = entry.CoinId,
                ["count"] = entry.Count,
                ["statusId"] = entry.StatusId,
                ["face"] = entry.Face,
            });
        }
        return result;
    }

    private static string CoinEntryKey(string coinId, string? statusId, string face)
    {
        return $"{coinId}\u001f{statusId ?? ""}\u001f{face}";
    }

    private static void ResetRunValues(JsonObject run)
    {
        foreach (var propertyName in new[]
        {
            "squad",
            "difficulty",
            "hope",
            "maxHope",
            "ingot",
            "lifePoints",
            "shield",
            "idea",
            "special",
        })
        {
            run.Remove(propertyName);
        }

        run["commandLevel"] = 1;
    }

    private static int JsonInt(JsonObject parent, string propertyName)
    {
        if (parent.TryGetPropertyValue(propertyName, out var node) && node is JsonValue value
            && value.TryGetValue<int>(out var number))
        {
            return number;
        }

        return 0;
    }

    private static string JsonString(JsonObject parent, string propertyName)
    {
        if (parent.TryGetPropertyValue(propertyName, out var node) && node is JsonValue value
            && value.TryGetValue<string>(out var text))
        {
            return text;
        }

        return "";
    }
}
