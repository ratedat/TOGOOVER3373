using System.Text.Json;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesMaaRoiAdjustmentSessionLog
{
    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private static readonly JsonSerializerOptions ReadOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public static string BuildJson(
        IEnumerable<MaaRoiBatchDraftPreview> drafts,
        string? profileId,
        string? scanLogPath,
        string? capturePath,
        MaaRoiBatchApplyResult? batchResult,
        DateTimeOffset createdAt,
        string? comparisonSummary = null,
        IEnumerable<MaaRoiRescanComparisonRow>? comparisonRows = null,
        string? comparisonBeforeLogPath = null,
        string? comparisonAfterLogPath = null)
    {
        var payload = new MaaRoiAdjustmentSessionPayload(
            1,
            "maa-roi-adjustment-session",
            NormalizeProfile(profileId),
            scanLogPath?.Trim() ?? "",
            capturePath?.Trim() ?? "",
            createdAt.UtcDateTime.ToString("O"),
            drafts.Select(MaaRoiAdjustmentSessionDraft.FromPreview).ToArray(),
            batchResult,
            comparisonSummary?.Trim() ?? "",
            comparisonRows?.ToArray() ?? [],
            comparisonBeforeLogPath?.Trim() ?? "",
            comparisonAfterLogPath?.Trim() ?? "");

        return JsonSerializer.Serialize(payload, WriteOptions);
    }

    public static async Task<string> SaveAsync(
        IEnumerable<MaaRoiBatchDraftPreview> drafts,
        string? profileId,
        string? scanLogPath,
        string? capturePath,
        MaaRoiBatchApplyResult? batchResult,
        string directory,
        DateTimeOffset? createdAt = null,
        string? comparisonSummary = null,
        IEnumerable<MaaRoiRescanComparisonRow>? comparisonRows = null,
        string? comparisonBeforeLogPath = null,
        string? comparisonAfterLogPath = null)
    {
        Directory.CreateDirectory(directory);
        var timestamp = createdAt ?? DateTimeOffset.UtcNow;
        var normalizedProfile = NormalizeProfile(profileId) ?? "all";
        var file = Path.Combine(
            directory,
            $"roi-session-{TimestampForFile(timestamp)}-{SanitizeFilePart(normalizedProfile)}.json");
        var json = BuildJson(
            drafts,
            profileId,
            scanLogPath,
            capturePath,
            batchResult,
            timestamp,
            comparisonSummary,
            comparisonRows,
            comparisonBeforeLogPath,
            comparisonAfterLogPath);
        await File.WriteAllTextAsync(file, $"{json}{Environment.NewLine}");
        return file;
    }

    public static MaaRoiAdjustmentSessionPayload Load(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            return Empty();

        try
        {
            return JsonSerializer.Deserialize<MaaRoiAdjustmentSessionPayload>(File.ReadAllText(path), ReadOptions) ?? Empty();
        }
        catch
        {
            return Empty();
        }
    }

    public static IReadOnlyList<MaaRoiAdjustmentSessionItem> LoadRecent(
        string directory,
        int limit = 24)
    {
        if (!Directory.Exists(directory))
            return [];

        return Directory
            .EnumerateFiles(directory, "roi-session-*.json")
            .Select(TryLoadItem)
            .Where(item => item is not null)
            .Cast<MaaRoiAdjustmentSessionItem>()
            .OrderByDescending(item => item.SortTimestamp)
            .ThenBy(item => item.SessionPath, StringComparer.OrdinalIgnoreCase)
            .Take(Math.Max(1, limit))
            .ToArray();
    }

    private static MaaRoiAdjustmentSessionPayload Empty()
    {
        return new MaaRoiAdjustmentSessionPayload(0, "", null, "", "", "", [], null, "", [], "", "");
    }

    private static MaaRoiAdjustmentSessionItem? TryLoadItem(string path)
    {
        var payload = Load(path);
        if (payload.SchemaVersion != 1 || !payload.Kind.Equals("maa-roi-adjustment-session", StringComparison.Ordinal))
            return null;

        var timestamp = DateTimeOffset.TryParse(payload.CreatedAt, out var parsed)
            ? parsed
            : new DateTimeOffset(File.GetLastWriteTimeUtc(path), TimeSpan.Zero);
        return new MaaRoiAdjustmentSessionItem(
            payload.ProfileId ?? "",
            payload.CreatedAt,
            payload.DraftCount,
            payload.IncludedCount,
            payload.ComparisonCount,
            payload.ScanLogPath,
            path,
            timestamp);
    }

    private static string? NormalizeProfile(string? profileId)
    {
        return string.IsNullOrWhiteSpace(profileId) || profileId.Equals("all", StringComparison.Ordinal)
            ? null
            : profileId.Trim();
    }

    private static string TimestampForFile(DateTimeOffset value)
    {
        return value.UtcDateTime.ToString("yyyy-MM-ddTHH-mm-ss-fffZ");
    }

    private static string SanitizeFilePart(string value)
    {
        var text = string.IsNullOrWhiteSpace(value) ? "roi-session" : value.Trim();
        foreach (var invalid in Path.GetInvalidFileNameChars())
            text = text.Replace(invalid, '-');
        return text;
    }
}
