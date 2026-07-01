using System.Globalization;
using System.Text.Json.Nodes;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesRecognitionCandidateApplier
{
    private const string Is5CampaignId = "is5_sarkaz";

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
        var applied = new List<string>();
        var ignored = 0;
        foreach (var candidate in candidates)
        {
            if (!ApplyCandidate(state, candidate, applied, runStatusOnly))
            {
                ignored++;
            }
        }

        if (applied.Count > 0)
            state["updatedAt"] = now.UtcDateTime.ToString("O");

        return new SukiCandidateApplySummary(applied.Count, ignored, applied);
    }

    private static bool ApplyCandidate(
        JsonObject state,
        MaaCandidatePreview candidate,
        ICollection<string> applied,
        bool runStatusOnly)
    {
        if (candidate.Kind.Equals("runStatus", StringComparison.OrdinalIgnoreCase))
            return ApplyRunStatusCandidate(state, candidate, applied);

        if (runStatusOnly)
            return false;

        if (candidate.Kind.Equals("operator", StringComparison.OrdinalIgnoreCase))
            return ApplyStringSetCandidate(state, "operators", candidate.OperatorId, candidate.Value, applied, "operator");

        if (candidate.Kind.Equals("relic", StringComparison.OrdinalIgnoreCase))
            return ApplyRelicCandidate(state, candidate, applied);

        return false;
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

    private static bool ApplyIdea(JsonObject run, MaaCandidatePreview candidate, ICollection<string> applied)
    {
        if (!int.TryParse(candidate.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) || value < 0)
            return false;

        var campaignId = string.IsNullOrWhiteSpace(candidate.CampaignId) ? JsonString(run, "campaignId") : candidate.CampaignId;
        if (string.IsNullOrWhiteSpace(campaignId))
            campaignId = Is5CampaignId;
        if (!campaignId.Equals(Is5CampaignId, StringComparison.Ordinal))
            return false;

        run["campaignId"] ??= Is5CampaignId;
        var special = EnsureObject(run, "special");
        var campaign = EnsureObject(special, Is5CampaignId);
        campaign["idea"] = Math.Min(999, value);
        applied.Add("idea");
        return true;
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
