using System.Net.Http.Json;
using System.Text.Json;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public sealed record RhodesAdbApiDetectionResult(
    string SelectedAdbPath,
    string RuntimeAdbPath,
    string RuntimeSerial,
    IReadOnlyList<MaaAdbPathCandidatePreview> AdbCandidates,
    IReadOnlyList<MaaAdbDevicePreview> Devices,
    string Error)
{
    public bool Succeeded => string.IsNullOrWhiteSpace(Error);
}

public sealed record RhodesAdbApiTestResult(
    bool Ok,
    string RuntimeAdbPath,
    string RuntimeSerial,
    int Width,
    int Height,
    long ScreenshotBytes,
    string ScreenshotPath,
    string CapturedAt,
    string Error)
{
    public bool Succeeded => string.IsNullOrWhiteSpace(Error) && Ok;
}

public static class RhodesAdbApiClient
{
    public static async Task<RhodesAdbApiDetectionResult> DetectAsync(
        string baseUrl,
        RhodesAdbApiSettings settings,
        TimeSpan? timeout = null,
        HttpClient? client = null,
        CancellationToken cancellationToken = default)
    {
        var ownsClient = client is null;
        client ??= new HttpClient { Timeout = timeout ?? TimeSpan.FromSeconds(15) };
        try
        {
            var response = await client.PostAsJsonAsync(
                $"{NormalizeBaseUrl(baseUrl)}/api/adb/detect",
                new
                {
                    settings = new
                    {
                        autoDetect = settings.AutoDetect,
                        connectionPreset = settings.ConnectionPreset,
                        adbPath = settings.AdbPath,
                        serial = settings.Serial,
                    },
                },
                cancellationToken);
            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                return new RhodesAdbApiDetectionResult("", "", "", [], [], $"{(int)response.StatusCode} {Shorten(json, 180)}");

            return ExtractDetectionResult(json);
        }
        catch (Exception ex)
        {
            return new RhodesAdbApiDetectionResult("", "", "", [], [], Shorten(ex.Message, 180));
        }
        finally
        {
            if (ownsClient)
                client.Dispose();
        }
    }

    public static RhodesAdbApiDetectionResult ExtractDetectionResult(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
            return new RhodesAdbApiDetectionResult("", "", "", [], [], "ADB検出応答がobjectではありません。");

        var runtime = root.TryGetProperty("runtime", out var runtimeElement) && runtimeElement.ValueKind == JsonValueKind.Object
            ? runtimeElement
            : default;
        var selectedAdbPath = JsonString(root, "selectedAdbPath");
        var runtimeAdbPath = runtime.ValueKind == JsonValueKind.Object ? JsonString(runtime, "adbPath") : "";
        var runtimeSerial = runtime.ValueKind == JsonValueKind.Object ? JsonString(runtime, "serial") : "";

        return new RhodesAdbApiDetectionResult(
            selectedAdbPath,
            runtimeAdbPath,
            runtimeSerial,
            ExtractAdbCandidates(root),
            ExtractDevices(root),
            "");
    }

    public static async Task<RhodesAdbApiTestResult> TestAsync(
        string baseUrl,
        RhodesAdbApiSettings settings,
        bool capture = true,
        TimeSpan? timeout = null,
        HttpClient? client = null,
        CancellationToken cancellationToken = default)
    {
        var ownsClient = client is null;
        client ??= new HttpClient { Timeout = timeout ?? TimeSpan.FromSeconds(30) };
        try
        {
            var response = await client.PostAsJsonAsync(
                $"{NormalizeBaseUrl(baseUrl)}/api/adb/test",
                new
                {
                    capture,
                    settings = new
                    {
                        autoDetect = settings.AutoDetect,
                        connectionPreset = settings.ConnectionPreset,
                        adbPath = settings.AdbPath,
                        serial = settings.Serial,
                    },
                },
                cancellationToken);
            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                return new RhodesAdbApiTestResult(false, "", "", 0, 0, 0, "", "", $"{(int)response.StatusCode} {Shorten(json, 180)}");

            return ExtractTestResult(json);
        }
        catch (Exception ex)
        {
            return new RhodesAdbApiTestResult(false, "", "", 0, 0, 0, "", "", Shorten(ex.Message, 180));
        }
        finally
        {
            if (ownsClient)
                client.Dispose();
        }
    }

