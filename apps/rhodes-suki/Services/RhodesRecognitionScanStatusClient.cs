using System.Text.Json;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesRecognitionScanStatusClient
{
    public static async Task<RhodesRecognitionScanStatusPreview> FetchAsync(
        string baseUrl,
        TimeSpan? timeout = null,
        HttpClient? client = null,
        CancellationToken cancellationToken = default)
    {
        var ownsClient = client is null;
        client ??= new HttpClient { Timeout = timeout ?? TimeSpan.FromSeconds(5) };
        try
        {
            var response = await client.GetAsync($"{NormalizeBaseUrl(baseUrl)}/api/recognition/scan/status", cancellationToken);
            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                return RhodesRecognitionScanStatusPreview.Empty with { ActiveStatus = "取得失敗", Error = $"{(int)response.StatusCode} {Shorten(json, 180)}" };

            return ExtractStatus(json);
        }
        catch (Exception ex)
        {
            return RhodesRecognitionScanStatusPreview.Empty with { ActiveStatus = "取得失敗", Error = Shorten(ex.Message, 180) };
        }
        finally
        {
            if (ownsClient)
                client.Dispose();
        }
    }

    public static RhodesRecognitionScanStatusPreview ExtractStatus(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
            return RhodesRecognitionScanStatusPreview.Empty with { ActiveStatus = "応答異常", Error = "scan status応答がobjectではありません。" };

        var active = root.TryGetProperty("active", out var activeElement) && activeElement.ValueKind == JsonValueKind.Object
            ? activeElement
            : default;
        var lastScan = root.TryGetProperty("lastScan", out var lastElement) && lastElement.ValueKind == JsonValueKind.Object
            ? lastElement
            : default;
        var counts = lastScan.ValueKind == JsonValueKind.Object
            && lastScan.TryGetProperty("counts", out var countsElement)
            && countsElement.ValueKind == JsonValueKind.Object
            ? countsElement
            : default;

        var hasActive = active.ValueKind == JsonValueKind.Object;
        return new RhodesRecognitionScanStatusPreview(
            hasActive,
            hasActive ? JsonString(active, "profileId") : "",
            hasActive ? JsonString(active, "status") : "待機中",
            hasActive ? JsonString(active, "stage") : "",
            hasActive ? JsonArrayCount(active, "log") : 0,
            lastScan.ValueKind == JsonValueKind.Object ? JsonString(lastScan, "profileId") : "",
            lastScan.ValueKind == JsonValueKind.Object ? JsonString(lastScan, "status") : "",
            lastScan.ValueKind == JsonValueKind.Object ? JsonString(lastScan, "logPath") : "",
            counts.ValueKind == JsonValueKind.Object ? JsonInt(counts, "candidates") : 0,
            "");
    }

    private static string NormalizeBaseUrl(string value)
    {
        var text = string.IsNullOrWhiteSpace(value) ? "http://127.0.0.1:5173" : value.Trim();
        return text.TrimEnd('/');
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

    private static string Shorten(string value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "";

        var text = value.Trim().ReplaceLineEndings(" ");
        return text.Length <= maxLength ? text : $"{text[..maxLength]}...";
    }
}
