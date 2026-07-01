using System.Text.Json;
using System.Text.Json.Nodes;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesRunStateStore
{
    private static readonly SemaphoreSlim WriteLock = new(1, 1);
    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        WriteIndented = true,
    };

    public static string ResolveDefaultStatePath()
    {
        var dataRoot = RhodesRunCatalog.ResolveDataRoot();
        return RhodesRunCatalog.ResolveStatePath(dataRoot);
    }

    public static async Task SaveChoicesAsync(
        IEnumerable<SukiChoiceItem> operators,
        IEnumerable<SukiChoiceItem> relics,
        SukiChoicePersistenceOptions options,
        string? statePath = null,
        DateTimeOffset? now = null)
    {
        var path = string.IsNullOrWhiteSpace(statePath) ? ResolveDefaultStatePath() : statePath;
        await WriteLock.WaitAsync();
        try
        {
            var state = await LoadStateNodeAsync(path);
            ApplyChoices(state, operators, relics, options, now ?? DateTimeOffset.UtcNow);
            await WriteJsonAtomicAsync(path, state);
        }
        finally
        {
            WriteLock.Release();
        }
    }

    public static async Task SaveRunContextAsync(
        string campaignId,
        string? statePath = null,
        DateTimeOffset? now = null)
    {
        var path = string.IsNullOrWhiteSpace(statePath) ? ResolveDefaultStatePath() : statePath;
        await WriteLock.WaitAsync();
        try
        {
            var state = await LoadStateNodeAsync(path);
            ApplyRunContext(state, campaignId, now ?? DateTimeOffset.UtcNow);
            await WriteJsonAtomicAsync(path, state);
        }
        finally
        {
            WriteLock.Release();
        }
    }

    public static async Task<SukiCandidateApplySummary> SaveCandidatesAsync(
        IEnumerable<MaaCandidatePreview> candidates,
        string? statePath = null,
        DateTimeOffset? now = null)
    {
        var path = string.IsNullOrWhiteSpace(statePath) ? ResolveDefaultStatePath() : statePath;
        await WriteLock.WaitAsync();
        try
        {
            var state = await LoadStateNodeAsync(path);
            var summary = RhodesRecognitionCandidateApplier.Apply(state, candidates, now ?? DateTimeOffset.UtcNow);
            if (summary.AppliedCount > 0)
                await WriteJsonAtomicAsync(path, state);
            return summary;
        }
        finally
        {
            WriteLock.Release();
        }
    }

    public static JsonObject ApplyChoices(
        JsonObject state,
        IEnumerable<SukiChoiceItem> operators,
        IEnumerable<SukiChoiceItem> relics,
        SukiChoicePersistenceOptions options,
        DateTimeOffset now)
    {
        state["version"] ??= 1;
        state["operators"] = ToJsonArray(operators.Where(item => item.IsSelected).Select(item => item.Id));
        state["relics"] = ToJsonArray(relics.Where(item => item.IsSelected).Select(item => item.Id));
        state["updatedAt"] = now.UtcDateTime.ToString("O");

        var preferences = EnsureObject(state, "preferences");
        preferences["operatorExcludedIds"] = ToJsonArray(operators.Where(item => item.IsExcluded).Select(item => item.Id));
        preferences["relicExcludedIds"] = ToJsonArray(relics.Where(item => item.IsExcluded).Select(item => item.Id));
        preferences["operatorShowSelectedFirst"] = options.OperatorShowSelectedFirst;
        preferences["operatorHideExcluded"] = options.OperatorHideExcluded;
        preferences["operatorSelectedOnly"] = options.OperatorSelectedOnly;
        preferences["relicShowSelectedFirst"] = options.RelicShowSelectedFirst;
        preferences["relicHideExcluded"] = options.RelicHideExcluded;
        preferences["relicSelectedOnly"] = options.RelicSelectedOnly;
        preferences["operatorGridColumns"] = Math.Clamp(options.OperatorGridColumns, 1, 4);
        preferences["relicGridColumns"] = Math.Clamp(options.RelicGridColumns, 1, 4);

        return state;
    }

    public static JsonObject ApplyRunContext(JsonObject state, string campaignId, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(campaignId))
            throw new ArgumentException("campaignId is required.", nameof(campaignId));

        state["version"] ??= 1;
        state["updatedAt"] = now.UtcDateTime.ToString("O");

        var run = EnsureObject(state, "run");
        var previousCampaignId = JsonString(run, "campaignId");
        var normalizedCampaignId = campaignId.Trim();
        run["campaignId"] = normalizedCampaignId;
        if (!string.Equals(previousCampaignId, normalizedCampaignId, StringComparison.Ordinal))
            ResetRunValues(run);

        return state;
    }

    private static async Task<JsonObject> LoadStateNodeAsync(string path)
    {
        if (!File.Exists(path))
            return new JsonObject { ["version"] = 1 };

        await using var stream = File.OpenRead(path);
        var node = await JsonNode.ParseAsync(stream);
        return node as JsonObject ?? new JsonObject { ["version"] = 1 };
    }

    private static async Task WriteJsonAtomicAsync(string path, JsonObject state)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory))
            Directory.CreateDirectory(directory);

        var tempPath = $"{path}.{Environment.ProcessId}.tmp";
        await File.WriteAllTextAsync(tempPath, $"{state.ToJsonString(WriteOptions)}{Environment.NewLine}");
        File.Move(tempPath, path, true);
    }

    private static JsonObject EnsureObject(JsonObject parent, string propertyName)
    {
        if (parent[propertyName] is JsonObject existing)
            return existing;

        var created = new JsonObject();
        parent[propertyName] = created;
        return created;
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

    private static string JsonString(JsonObject parent, string propertyName)
    {
        if (parent.TryGetPropertyValue(propertyName, out var node) && node is JsonValue value
            && value.TryGetValue<string>(out var text))
        {
            return text;
        }

        return "";
    }

    private static JsonArray ToJsonArray(IEnumerable<string> values)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var array = new JsonArray();
        foreach (var value in values)
        {
            if (string.IsNullOrWhiteSpace(value) || !seen.Add(value))
                continue;

            array.Add(value);
        }

        return array;
    }
}

public sealed record SukiChoicePersistenceOptions(
    bool OperatorShowSelectedFirst,
    bool OperatorHideExcluded,
    bool OperatorSelectedOnly,
    bool RelicShowSelectedFirst,
    bool RelicHideExcluded,
    bool RelicSelectedOnly,
    int OperatorGridColumns,
    int RelicGridColumns);