    public static RhodesAdbApiTestResult ExtractTestResult(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
            return new RhodesAdbApiTestResult(false, "", "", 0, 0, 0, "", "", "ADBテスト応答がobjectではありません。");

        var runtime = root.TryGetProperty("runtime", out var runtimeElement) && runtimeElement.ValueKind == JsonValueKind.Object
            ? runtimeElement
            : default;
        var resolution = root.TryGetProperty("resolution", out var resolutionElement) && resolutionElement.ValueKind == JsonValueKind.Object
            ? resolutionElement
            : default;
        var screenshot = root.TryGetProperty("screenshot", out var screenshotElement) && screenshotElement.ValueKind == JsonValueKind.Object
            ? screenshotElement
            : default;

        return new RhodesAdbApiTestResult(
            JsonBool(root, "ok"),
            runtime.ValueKind == JsonValueKind.Object ? JsonString(runtime, "adbPath") : "",
            runtime.ValueKind == JsonValueKind.Object ? JsonString(runtime, "serial") : "",
            resolution.ValueKind == JsonValueKind.Object ? JsonInt(resolution, "width") : 0,
            resolution.ValueKind == JsonValueKind.Object ? JsonInt(resolution, "height") : 0,
            screenshot.ValueKind == JsonValueKind.Object ? JsonLong(screenshot, "bytes") : 0,
            screenshot.ValueKind == JsonValueKind.Object ? JsonString(screenshot, "path") : "",
            screenshot.ValueKind == JsonValueKind.Object ? JsonString(screenshot, "capturedAt") : "",
            "");
    }

    private static IReadOnlyList<MaaAdbPathCandidatePreview> ExtractAdbCandidates(JsonElement root)
    {
        if (!root.TryGetProperty("adbCandidates", out var candidates) || candidates.ValueKind != JsonValueKind.Array)
            return [];

        var previews = new List<MaaAdbPathCandidatePreview>();
        foreach (var candidate in candidates.EnumerateArray())
        {
            previews.Add(new MaaAdbPathCandidatePreview(
                JsonString(candidate, "path"),
                JsonString(candidate, "source"),
                JsonString(candidate, "preset"),
                JsonBool(candidate, "exists"),
                JsonBool(candidate, "available"),
                JsonString(candidate, "error")));
        }
        return previews;
    }

    private static IReadOnlyList<MaaAdbDevicePreview> ExtractDevices(JsonElement root)
    {
        if (!root.TryGetProperty("devices", out var devices) || devices.ValueKind != JsonValueKind.Array)
            return [];

        var previews = new List<MaaAdbDevicePreview>();
        foreach (var device in devices.EnumerateArray())
        {
            var serial = JsonString(device, "serial");
            var state = JsonString(device, "state");
            if (string.IsNullOrWhiteSpace(serial) || string.IsNullOrWhiteSpace(state))
                continue;

            previews.Add(new MaaAdbDevicePreview(
                serial,
                state,
                JsonString(device, "detail")));
        }
        return previews;
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

    private static bool JsonBool(JsonElement root, string propertyName)
    {
        return root.ValueKind == JsonValueKind.Object
            && root.TryGetProperty(propertyName, out var value)
            && value.ValueKind == JsonValueKind.True;
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

    private static long JsonLong(JsonElement root, string propertyName)
    {
        return root.ValueKind == JsonValueKind.Object
            && root.TryGetProperty(propertyName, out var value)
            && value.ValueKind == JsonValueKind.Number
            && value.TryGetInt64(out var result)
            ? result
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
