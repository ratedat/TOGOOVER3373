using System.Text.Json;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesRunCatalog
{
    public static RhodesRunCatalogSnapshot LoadDefault()
    {
        var dataRoot = ResolveDataRoot();
        var state = LoadState(Path.Combine(dataRoot, "current-state.json"));
        var campaigns = LoadCampaigns(Path.Combine(dataRoot, "campaigns.json"));
        var operators = LoadOperators(Path.Combine(dataRoot, "operators.json"), state);
        var relics = LoadRelics(Path.Combine(dataRoot, "relics.json"), state);
        return new RhodesRunCatalogSnapshot(campaigns, operators, relics, state);
    }

    private static IReadOnlyList<SukiCampaignPreview> LoadCampaigns(string path)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        return document.RootElement.EnumerateArray()
            .Select(item => new SukiCampaignPreview(
                JsonString(item, "id"),
                JsonInt(item, "number"),
                JsonString(item, "title"),
                JsonString(item, "fullTitle")))
            .Where(item => !string.IsNullOrWhiteSpace(item.Id))
            .OrderBy(item => item.Number)
            .ToArray();
    }

    private static IReadOnlyList<SukiChoiceItem> LoadOperators(string path, SukiRunStateSnapshot state)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        if (!root.TryGetProperty("operators", out var operators) || operators.ValueKind != JsonValueKind.Array)
            return [];

        return operators.EnumerateArray()
            .Select((item, index) =>
            {
                var rarity = JsonInt(item, "rarity");
                var operatorClass = JsonString(item, "class");
                var branch = JsonString(item, "branch");
                var name = JsonString(item, "name");
                var id = JsonString(item, "id");
                var choice = new SukiChoiceItem(
                    "operator",
                    id,
                    name,
                    $"★{rarity} {operatorClass} / {branch}",
                    operatorClass,
                    branch,
                    "",
                    operatorClass,
                    rarity,
                    JsonNullableInt(item, "displayOrder") ?? index,
                    JsonBool(item, "hiddenByDefault") || JsonBool(item, "isJapanUnreleased"),
                    string.Join(" / ", ReadStringArray(item, "obtainMethods")),
                    $"{id} {name} {rarity} {operatorClass} {branch} {string.Join(" ", ReadStringArray(item, "obtainMethods"))} {string.Join(" ", ReadStringArray(item, "recruitmentTags"))}");
                choice.IsSelected = state.SelectedOperatorIds.Contains(id);
                choice.IsExcluded = state.ExcludedOperatorIds.Contains(id);
                return choice;
            })
            .Where(item => !string.IsNullOrWhiteSpace(item.Id) && !string.IsNullOrWhiteSpace(item.Name))
            .OrderByDescending(item => item.Rarity)
            .ThenBy(item => item.SortOrder)
            .ThenBy(item => item.Name, StringComparer.Ordinal)
            .ToArray();
    }

    private static IReadOnlyList<SukiChoiceItem> LoadRelics(string path, SukiRunStateSnapshot state)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        if (!root.TryGetProperty("relics", out var relics) || relics.ValueKind != JsonValueKind.Array)
            return [];

        return relics.EnumerateArray()
            .Select((item, index) =>
            {
                var id = JsonString(item, "id");
                var campaignId = JsonString(item, "campaignId");
                var number = JsonNullableInt(item, "number") ?? 0;
                var category = JsonString(item, "category");
                var name = JsonString(item, "name");
                var effect = JsonString(item, "effect");
                var choice = new SukiChoiceItem(
                    "relic",
                    id,
                    name,
                    number > 0 ? $"No.{number:000} {category}" : category,
                    "",
                    "",
                    campaignId,
                    string.IsNullOrWhiteSpace(category) ? "未分類" : category,
                    0,
                    number > 0 ? number : index,
                    false,
                    effect,
                    $"{id} {number} {name} {category} {effect}");
                choice.IsSelected = state.SelectedRelicIds.Contains(id);
                choice.IsExcluded = state.ExcludedRelicIds.Contains(id);
                return choice;
            })
            .Where(item => !string.IsNullOrWhiteSpace(item.Id) && !string.IsNullOrWhiteSpace(item.Name))
            .OrderBy(item => item.CampaignId, StringComparer.Ordinal)
            .ThenBy(item => item.SortOrder)
            .ThenBy(item => item.Name, StringComparer.Ordinal)
            .ToArray();
    }

    private static SukiRunStateSnapshot LoadState(string path)
    {
        if (!File.Exists(path))
        {
            return new SukiRunStateSnapshot(
                "is5_sarkaz",
                new HashSet<string>(StringComparer.Ordinal),
                new HashSet<string>(StringComparer.Ordinal),
                new HashSet<string>(StringComparer.Ordinal),
                new HashSet<string>(StringComparer.Ordinal),
                false,
                false,
                false,
                false,
                false,
                false);
        }

        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        var run = root.TryGetProperty("run", out var runElement) ? runElement : default;
        var preferences = root.TryGetProperty("preferences", out var prefElement) ? prefElement : default;
        return new SukiRunStateSnapshot(
            JsonString(run, "campaignId", "is5_sarkaz"),
            ReadStringSet(root, "operators"),
            ReadStringSet(root, "relics"),
            ReadStringSet(preferences, "operatorExcludedIds"),
            ReadStringSet(preferences, "relicExcludedIds"),
            JsonBool(preferences, "operatorShowSelectedFirst"),
            JsonBool(preferences, "operatorHideExcluded"),
            JsonBool(preferences, "operatorSelectedOnly"),
            JsonBool(preferences, "relicShowSelectedFirst"),
            JsonBool(preferences, "relicHideExcluded"),
            JsonBool(preferences, "relicSelectedOnly"));
    }

    private static string ResolveDataRoot()
    {
        foreach (var root in CandidateRoots())
        {
            var dataRoot = Path.Combine(root, "data");
            if (File.Exists(Path.Combine(dataRoot, "campaigns.json"))
                && File.Exists(Path.Combine(dataRoot, "operators.json"))
                && File.Exists(Path.Combine(dataRoot, "relics.json")))
            {
                return dataRoot;
            }
        }

        throw new DirectoryNotFoundException("RHODES data directory was not found.");
    }

    private static IEnumerable<string> CandidateRoots()
    {
        foreach (var origin in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() }.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var current = new DirectoryInfo(origin);
            for (var i = 0; current is not null && i < 8; i++, current = current.Parent)
            {
                yield return current.FullName;
            }
        }
    }

    private static IReadOnlySet<string> ReadStringSet(JsonElement element, string propertyName)
    {
        return ReadStringArray(element, propertyName).ToHashSet(StringComparer.Ordinal);
    }

    private static IReadOnlyList<string> ReadStringArray(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object
            || !element.TryGetProperty(propertyName, out var property)
            || property.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return property.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString() ?? "")
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .ToArray();
    }

    private static string JsonString(JsonElement element, string propertyName, string fallback = "")
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.String
            ? property.GetString() ?? fallback
            : fallback;
    }

    private static int JsonInt(JsonElement element, string propertyName)
    {
        return JsonNullableInt(element, propertyName) ?? 0;
    }

    private static int? JsonNullableInt(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.Number
            && property.TryGetInt32(out var value)
            ? value
            : null;
    }

    private static bool JsonBool(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind is JsonValueKind.True or JsonValueKind.False
            && property.GetBoolean();
    }
}
