using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesMaaGeneratedResourceBuilder
{
    public const string MaaTasksSourcePath = "data/recognition/maa-tasks.json";
    public const string ScanProfilesSourcePath = "data/recognition/scan-profiles.json";
    public const string GeneratedPipelinePath = "resource/base/pipeline/rhodes-generated.json";

    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static string BuildJson(string maaTasksJson, string scanProfilesJson)
    {
        using var maaTasks = JsonDocument.Parse(maaTasksJson);
        using var scanProfiles = JsonDocument.Parse(scanProfilesJson);
        var pipeline = new JsonObject
        {
            ["RhodesGeneratedEmpty"] = new JsonObject
            {
                ["recognition"] = "DirectHit",
                ["action"] = "DoNothing",
                ["attach"] = new JsonObject
                {
                    ["generatedFrom"] = new JsonArray(MaaTasksSourcePath, ScanProfilesSourcePath),
                },
            },
        };

        foreach (var screen in ArrayProperty(maaTasks.RootElement, "screens"))
        {
            if (!RecognitionIs(screen, "OCR"))
                continue;

            var recognition = screen.GetProperty("recognition");
            pipeline[NodeName("RhodesScreen", JsonString(screen, "id"))] = OcrNode(recognition, new JsonObject
            {
                ["generated"] = true,
                ["source"] = "maa-tasks.screens",
                ["id"] = JsonString(screen, "id"),
                ["label"] = JsonString(screen, "label"),
                ["screenId"] = JsonString(screen, "screenId"),
                ["profileIds"] = CloneOrEmptyArray(screen, "profileIds"),
            });
        }

        foreach (var candidate in ArrayProperty(maaTasks.RootElement, "candidates"))
        {
            if (!RecognitionIs(candidate, "OCR"))
                continue;

            var recognition = candidate.GetProperty("recognition");
            pipeline[NodeName("RhodesCandidate", JsonString(candidate, "id"))] = OcrNode(recognition, new JsonObject
            {
                ["generated"] = true,
                ["source"] = "maa-tasks.candidates",
                ["id"] = JsonString(candidate, "id"),
                ["label"] = JsonString(candidate, "label"),
                ["profileIds"] = CloneOrEmptyArray(candidate, "profileIds"),
                ["candidate"] = CloneOrNull(candidate, "candidate"),
            });
        }

        foreach (var region in ArrayProperty(maaTasks.RootElement, "ocrRegions"))
        {
            var recognition = new JsonObject
            {
                ["roi"] = Clone(region.GetProperty("roi")),
                ["threshold"] = CloneOrNull(region, "threshold"),
                ["only_rec"] = true,
                ["expected"] = CloneOrNull(region, "expected"),
                ["ocrReplace"] = CloneOrNull(region, "ocrReplace"),
            };
            pipeline[NodeName("RhodesOcrRegion", JsonString(region, "id"))] = OcrNode(recognition, new JsonObject
            {
                ["generated"] = true,
                ["source"] = "maa-tasks.ocrRegions",
                ["id"] = JsonString(region, "id"),
                ["profileIds"] = CloneOrEmptyArray(region, "profileIds"),
                ["scale"] = CloneOrNull(region, "scale"),
            });
        }

        foreach (var profile in ArrayProperty(scanProfiles.RootElement, "profiles"))
        {
            var profileId = JsonString(profile, "id");
            var index = 0;
            foreach (var config in ArrayProperty(profile, "templateOcrRegions"))
            {
                if (string.IsNullOrWhiteSpace(JsonString(config, "templatePath")) || !config.TryGetProperty("searchRoi", out _))
                {
                    index++;
                    continue;
                }

                var idPrefix = JsonString(config, "idPrefix");
                var suffix = string.IsNullOrWhiteSpace(idPrefix) ? index.ToString() : idPrefix;
                pipeline[NodeName("RhodesTemplate", $"{profileId}.{suffix}")] = TemplateNode(config, new JsonObject
                {
                    ["generated"] = true,
                    ["source"] = "scan-profiles.templateOcrRegions",
                    ["profileId"] = profileId,
                    ["idPrefix"] = string.IsNullOrWhiteSpace(idPrefix) ? null : idPrefix,
                    ["ocrOffset"] = CloneOrNull(config, "ocrOffset"),
                    ["maxMatches"] = CloneOrNull(config, "maxMatches"),
                    ["numericFallback"] = CloneOrNull(config, "numericFallback"),
                });
                index++;
            }
        }

        return $"{pipeline.ToJsonString(WriteOptions)}{Environment.NewLine}";
    }

    public static async Task<MaaResourceGenerationResult> RegenerateFileAsync(
        string maaTasksPath,
        string scanProfilesPath,
        string outputPath)
    {
        if (!File.Exists(maaTasksPath))
            return MaaResourceGenerationResult.Failed($"maa-tasks.jsonが見つかりません: {maaTasksPath}");
        if (!File.Exists(scanProfilesPath))
            return MaaResourceGenerationResult.Failed($"scan-profiles.jsonが見つかりません: {scanProfilesPath}");

        var generatedJson = BuildJson(
            await File.ReadAllTextAsync(maaTasksPath),
            await File.ReadAllTextAsync(scanProfilesPath));
        var nodeCount = JsonNode.Parse(generatedJson)?.AsObject().Count ?? 0;
        Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? ".");
        var backupPath = "";
        if (File.Exists(outputPath))
        {
            backupPath = $"{outputPath}.bak-{DateTimeOffset.Now:yyyyMMdd-HHmmss-fff}";
            File.Copy(outputPath, backupPath, overwrite: false);
        }

        await File.WriteAllTextAsync(outputPath, generatedJson);
        return new MaaResourceGenerationResult(
            true,
            $"MAA Resourceを再生成しました: {nodeCount} nodes",
            outputPath,
            backupPath,
            nodeCount);
    }

    private static JsonObject OcrNode(JsonElement recognition, JsonObject attach)
    {
        return OcrNode(JsonNode.Parse(recognition.GetRawText())!.AsObject(), attach);
    }

    private static JsonObject OcrNode(JsonObject recognition, JsonObject attach)
    {
        var node = new JsonObject
        {
            ["recognition"] = "OCR",
            ["roi"] = recognition["roi"]?.DeepClone(),
            ["only_rec"] = JsonBool(recognition, "only_rec") ?? JsonBool(recognition, "onlyRec") ?? true,
            ["threshold"] = JsonDouble(recognition, "threshold") ?? 0.3,
            ["action"] = "DoNothing",
            ["attach"] = attach,
        };
        if (recognition["expected"] is JsonArray expected && expected.Count > 0)
            node["expected"] = expected.DeepClone();
        if (recognition["ocrReplace"] is JsonArray replace && replace.Count > 0)
            node["replace"] = replace.DeepClone();
        return node;
    }

    private static JsonObject TemplateNode(JsonElement config, JsonObject attach)
    {
        var roi = config.GetProperty("searchRoi");
        var template = JsonString(config, "templatePath")
            .Replace('\\', '/')
            .Replace("assets/recognition/templates/", "", StringComparison.Ordinal);
        return new JsonObject
        {
            ["recognition"] = "TemplateMatch",
            ["roi"] = new JsonArray(
                JsonInt(roi, "x"),
                JsonInt(roi, "y"),
                JsonInt(roi, "width"),
                JsonInt(roi, "height")),
            ["template"] = template,
            ["threshold"] = JsonDouble(config, "threshold") ?? 0.7,
            ["method"] = JsonInt(config, "method", 5),
            ["order_by"] = JsonString(config, "orderBy", "Score"),
            ["action"] = "DoNothing",
            ["attach"] = attach,
        };
    }

    private static IEnumerable<JsonElement> ArrayProperty(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.Array
            ? property.EnumerateArray()
            : [];
    }

    private static bool RecognitionIs(JsonElement element, string type)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty("recognition", out var recognition)
            && JsonString(recognition, "type").Equals(type, StringComparison.OrdinalIgnoreCase);
    }

    private static JsonNode? Clone(JsonElement element)
    {
        return JsonNode.Parse(element.GetRawText());
    }

    private static JsonNode? CloneOrNull(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object && element.TryGetProperty(propertyName, out var property)
            ? Clone(property)
            : null;
    }

    private static JsonArray CloneOrEmptyArray(JsonElement element, string propertyName)
    {
        return CloneOrNull(element, propertyName) as JsonArray ?? [];
    }

    private static string JsonString(JsonElement element, string propertyName, string fallback = "")
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.String
            ? property.GetString() ?? fallback
            : fallback;
    }

    private static int JsonInt(JsonElement element, string propertyName, int fallback = 0)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.Number
            && property.TryGetInt32(out var value)
            ? value
            : fallback;
    }

    private static double? JsonDouble(JsonObject element, string propertyName)
    {
        return element[propertyName]?.GetValue<double>();
    }

    private static double? JsonDouble(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.Number
            && property.TryGetDouble(out var value)
            ? value
            : null;
    }

    private static bool? JsonBool(JsonObject element, string propertyName)
    {
        return element[propertyName]?.GetValue<bool>();
    }

    private static string NodeName(string prefix, string id)
    {
        var safe = Regex.Replace(id, "[^A-Za-z0-9]+", "_").Trim('_');
        return $"{prefix}_{safe}";
    }
}
