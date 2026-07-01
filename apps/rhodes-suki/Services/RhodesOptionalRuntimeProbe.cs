using System.Text.Json;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesOptionalRuntimeProbe
{
    private static readonly Uri GlmStatusPath = new("/api/ocr/glm/status", UriKind.Relative);
    private static readonly Uri OllamaStatusPath = new("/api/ocr/glm/ollama/status", UriKind.Relative);

    public static async Task<SukiOptionalRuntimeProbeSnapshot> ProbeAsync(string apiUrl, HttpClient? client = null)
    {
        var ownsClient = client is null;
        client ??= new HttpClient();
        try
        {
            client.BaseAddress = NormalizeBaseUri(apiUrl);
            var glm = await ProbeEndpointAsync(client, GlmStatusPath, "GLM-OCR");
            var ollama = await ProbeEndpointAsync(client, OllamaStatusPath, "Ollama");
            return new SukiOptionalRuntimeProbeSnapshot(glm, ollama);
        }
        finally
        {
            if (ownsClient)
                client.Dispose();
        }
    }

    public static SukiOptionalRuntimeStatus ParseStatusJson(string json, string label)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var installed = JsonBool(root, "installed");
        var installing = JsonBool(root, "installing");
        var status = JsonString(root, "status");
        var rootPath = FirstNonEmpty(JsonString(root, "installRoot"), JsonString(root, "root"));
        var detail = string.IsNullOrWhiteSpace(rootPath) ? status : $"{status} / {rootPath}";
        var state = installing
            ? "導入中"
            : installed
                ? "導入済み"
                : "未導入";
        return new SukiOptionalRuntimeStatus(label, state, detail, installed, installing);
    }

    private static async Task<SukiOptionalRuntimeStatus> ProbeEndpointAsync(HttpClient client, Uri path, string label)
    {
        try
        {
            var json = await client.GetStringAsync(path);
            return ParseStatusJson(json, label);
        }
        catch (Exception ex)
        {
            return new SukiOptionalRuntimeStatus(label, "確認失敗", ex.Message, false, false);
        }
    }

    private static Uri NormalizeBaseUri(string apiUrl)
    {
        var value = string.IsNullOrWhiteSpace(apiUrl) ? "http://127.0.0.1:5173" : apiUrl.TrimEnd('/');
        return Uri.TryCreate($"{value}/", UriKind.Absolute, out var uri)
            ? uri
            : new Uri("http://127.0.0.1:5173/");
    }

    private static string JsonString(JsonElement root, string propertyName)
    {
        return root.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? ""
            : "";
    }

    private static bool JsonBool(JsonElement root, string propertyName)
    {
        return root.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.True;
    }

    private static string FirstNonEmpty(params string[] values)
    {
        return values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? "";
    }
}
