using System.Text.Json;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesRunCatalog
{
    public static RhodesRunCatalogSnapshot LoadDefault()
    {
        var dataRoot = ResolveDataRoot();
        var campaigns = LoadCampaigns(Path.Combine(dataRoot, "campaigns.json"));
        var selectableEffects = LoadSelectableEffects(ResolveDataPath(dataRoot, "selectable-effects.json"));
        var state = LoadState(ResolveStatePath(dataRoot), campaigns, selectableEffects);
        var operators = LoadOperators(Path.Combine(dataRoot, "operators.json"), dataRoot, state);
        var relics = LoadRelics(Path.Combine(dataRoot, "relics.json"), dataRoot, state);
        return new RhodesRunCatalogSnapshot(campaigns, operators, relics, state);
    }

    private sealed record SelectableEffectPreview(
        string Id,
        string CampaignId,
        string Slot,
        string SlotLabel,
        string GroupLabel,
        string Name);

    private static IReadOnlyList<SukiCampaignPreview> LoadCampaigns(string path)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        return document.RootElement.EnumerateArray()
            .Select(item => new SukiCampaignPreview(
                JsonString(item, "id"),
                JsonInt(item, "number"),
                JsonString(item, "title"),
                JsonString(item, "fullTitle"),
                ReadSpecialFields(item)))
            .Where(item => !string.IsNullOrWhiteSpace(item.Id))
            .OrderBy(item => item.Number)
            .ToArray();
    }

    private static IReadOnlyList<SukiCampaignSpecialField> ReadSpecialFields(JsonElement campaign)
    {
        if (!campaign.TryGetProperty("specialFields", out var fields) || fields.ValueKind != JsonValueKind.Array)
            return [];

        return fields.EnumerateArray()
            .Select(field => new SukiCampaignSpecialField(
                JsonString(field, "id"),
                JsonString(field, "label"),
                JsonString(field, "type"),
                JsonString(field, "effectSlot"),
                JsonString(field, "unitLabel")))
            .Where(field => !string.IsNullOrWhiteSpace(field.Id) && !string.IsNullOrWhiteSpace(field.Label))
            .ToArray();
    }

    private static IReadOnlyList<SelectableEffectPreview> LoadSelectableEffects(string path)
    {
        if (!File.Exists(path))
            return [];

        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        if (!root.TryGetProperty("selectableEffects", out var effects) || effects.ValueKind != JsonValueKind.Array)
            return [];

        return effects.EnumerateArray()
            .Select(item => new SelectableEffectPreview(
                JsonString(item, "id"),
                JsonString(item, "campaignId"),
                JsonString(item, "slot"),
                JsonString(item, "slotLabel"),
                JsonString(item, "groupLabel"),
                JsonString(item, "name")))
            .Where(item => !string.IsNullOrWhiteSpace(item.Id))
            .ToArray();
    }

    private static IReadOnlyList<SukiChoiceItem> LoadOperators(string path, string dataRoot, SukiRunStateSnapshot state)
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
                    "",
                    $"{id} {name} {rarity} {operatorClass} {branch}",
                    ResolveLocalPath(dataRoot, JsonString(JsonObject(item, "image"), "localPath")));
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

    private static IReadOnlyList<SukiChoiceItem> LoadRelics(string path, string dataRoot, SukiRunStateSnapshot state)
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
                    $"{id} {number} {name} {category} {effect}",
                    ResolveLocalPath(dataRoot, JsonString(JsonObject(item, "image"), "localPath")));
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

    private static SukiRunStateSnapshot LoadState(
        string path,
        IReadOnlyList<SukiCampaignPreview> campaigns,
        IReadOnlyList<SelectableEffectPreview> selectableEffects)
    {
        if (!File.Exists(path))
        {
            var fallbackCampaignId = campaigns.FirstOrDefault(campaign => campaign.Id == "is5_sarkaz")?.Id
                ?? campaigns.FirstOrDefault()?.Id
                ?? "is5_sarkaz";
            return new SukiRunStateSnapshot(
                fallbackCampaignId,
                new HashSet<string>(StringComparer.Ordinal),
                new HashSet<string>(StringComparer.Ordinal),
                new HashSet<string>(StringComparer.Ordinal),
                new HashSet<string>(StringComparer.Ordinal),
                false,
                false,
                false,
                false,
                false,
                false,
                SpecialFields: BuildSpecialFieldStates(default, campaigns, selectableEffects));
        }

        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        var run = root.TryGetProperty("run", out var runElement) ? runElement : default;
        var preferences = root.TryGetProperty("preferences", out var prefElement) ? prefElement : default;
        var campaignId = JsonString(run, "campaignId", "is5_sarkaz");
        return new SukiRunStateSnapshot(
            campaignId,
            ReadStringSet(root, "operators"),
            ReadStringSet(root, "relics"),
            ReadStringSet(preferences, "operatorExcludedIds"),
            ReadStringSet(preferences, "relicExcludedIds"),
            JsonBool(preferences, "operatorShowSelectedFirst"),
            JsonBool(preferences, "operatorHideExcluded"),
            JsonBool(preferences, "operatorSelectedOnly"),
            JsonBool(preferences, "relicShowSelectedFirst"),
            JsonBool(preferences, "relicHideExcluded"),
            JsonBool(preferences, "relicSelectedOnly"),
            Math.Clamp(JsonNullableInt(preferences, "operatorGridColumns") ?? 2, 1, 4),
            Math.Clamp(JsonNullableInt(preferences, "relicGridColumns") ?? 2, 1, 4),
            JsonString(run, "squad"),
            JsonString(run, "difficulty"),
            JsonInt(run, "hope"),
            JsonNullableInt(run, "maxHope"),
            JsonInt(run, "ingot"),
            JsonInt(run, "lifePoints"),
            JsonInt(run, "shield"),
            JsonInt(run, "commandLevel"),
            ReadSpecialInt(run, campaignId, "idea"),
            BuildSpecialFieldStates(run, campaigns, selectableEffects));
    }

    private static IReadOnlyList<SukiSpecialFieldState> BuildSpecialFieldStates(
        JsonElement run,
        IReadOnlyList<SukiCampaignPreview> campaigns,
        IReadOnlyList<SelectableEffectPreview> selectableEffects)
    {
        var result = new List<SukiSpecialFieldState>();
        var effectsById = selectableEffects
            .GroupBy(effect => effect.Id, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);

        JsonElement special = default;
        if (run.ValueKind == JsonValueKind.Object
            && run.TryGetProperty("special", out var specialElement)
            && specialElement.ValueKind == JsonValueKind.Object)
        {
            special = specialElement;
        }

        foreach (var campaign in campaigns)
        {
            JsonElement campaignState = default;
            if (special.ValueKind == JsonValueKind.Object
                && special.TryGetProperty(campaign.Id, out var stateElement)
                && stateElement.ValueKind == JsonValueKind.Object)
            {
                campaignState = stateElement;
            }

            foreach (var field in campaign.SpecialFields)
            {
                result.Add(BuildSpecialFieldState(campaign.Id, field, campaignState, effectsById));
            }
        }

        return result;
    }

    private static SukiSpecialFieldState BuildSpecialFieldState(
        string campaignId,
        SukiCampaignSpecialField field,
        JsonElement campaignState,
        IReadOnlyDictionary<string, SelectableEffectPreview> effectsById)
    {
        campaignState.TryGetProperty(field.Id, out var value);
        var kind = FieldKindLabel(field.Type);
        var profileId = SpecialProfileId(campaignId, field.Id);
        return field.Type switch
        {
            "number" => new SukiSpecialFieldState(
                campaignId,
                field.Id,
                field.Label,
                field.Type,
                JsonElementNullableInt(value)?.ToString() ?? "未入力",
                kind,
                profileId,
                $"{field.Label}の数値"),
            "effectSelect" => BuildEffectSelectState(campaignId, field, value, kind, profileId, effectsById),
            "effectStackLoadout" => BuildEffectListState(campaignId, field, value, kind, profileId, effectsById, true),
            "effectMultiSelect" => BuildEffectListState(campaignId, field, value, kind, profileId, effectsById, false),
            "effectRankedMultiSelect" => BuildEffectListState(campaignId, field, value, kind, profileId, effectsById, false),
            "revelationBoardLoadout" => BuildEffectListState(campaignId, field, value, kind, profileId, effectsById, false),
            "coinLoadout" => BuildEffectListState(campaignId, field, value, kind, profileId, effectsById, false),
            _ => new SukiSpecialFieldState(
                campaignId,
                field.Id,
                field.Label,
                field.Type,
                IsJsonValueEmpty(value) ? "未入力" : "設定あり",
                kind,
                profileId,
                field.Type)
        };
    }

    private static SukiSpecialFieldState BuildEffectSelectState(
        string campaignId,
        SukiCampaignSpecialField field,
        JsonElement value,
        string kind,
        string profileId,
        IReadOnlyDictionary<string, SelectableEffectPreview> effectsById)
    {
        var effectId = JsonElementString(value);
        var effectLabel = ResolveEffectLabel(effectId, effectsById);
        return new SukiSpecialFieldState(
            campaignId,
            field.Id,
            field.Label,
            field.Type,
            string.IsNullOrWhiteSpace(effectLabel) ? "未選択" : effectLabel,
            kind,
            profileId,
            string.IsNullOrWhiteSpace(effectId) ? "取得値なし" : effectId);
    }

    private static SukiSpecialFieldState BuildEffectListState(
        string campaignId,
        SukiCampaignSpecialField field,
        JsonElement value,
        string kind,
        string profileId,
        IReadOnlyDictionary<string, SelectableEffectPreview> effectsById,
        bool sumCounts)
    {
        var entries = ReadEffectEntries(value, effectsById, sumCounts);
        var unit = string.IsNullOrWhiteSpace(field.UnitLabel) ? "件" : field.UnitLabel;
        return new SukiSpecialFieldState(
            campaignId,
            field.Id,
            field.Label,
            field.Type,
            $"{entries.Total}{unit}",
            kind,
            profileId,
            entries.Labels.Count == 0 ? "取得値なし" : string.Join(" / ", entries.Labels));
    }

    private static (int Total, IReadOnlyList<string> Labels) ReadEffectEntries(
        JsonElement value,
        IReadOnlyDictionary<string, SelectableEffectPreview> effectsById,
        bool sumCounts)
    {
        var total = 0;
        var labels = new List<string>();

        void AddEntry(string id, int count)
        {
            if (string.IsNullOrWhiteSpace(id))
                return;

            count = Math.Max(1, count);
            total += sumCounts ? count : 1;
            var name = ResolveEffectLabel(id, effectsById);
            labels.Add(sumCounts && count > 1 ? $"{name} x{count}" : name);
        }

        if (value.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in value.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String)
                {
                    AddEntry(JsonElementString(item), 1);
                    continue;
                }

                if (item.ValueKind == JsonValueKind.Object)
                {
                    var id = JsonString(item, "effectId");
                    if (string.IsNullOrWhiteSpace(id))
                        id = JsonString(item, "id");
                    AddEntry(id, JsonNullableInt(item, "count") ?? 1);
                }
            }
        }
        else if (value.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in value.EnumerateObject())
            {
                var count = property.Value.ValueKind == JsonValueKind.Number
                    ? JsonElementNullableInt(property.Value) ?? 1
                    : JsonNullableInt(property.Value, "count") ?? 1;
                AddEntry(property.Name, count);
            }
        }

        return (total, labels);
    }

    private static string ResolveEffectLabel(string effectId, IReadOnlyDictionary<string, SelectableEffectPreview> effectsById)
    {
        if (string.IsNullOrWhiteSpace(effectId))
            return "";

        return effectsById.TryGetValue(effectId, out var effect) && !string.IsNullOrWhiteSpace(effect.Name)
            ? effect.Name
            : effectId;
    }

    private static string FieldKindLabel(string type)
    {
        return type switch
        {
            "number" => "数値",
            "effectSelect" => "候補選択",
            "effectStackLoadout" => "個数入力",
            "effectMultiSelect" => "複数選択",
            "effectRankedMultiSelect" => "状態",
            "revelationBoardLoadout" => "啓示板",
            "coinLoadout" => "複数選択",
            _ => string.IsNullOrWhiteSpace(type) ? "固有値" : type
        };
    }

    private static string SpecialProfileId(string campaignId, string fieldId)
    {
        return (campaignId, fieldId) switch
        {
            ("is5_sarkaz", "thought") => "is5ThoughtFull",
            ("is5_sarkaz", "idea") => "run.idea.current",
            ("is5_sarkaz", "age") => "is5AgeFull",
            ("is3_mizuki", "rejectionReaction") => "is3RejectionReaction",
            ("is3_mizuki", "revelations") => "is3RevelationFull",
            ("is4_sami", "collapseValue") => "is4CollapseValue",
            ("is4_sami", "paradigmLost") => "is4ParadigmLost",
            ("is4_sami", "revelation") => "is4RevelationFull",
            ("is6_sui", "coins") => "is6CoinFull",
            ("is6_sui", "seasonalHours") => "is6SeasonalHours",
            _ => $"{campaignId}.{fieldId}"
        };
    }

    public static string ResolveDataRoot()
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

    private static string ResolveDataPath(string preferredDataRoot, string fileName)
    {
        var preferred = Path.Combine(preferredDataRoot, fileName);
        if (File.Exists(preferred))
            return preferred;

        return CandidateRoots()
            .Select(root => Path.Combine(root, "data", fileName))
            .Where(File.Exists)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault() ?? preferred;
    }

    public static string ResolveStatePath(string dataRoot)
    {
        var preferred = Path.Combine(dataRoot, "current-state.json");
        var candidates = new[] { preferred }
            .Concat(CandidateRoots().Select(root => Path.Combine(root, "data", "current-state.json")))
            .Where(File.Exists)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var projectState = candidates
            .Where(path => IsProjectRootStatePath(path))
            .OrderByDescending(File.GetLastWriteTimeUtc)
            .FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(projectState))
            return projectState;

        return candidates
            .OrderByDescending(File.GetLastWriteTimeUtc)
            .ThenBy(path => IsBuildOutputDataPath(path) ? 1 : 0)
            .FirstOrDefault() ?? preferred;
    }

    private static bool IsBuildOutputDataPath(string path)
    {
        return path.Replace('/', '\\').Contains("\\bin\\", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsProjectRootStatePath(string path)
    {
        var dataDirectory = Directory.GetParent(path);
        var projectRoot = dataDirectory?.Parent;
        return projectRoot is not null
            && File.Exists(Path.Combine(projectRoot.FullName, "package.json"))
            && File.Exists(Path.Combine(projectRoot.FullName, "data", "campaigns.json"));
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

    private static JsonElement JsonObject(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.Object
            ? property
            : default;
    }

    private static string ResolveLocalPath(string dataRoot, string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
            return "";

        if (Path.IsPathFullyQualified(relativePath) && File.Exists(relativePath))
            return relativePath;

        return CandidateRoots()
            .Prepend(Directory.GetParent(dataRoot)?.FullName ?? dataRoot)
            .Select(root => Path.GetFullPath(Path.Combine(root, relativePath)))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault(File.Exists) ?? "";
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

    private static int ReadSpecialInt(JsonElement run, string campaignId, string fieldId)
    {
        return TryGetSpecialValue(run, campaignId, fieldId, out var value)
            ? JsonElementNullableInt(value) ?? 0
            : 0;
    }

    private static bool TryGetSpecialValue(JsonElement run, string campaignId, string fieldId, out JsonElement value)
    {
        value = default;
        if (run.ValueKind != JsonValueKind.Object
            || !run.TryGetProperty("special", out var special)
            || special.ValueKind != JsonValueKind.Object
            || !special.TryGetProperty(campaignId, out var campaign)
            || campaign.ValueKind != JsonValueKind.Object
            || !campaign.TryGetProperty(fieldId, out value))
        {
            return false;
        }

        return true;
    }

    private static int? JsonNullableInt(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            ? JsonElementNullableInt(property)
            : null;
    }

    private static int? JsonElementNullableInt(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out var value))
            return value;

        if (element.ValueKind == JsonValueKind.String
            && int.TryParse(element.GetString(), out var stringValue))
        {
            return stringValue;
        }

        return null;
    }

    private static string JsonElementString(JsonElement element)
    {
        return element.ValueKind == JsonValueKind.String ? element.GetString() ?? "" : "";
    }

    private static bool IsJsonValueEmpty(JsonElement element)
    {
        return element.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null;
    }

    private static bool JsonBool(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind is JsonValueKind.True or JsonValueKind.False
            && property.GetBoolean();
    }
}
