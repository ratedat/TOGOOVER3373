using System.Globalization;
using System.Text;
using System.Text.Json;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesMaaLocalCandidateConverter
{
    private static readonly IReadOnlyDictionary<string, (string Field, string Label, int Min, int Max, double Confidence)> RunStatusFields =
        new Dictionary<string, (string Field, string Label, int Min, int Max, double Confidence)>(StringComparer.Ordinal)
        {
            ["run.hope.current"] = ("hope", "希望", 0, 999, 0.74),
            ["run.hope.max"] = ("maxHope", "希望上限", 0, 999, 0.72),
            ["run.ingot"] = ("ingot", "源石錐", 0, 9999, 0.84),
            ["run.top_ingot"] = ("ingot", "源石錐", 0, 9999, 0.80),
            ["run.top_ingot.wide"] = ("ingot", "源石錐", 0, 9999, 0.76),
            ["run.life_points"] = ("lifePoints", "耐久値", 0, 999, 0.73),
            ["run.shield"] = ("shield", "シールド", 0, 999, 0.70),
            ["run.command_level"] = ("commandLevel", "指揮Lv", 1, 99, 0.75),
            ["run.idea"] = ("idea", "構想", 0, 999, 0.70),
            ["run.idea.current"] = ("idea", "構想", 0, 999, 0.82),
        };

    public static IReadOnlyList<MaaCandidatePreview> FromTaskResults(
        string? profileId,
        IEnumerable<MaaTaskRunResult> taskResults)
    {
        if (string.IsNullOrWhiteSpace(profileId) || string.Equals(profileId, "all", StringComparison.Ordinal))
            return AllProfileCandidates(taskResults).ToArray();

        if (string.Equals(profileId, "runStatusFull", StringComparison.Ordinal))
            return BestRunStatusCandidates(RunStatusCandidates(taskResults));

        if (string.Equals(profileId, "operatorsFull", StringComparison.Ordinal))
            return OperatorCandidates(taskResults).ToArray();

        if (string.Equals(profileId, "relicsFull", StringComparison.Ordinal))
            return RelicCandidates(taskResults).ToArray();

        if (string.Equals(profileId, "is5ThoughtFull", StringComparison.Ordinal))
            return ThoughtCandidates(taskResults).ToArray();

        if (string.Equals(profileId, "is5AgeFull", StringComparison.Ordinal))
            return AgeCandidates(taskResults).ToArray();

        if (string.Equals(profileId, "is4RevelationFull", StringComparison.Ordinal))
            return RevelationCandidates(taskResults).ToArray();

        if (string.Equals(profileId, "is6CoinsFull", StringComparison.Ordinal))
            return CoinCandidates(taskResults).ToArray();

        return [];
    }

    private static IReadOnlyList<MaaCandidatePreview> AllProfileCandidates(IEnumerable<MaaTaskRunResult> taskResults)
    {
        var results = taskResults.ToArray();
        var candidates = BestRunStatusCandidates(RunStatusCandidates(results))
            .Concat(OperatorCandidates(results))
            .Concat(RelicCandidates(results))
            .Concat(ThoughtCandidates(results))
            .Concat(AgeCandidates(results))
            .Concat(RevelationCandidates(results))
            .Concat(CoinCandidates(results));
        return RhodesMaaCandidateMerger.Merge([], candidates);
    }

    private static IReadOnlyList<MaaCandidatePreview> BestRunStatusCandidates(IEnumerable<MaaCandidatePreview> candidates)
    {
        var bestByField = new Dictionary<string, (MaaCandidatePreview Candidate, int Index)>(StringComparer.Ordinal);
        var index = 0;
        foreach (var candidate in candidates)
        {
            var field = string.IsNullOrWhiteSpace(candidate.Field) ? candidate.Value : candidate.Field;
            if (!bestByField.TryGetValue(field, out var existing))
            {
                bestByField[field] = (candidate, index);
            }
            else if ((candidate.Confidence ?? 0) > (existing.Candidate.Confidence ?? 0))
            {
                bestByField[field] = (candidate, existing.Index);
            }
            index++;
        }

        return bestByField.Values
            .OrderBy(item => item.Index)
            .Select(item => item.Candidate)
            .ToArray();
    }

    private static IEnumerable<MaaCandidatePreview> RunStatusCandidates(IEnumerable<MaaTaskRunResult> taskResults)
    {
        foreach (var taskResult in taskResults)
        {
            if (!taskResult.Succeeded)
                continue;

            var regionId = RunStatusRegionId(taskResult.Entry);
            if (string.IsNullOrWhiteSpace(regionId) || !RunStatusFields.TryGetValue(regionId, out var field))
                continue;

            var textResult = PrimaryTextResult(taskResult.RecognitionDetailJson);
            if (string.IsNullOrWhiteSpace(textResult.Text))
                continue;

            var value = NumericValue(textResult.Text, allowRoman: field.Field == "commandLevel");
            if (value is null || value < field.Min || value > field.Max)
                continue;

            var confidence = Math.Max(field.Confidence, textResult.Confidence ?? 0);
            yield return new MaaCandidatePreview(
                "runStatus",
                field.Label,
                value.Value.ToString(CultureInfo.InvariantCulture),
                textResult.Text,
                confidence,
                Field: field.Field,
                CampaignId: field.Field == "idea" ? "is5_sarkaz" : "",
                RecognitionKey: $"maa-local:{field.Field}:{regionId}");
        }
    }

    private static string RunStatusRegionId(string entry)
    {
        return entry switch
        {
            "RhodesOcrRegion_run_hope_current" or "RhodesTemplate_runStatusFull_run_hope_current" or "RhodesTemplate_runStatusFull_run_hope_current_full" => "run.hope.current",
            "RhodesOcrRegion_run_hope_max" or "RhodesTemplate_runStatusFull_run_hope_max" or "RhodesTemplate_runStatusFull_run_hope_max_full" => "run.hope.max",
            "RhodesOcrRegion_run_ingot" or "RhodesTemplate_runStatusFull_run_ingot" => "run.ingot",
            "RhodesOcrRegion_run_top_ingot" => "run.top_ingot",
            "RhodesOcrRegion_run_top_ingot_wide" => "run.top_ingot.wide",
            "RhodesOcrRegion_run_life_points" or "RhodesTemplate_runStatusFull_run_life_points" => "run.life_points",
            "RhodesOcrRegion_run_shield" or "RhodesTemplate_runStatusFull_run_shield" => "run.shield",
            "RhodesOcrRegion_run_command_level" => "run.command_level",
            "RhodesOcrRegion_run_idea" => "run.idea",
            "RhodesOcrRegion_run_idea_current" or "RhodesTemplate_runStatusFull_run_idea_current" => "run.idea.current",
            _ => "",
        };
    }

    private static IEnumerable<MaaCandidatePreview> OperatorCandidates(IEnumerable<MaaTaskRunResult> taskResults)
    {
        var operators = RhodesRunCatalog.LoadDefault().Operators
            .Where(item => !string.IsNullOrWhiteSpace(item.Id) && !string.IsNullOrWhiteSpace(item.Name))
            .ToArray();
        var byNormalizedName = operators
            .GroupBy(item => NormalizeChoiceName(item.Name), StringComparer.Ordinal)
            .Where(group => !string.IsNullOrWhiteSpace(group.Key) && group.Count() == 1)
            .ToDictionary(group => group.Key, group => group.Single(), StringComparer.Ordinal);
        var matched = new Dictionary<string, (SukiChoiceItem Operator, string RawText, double? Confidence, int Order)>(
            StringComparer.Ordinal);
        var order = 0;

        foreach (var taskResult in taskResults)
        {
            if (!taskResult.Succeeded || !IsOperatorNameEntry(taskResult.Entry))
                continue;

            foreach (var textResult in PrimaryTextResults(taskResult.RecognitionDetailJson))
            {
                foreach (var token in ChoiceNameTokens(textResult.Text))
                {
                    if (!byNormalizedName.TryGetValue(token.Normalized, out var op))
                        continue;

                    if (!matched.TryGetValue(op.Id, out var existing))
                    {
                        matched[op.Id] = (op, token.Raw, textResult.Confidence, order);
                    }
                    else if ((textResult.Confidence ?? 0) > (existing.Confidence ?? 0))
                    {
                        matched[op.Id] = (op, token.Raw, textResult.Confidence, existing.Order);
                    }
                }
            }

            order++;
        }

        foreach (var item in matched.Values.OrderBy(item => item.Order))
        {
            yield return new MaaCandidatePreview(
                "operator",
                item.Operator.Name,
                item.Operator.Id,
                item.RawText,
                Math.Max(0.70, item.Confidence ?? 0),
                OperatorId: item.Operator.Id,
                RecognitionKey: $"maa-local:operator:{item.Operator.Id}");
        }
    }

    private static IEnumerable<MaaCandidatePreview> RelicCandidates(IEnumerable<MaaTaskRunResult> taskResults)
    {
        var catalog = RhodesRunCatalog.LoadDefault();
        var campaignId = catalog.Current.CampaignId;
        if (string.IsNullOrWhiteSpace(campaignId))
            yield break;

        var relics = catalog.Relics
            .Where(item => string.Equals(item.CampaignId, campaignId, StringComparison.Ordinal))
            .Where(item => !string.IsNullOrWhiteSpace(item.Id) && !string.IsNullOrWhiteSpace(item.Name))
            .ToArray();
        var byNormalizedName = relics
            .GroupBy(item => NormalizeChoiceName(item.Name), StringComparer.Ordinal)
            .Where(group => !string.IsNullOrWhiteSpace(group.Key) && group.Count() == 1)
            .ToDictionary(group => group.Key, group => group.Single(), StringComparer.Ordinal);
        var matched = new Dictionary<string, (SukiChoiceItem Relic, string RawText, double? Confidence, int Order)>(
            StringComparer.Ordinal);
        var order = 0;

        foreach (var taskResult in taskResults)
        {
            if (!taskResult.Succeeded || !IsRelicNameEntry(taskResult.Entry))
                continue;

            foreach (var textResult in PrimaryTextResults(taskResult.RecognitionDetailJson))
            {
                foreach (var token in ChoiceNameTokens(textResult.Text))
                {
                    if (!byNormalizedName.TryGetValue(token.Normalized, out var relic))
                        continue;

                    if (!matched.TryGetValue(relic.Id, out var existing))
                    {
                        matched[relic.Id] = (relic, token.Raw, textResult.Confidence, order);
                    }
                    else if ((textResult.Confidence ?? 0) > (existing.Confidence ?? 0))
                    {
                        matched[relic.Id] = (relic, token.Raw, textResult.Confidence, existing.Order);
                    }
                }
            }

            order++;
        }

        foreach (var item in matched.Values.OrderBy(item => item.Order))
        {
            yield return new MaaCandidatePreview(
                "relic",
                item.Relic.Name,
                item.Relic.Id,
                item.RawText,
                Math.Max(0.68, item.Confidence ?? 0),
                RelicId: item.Relic.Id,
                CampaignId: item.Relic.CampaignId,
                RecognitionKey: $"maa-local:relic:{item.Relic.Id}");
        }
    }

    private static IEnumerable<MaaCandidatePreview> AgeCandidates(IEnumerable<MaaTaskRunResult> taskResults)
    {
        var textResults = taskResults
            .Where(taskResult => taskResult.Succeeded && IsAgeEntry(taskResult.Entry))
            .SelectMany(taskResult => PrimaryTextResults(taskResult.RecognitionDetailJson))
            .Where(result => !string.IsNullOrWhiteSpace(result.Text))
            .ToArray();
        if (textResults.Length == 0)
            yield break;

        var rawText = string.Join("\n", textResults.Select(result => result.Text));
        var normalizedText = NormalizeChoiceName(rawText);
        if (string.IsNullOrWhiteSpace(normalizedText))
            yield break;

        var confidence = textResults.Max(result => result.Confidence ?? 0);
        foreach (var effect in LoadSelectableEffects()
            .Where(effect => effect.Slot == "age" && effect.CampaignId == "is5_sarkaz"))
        {
            var matched = AgeAliases(effect).Any(alias => normalizedText.Contains(alias, StringComparison.Ordinal));
            if (!matched)
                continue;

            yield return new MaaCandidatePreview(
                "age",
                effect.Name,
                effect.Id,
                rawText,
                Math.Max(0.70, confidence),
                CampaignId: effect.CampaignId,
                RecognitionKey: $"maa-local:age:{effect.Id}",
                AgeId: effect.Id);
        }
    }

    private static IEnumerable<MaaCandidatePreview> ThoughtCandidates(IEnumerable<MaaTaskRunResult> taskResults)
    {
        var thoughts = LoadSelectableEffects()
            .Where(effect => effect.Slot == "thought" && effect.CampaignId == "is5_sarkaz")
            .ToArray();
        var byNormalizedName = thoughts
            .GroupBy(item => NormalizeChoiceName(item.Name), StringComparer.Ordinal)
            .Where(group => !string.IsNullOrWhiteSpace(group.Key) && group.Count() == 1)
            .ToDictionary(group => group.Key, group => group.Single(), StringComparer.Ordinal);
        var order = 0;

        foreach (var taskResult in taskResults)
        {
            if (!taskResult.Succeeded || !IsThoughtNameEntry(taskResult.Entry))
                continue;

            foreach (var textResult in PrimaryTextResults(taskResult.RecognitionDetailJson))
            {
                foreach (var token in ChoiceNameTokens(textResult.Text))
                {
                    if (!byNormalizedName.TryGetValue(token.Normalized, out var thought))
                        continue;

                    yield return new MaaCandidatePreview(
                        "thought",
                        thought.Name,
                        thought.Id,
                        token.Raw,
                        Math.Max(0.68, textResult.Confidence ?? 0),
                        CampaignId: thought.CampaignId,
                        RecognitionKey: $"maa-local:thought:{thought.Id}:{order}",
                        ThoughtId: thought.Id);
                    order++;
                }
            }
        }
    }

    private static IEnumerable<MaaCandidatePreview> RevelationCandidates(IEnumerable<MaaTaskRunResult> taskResults)
    {
        var effects = LoadSelectableEffects()
            .Where(effect => effect.Slot == "revelationBoard" && effect.CampaignId == "is4_sami")
            .Select(effect => (Effect: effect, SlotKind: RevelationSlotKind(effect.GroupLabel)))
            .Where(item => !string.IsNullOrWhiteSpace(item.SlotKind))
            .ToArray();
        var byNormalizedName = effects
            .GroupBy(item => NormalizeChoiceName(item.Effect.Name), StringComparer.Ordinal)
            .Where(group => !string.IsNullOrWhiteSpace(group.Key) && group.Count() == 1)
            .ToDictionary(group => group.Key, group => group.Single(), StringComparer.Ordinal);
        var order = 0;

        foreach (var taskResult in taskResults)
        {
            if (!taskResult.Succeeded || !IsRevelationNameEntry(taskResult.Entry))
                continue;

            foreach (var textResult in PrimaryTextResults(taskResult.RecognitionDetailJson))
            {
                foreach (var token in ChoiceNameTokens(textResult.Text))
                {
                    if (!byNormalizedName.TryGetValue(token.Normalized, out var matched))
                        continue;

                    yield return new MaaCandidatePreview(
                        "revelation",
                        matched.Effect.Name,
                        matched.Effect.Id,
                        token.Raw,
                        Math.Max(0.68, textResult.Confidence ?? 0),
                        CampaignId: matched.Effect.CampaignId,
                        RecognitionKey: $"maa-local:revelation:{matched.Effect.Id}:{order}",
                        FieldId: "revelation",
                        SlotKind: matched.SlotKind,
                        EffectId: matched.Effect.Id,
                        Count: 1);
                    order++;
                }
            }
        }
    }

    private static IEnumerable<MaaCandidatePreview> CoinCandidates(IEnumerable<MaaTaskRunResult> taskResults)
    {
        var coins = LoadSelectableEffects()
            .Where(effect => effect.Slot == "coin" && effect.CampaignId == "is6_sui")
            .ToArray();
        var byNormalizedName = coins
            .GroupBy(item => NormalizeChoiceName(item.Name), StringComparer.Ordinal)
            .Where(group => !string.IsNullOrWhiteSpace(group.Key) && group.Count() == 1)
            .ToDictionary(group => group.Key, group => group.Single(), StringComparer.Ordinal);
        var order = 0;

        foreach (var taskResult in taskResults)
        {
            if (!taskResult.Succeeded || !IsCoinNameEntry(taskResult.Entry))
                continue;

            foreach (var textResult in PrimaryTextResults(taskResult.RecognitionDetailJson))
            {
                foreach (var token in ChoiceNameTokens(textResult.Text))
                {
                    if (!byNormalizedName.TryGetValue(token.Normalized, out var coin))
                        continue;

                    yield return new MaaCandidatePreview(
                        "coin",
                        coin.Name,
                        coin.Id,
                        token.Raw,
                        Math.Max(0.68, textResult.Confidence ?? 0),
                        CampaignId: coin.CampaignId,
                        RecognitionKey: $"maa-local:coin:{coin.Id}:{order}",
                        FieldId: "coins",
                        CoinId: coin.Id,
                        Count: 1);
                    order++;
                }
            }
        }
    }

    private static bool IsOperatorNameEntry(string entry)
    {
        return entry.Equals("RhodesOperatorNameOcr", StringComparison.Ordinal)
            || entry.Equals("RhodesOcrRegion_operator_name", StringComparison.Ordinal)
            || entry.StartsWith("RhodesOcrRegion_operator_name_", StringComparison.Ordinal)
            || entry.Contains("operator.card.name", StringComparison.OrdinalIgnoreCase)
            || entry.Contains("operator.recruit.name", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsRelicNameEntry(string entry)
    {
        return entry.Equals("RhodesOcrRegion_relic_list_text", StringComparison.Ordinal)
            || entry.Contains("relic.list_text", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsAgeEntry(string entry)
    {
        return entry.Equals("RhodesOcrRegion_is5_age_detail_text", StringComparison.Ordinal)
            || entry.Equals("RhodesScreen_run_sarkaz_age_detail", StringComparison.Ordinal)
            || entry.Contains("is5.age_detail_text", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsThoughtNameEntry(string entry)
    {
        return entry.Equals("RhodesOcrRegion_is5_thought_list_text", StringComparison.Ordinal)
            || entry.Contains("is5.thought_list_text", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsRevelationNameEntry(string entry)
    {
        return entry.Equals("RhodesOcrRegion_is4_revelation_list_text", StringComparison.Ordinal)
            || entry.Contains("is4.revelation_list_text", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsCoinNameEntry(string entry)
    {
        return entry.Equals("RhodesOcrRegion_is6_coin_list_text", StringComparison.Ordinal)
            || entry.Contains("is6.coin_list_text", StringComparison.OrdinalIgnoreCase);
    }

    private static string RevelationSlotKind(string groupLabel)
    {
        if (groupLabel.Contains("本因", StringComparison.Ordinal))
            return "cause";
        if (groupLabel.Contains("構成", StringComparison.Ordinal))
            return "structure";
        if (groupLabel.Contains("修辞", StringComparison.Ordinal))
            return "rhetoric";
        return "";
    }

    private static IEnumerable<string> AgeAliases(SelectableEffectCandidate effect)
    {
        return new[]
            {
                effect.Name,
                $"{effect.ParentName}{effect.VariantLabel}",
                $"{effect.GroupLabel}{effect.VariantLabel}",
            }
            .Select(NormalizeChoiceName)
            .Where(alias => alias.Length >= 4)
            .Distinct(StringComparer.Ordinal);
    }

    private static IEnumerable<(string Raw, string Normalized)> ChoiceNameTokens(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            yield break;

        var whole = NormalizeChoiceName(value);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        if (whole.Length >= 2)
        {
            seen.Add(whole);
            yield return (value.Trim(), whole);
        }

        var parts = value.Split(
            [' ', '\t', '\r', '\n', '　', ',', '，', '、', '。', ';', '；', ':', '：', '/', '\\', '|'],
            StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length == 0)
            parts = [value.Trim()];

        foreach (var part in parts)
        {
            var normalized = NormalizeChoiceName(part);
            if (normalized.Length >= 2 && seen.Add(normalized))
                yield return (part.Trim(), normalized);
        }
    }

    private static string NormalizeChoiceName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "";

        var normalized = value.Trim().Normalize(NormalizationForm.FormKC);
        var chars = new List<char>();
        foreach (var ch in normalized)
        {
            if (char.IsWhiteSpace(ch))
                continue;

            if (ch is '・' or '･' or '「' or '」' or '『' or '』' or '【' or '】' or '[' or ']' or '(' or ')' or '（' or '）')
                continue;

            chars.Add(ch);
        }
        return new string(chars.ToArray());
    }

    private static (string Text, double? Confidence) PrimaryTextResult(string value)
    {
        var results = PrimaryTextResults(value);
        if (results.Count > 0)
            return results[0];

        return ("", null);
    }

    private static IReadOnlyList<(string Text, double? Confidence)> PrimaryTextResults(string value)
    {
        using var document = ParseRecognitionDetail(value);
        if (document is null)
            return [];

        var root = document.RootElement;
        if (root.ValueKind == JsonValueKind.Object
            && root.TryGetProperty("result", out var nested)
            && nested.ValueKind == JsonValueKind.Object)
        {
            root = nested;
        }

        var results = new List<(string Text, double? Confidence)>();
        foreach (var item in PrimaryResults(root))
        {
            if (item.ValueKind != JsonValueKind.Object)
                continue;

            var text = JsonString(item, "text");
            if (!string.IsNullOrWhiteSpace(text))
            {
                results.Add((
                    text.Trim(),
                    JsonNumber(item, "score") ?? JsonNumber(item, "confidence") ?? JsonNumber(item, "prob")));
            }
        }

        return results;
    }

    private static JsonDocument? ParseRecognitionDetail(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var text = value.Trim();
        var jsonStart = text.IndexOf('{');
        if (jsonStart < 0)
            return null;

        try
        {
            return JsonDocument.Parse(text[jsonStart..]);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IReadOnlyList<JsonElement> PrimaryResults(JsonElement detail)
    {
        var filtered = ResultArray(detail, "filtered", "filtered_results", "filteredResults");
        if (filtered.Count > 0)
            return filtered;

        if (FirstObject(detail, "best", "best_result", "bestResult") is { } best)
            return [best];

        return ResultArray(detail, "all", "all_results", "allResults");
    }

    private static List<JsonElement> ResultArray(JsonElement detail, params string[] names)
    {
        var results = new List<JsonElement>();
        if (detail.ValueKind != JsonValueKind.Object)
            return results;

        foreach (var name in names)
        {
            if (!detail.TryGetProperty(name, out var property))
                continue;

            if (property.ValueKind == JsonValueKind.Array)
            {
                results.AddRange(property.EnumerateArray());
                return results;
            }

            if (property.ValueKind == JsonValueKind.Object)
            {
                results.Add(property);
                return results;
            }
        }
        return results;
    }

    private static JsonElement? FirstObject(JsonElement detail, params string[] names)
    {
        if (detail.ValueKind != JsonValueKind.Object)
            return null;

        foreach (var name in names)
        {
            if (detail.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.Object)
                return property;
        }
        return null;
    }

    private static int? NumericValue(string value, bool allowRoman)
    {
        var text = NormalizeDigits(value, allowRoman);
        if (string.IsNullOrWhiteSpace(text))
            return null;

        return int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number)
            ? number
            : null;
    }

    private static string NormalizeDigits(string value, bool allowRoman)
    {
        var chars = new List<char>();
        foreach (var ch in value)
        {
            if (ch is >= '0' and <= '9')
            {
                chars.Add(ch);
                continue;
            }

            if (ch is >= '０' and <= '９')
            {
                chars.Add((char)('0' + (ch - '０')));
                continue;
            }

            if (ch is 'O' or 'o' or 'Ｏ' or 'ｏ')
            {
                chars.Add('0');
                continue;
            }

            if (ch is '図')
            {
                chars.Add('2');
                continue;
            }

            if (ch is 'イ' or 'ィ')
            {
                chars.Add('1');
                continue;
            }

            if (allowRoman && ch is 'I' or 'i' or 'L' or 'l' or '一' or '丨')
                chars.Add('1');
        }
        return new string(chars.ToArray());
    }

    private static string JsonString(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.String
            ? property.GetString() ?? ""
            : "";
    }

    private static double? JsonNumber(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property))
            return null;

        if (property.ValueKind == JsonValueKind.Number && property.TryGetDouble(out var number))
            return number;

        if (property.ValueKind == JsonValueKind.String
            && double.TryParse(property.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out number))
        {
            return number;
        }

        return null;
    }

    private static IReadOnlyList<SelectableEffectCandidate> LoadSelectableEffects()
    {
        var path = ResolveDataPath("selectable-effects.json");
        if (string.IsNullOrWhiteSpace(path))
            return [];

        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        if (!root.TryGetProperty("selectableEffects", out var effects) || effects.ValueKind != JsonValueKind.Array)
            return [];

        return effects.EnumerateArray()
            .Select(item => new SelectableEffectCandidate(
                JsonString(item, "id"),
                JsonString(item, "campaignId"),
                JsonString(item, "slot"),
                JsonString(item, "name"),
                JsonString(item, "groupLabel"),
                JsonString(item, "parentName"),
                JsonString(item, "variantLabel")))
            .Where(item => !string.IsNullOrWhiteSpace(item.Id) && !string.IsNullOrWhiteSpace(item.Name))
            .ToArray();
    }

    private static string ResolveDataPath(string fileName)
    {
        foreach (var dataRoot in DataRootCandidates().Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var path = Path.Combine(dataRoot, fileName);
            if (File.Exists(path))
                return path;
        }
        return "";
    }

    private static IEnumerable<string> DataRootCandidates()
    {
        foreach (var origin in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            var current = new DirectoryInfo(origin);
            for (var i = 0; current is not null && i < 8; i++, current = current.Parent)
            {
                yield return Path.Combine(current.FullName, "data");
            }
        }
    }

    private sealed record SelectableEffectCandidate(
        string Id,
        string CampaignId,
        string Slot,
        string Name,
        string GroupLabel,
        string ParentName,
        string VariantLabel);
}
