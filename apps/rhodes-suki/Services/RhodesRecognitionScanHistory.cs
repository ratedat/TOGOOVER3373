using System.Text.Json;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesRecognitionScanHistory
{
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
}
