using System.Text.Json;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesRecognitionScanHistory
{
    private static readonly JsonSerializerOptions ReadOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public static IReadOnlyList<RhodesRecognitionScanHistoryItem> LoadRecent(
        string directory,
        IEnumerable<string>? extraPaths = null,
        int limit = 24)
    {
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (Directory.Exists(directory))
        {
            foreach (var path in Directory.EnumerateFiles(directory, "recognition-*.json"))
                paths.Add(path);
        }

        foreach (var path in extraPaths ?? [])
        {
            if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
                paths.Add(path);
        }

        return paths
            .Select(TryLoad)
            .Where(item => item is not null)
            .Cast<RhodesRecognitionScanHistoryItem>()
            .OrderByDescending(item => item.SortTimestamp)
            .ThenBy(item => item.LogPath, StringComparer.OrdinalIgnoreCase)
            .Take(Math.Max(1, limit))
            .ToArray();
    }

    public static RhodesRecognitionScanHistoryPayload LoadPayload(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            return new RhodesRecognitionScanHistoryPayload([], [], [], "ログファイルが見つかりません。");

        try
        {
            var json = File.ReadAllText(path);
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
                return new RhodesRecognitionScanHistoryPayload([], [], [], "スキャンログがobjectではありません。");

            return new RhodesRecognitionScanHistoryPayload(
                RhodesMaaCandidateApiClient.ExtractCandidatePreviews(json),
                ExtractTaskResults(root),
                ExtractLogRows(root),
                "");
        }
        catch (Exception ex)
        {
            return new RhodesRecognitionScanHistoryPayload([], [], [], ex.Message);
        }
    }

    private static RhodesRecognitionScanHistoryItem? TryLoad(string path)
    {
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
                return null;

            var counts = ObjectProperty(root, "counts");
            var startedAt = JsonString(root, "startedAt");
            var completedAt = JsonString(root, "completedAt");
            var observedAt = ParseTimestamp(completedAt)
                ?? ParseTimestamp(startedAt)
                ?? new DateTimeOffset(File.GetLastWriteTimeUtc(path), TimeSpan.Zero);

            var candidateCount = JsonInt(counts, "candidates");
            if (candidateCount <= 0)
                candidateCount = JsonArrayCount(root, "candidates");

            var logCount = JsonInt(counts, "log");
            if (logCount <= 0)
                logCount = JsonArrayCount(root, "log");

            return new RhodesRecognitionScanHistoryItem(
                ProfileId: JsonString(root, "profileId"),
                ProfileLabel: JsonString(root, "profileLabel"),
                Source: JsonString(root, "source"),
                Status: JsonString(root, "status"),
                StartedAt: startedAt,
                CompletedAt: completedAt,
                CandidateCount: candidateCount,
                LogCount: logCount,
                ResourceTaskCount: JsonInt(counts, "resourceTasks"),
                LogPath: path,
                Error: JsonError(root),
                SortTimestamp: observedAt);
        }
        catch
        {
            return null;
        }
    }

    private static JsonElement ObjectProperty(JsonElement root, string propertyName)
    {
        return root.ValueKind == JsonValueKind.Object
            && root.TryGetProperty(propertyName, out var value)
            && value.ValueKind == JsonValueKind.Object
            ? value
            : default;
    }

    private static string JsonString(JsonElement root, string propertyName)
    {
        return root.ValueKind == JsonValueKind.Object
            && root.TryGetProperty(propertyName, out var value)
            && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? ""
            : "";
    }

    private static int JsonInt(JsonElement root, string propertyName)
    {
        return root.ValueKind == JsonValueKind.Object
            && root.TryGetProperty(propertyName, out var value)
            && value.ValueKind == JsonValueKind.Number
            && value.TryGetInt32(out var result)
            ? result
            : 0;
    }

    private static int JsonArrayCount(JsonElement root, string propertyName)
    {
        return root.ValueKind == JsonValueKind.Object
            && root.TryGetProperty(propertyName, out var value)
            && value.ValueKind == JsonValueKind.Array
            ? value.GetArrayLength()
            : 0;
    }

    private static string JsonError(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("error", out var value))
            return "";

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? "",
            JsonValueKind.Null => "",
            JsonValueKind.Undefined => "",
            _ => value.GetRawText(),
        };
    }

    private static DateTimeOffset? ParseTimestamp(string value)
    {
        return DateTimeOffset.TryParse(value, out var result) ? result : null;
    }

    private static IReadOnlyList<MaaTaskRunResult> ExtractTaskResults(JsonElement root)
    {
        var evidence = ObjectProperty(root, "evidence");
        if (evidence.ValueKind != JsonValueKind.Object
            || !evidence.TryGetProperty("taskResults", out var taskResults)
            || taskResults.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return JsonSerializer.Deserialize<MaaTaskRunResult[]>(taskResults.GetRawText(), ReadOptions) ?? [];
    }

    private static IReadOnlyList<RhodesRecognitionScanLogRow> ExtractLogRows(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object
            || !root.TryGetProperty("log", out var log)
            || log.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var rows = new List<RhodesRecognitionScanLogRow>();
        foreach (var entry in log.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object)
                continue;

            rows.Add(new RhodesRecognitionScanLogRow(
                JsonString(entry, "event"),
                JsonString(entry, "at"),
                JsonString(entry, "entry"),
                JsonString(entry, "stage"),
                JsonString(entry, "label"),
                BuildLogDetail(entry),
                JsonString(entry, "path")));
        }
        return rows;
    }

    private static string BuildLogDetail(JsonElement entry)
    {
        var parts = new List<string>();
        foreach (var property in entry.EnumerateObject())
        {
            if (property.Name is "event" or "at" or "entry" or "stage" or "label" or "path")
                continue;

            var value = JsonValueText(property.Value);
            if (!string.IsNullOrWhiteSpace(value))
                parts.Add($"{property.Name}={value}");
        }

        return string.Join(", ", parts);
    }

    private static string JsonValueText(JsonElement value)
    {
        var text = value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? "",
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Null => "",
            JsonValueKind.Undefined => "",
            _ => value.GetRawText(),
        };
        return text.Length <= 160 ? text : $"{text[..160]}...";
    }
}
