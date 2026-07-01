using System.Text.Json;
using System.Text.Json.Nodes;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesRunStateStore
{
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
        var state = await LoadStateNodeAsync(path);
        ApplyChoices(state, operators, relics, options, now ?? DateTimeOffset.UtcNow);
        await WriteJsonAtomicAsync(path, state);
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
