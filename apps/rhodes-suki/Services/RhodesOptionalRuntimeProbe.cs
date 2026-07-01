using System.Text.Json;
using System.Text;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesOptionalRuntimeProbe
{
    private static readonly Uri GlmStatusPath = new("/api/ocr/glm/status", UriKind.Relative);
    private static readonly Uri GlmInstallPath = new("/api/ocr/glm/install", UriKind.Relative);
    private static readonly Uri GlmUninstallPath = new("/api/ocr/glm/uninstall", UriKind.Relative);
    private static readonly Uri OllamaStatusPath = new("/api/ocr/glm/ollama/status", UriKind.Relative);
    private static readonly Uri OllamaInstallPath = new("/api/ocr/glm/ollama/install", UriKind.Relative);
    private static readonly Uri OllamaStartPath = new("/api/ocr/glm/ollama/start", UriKind.Relative);
    private static readonly Uri OllamaUninstallPath = new("/api/ocr/glm/ollama/uninstall", UriKind.Relative);

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

    public static Task<SukiOptionalRuntimeActionResult> InstallGlmAsync(string apiUrl, HttpClient? client = null)
    {
        return PostRuntimeActionAsync(apiUrl, GlmInstallPath, "GLM-OCR", client);
    }

    public static Task<SukiOptionalRuntimeActionResult> UninstallGlmAsync(string apiUrl, HttpClient? client = null)
    {
        return PostRuntimeActionAsync(apiUrl, GlmUninstallPath, "GLM-OCR", client);
    }

    public static Task<SukiOptionalRuntimeActionResult> InstallOllamaAsync(string apiUrl, HttpClient? client = null)
    {
        return PostRuntimeActionAsync(apiUrl, OllamaInstallPath, "Ollama", client);
    }

    public static Task<SukiOptionalRuntimeActionResult> StartOllamaAsync(string apiUrl, HttpClient? client = null)
    {
        return PostRuntimeActionAsync(apiUrl, OllamaStartPath, "Ollama", client);
    }

    public static Task<SukiOptionalRuntimeActionResult> UninstallOllamaAsync(string apiUrl, HttpClient? client = null)
    {
        return PostRuntimeActionAsync(apiUrl, OllamaUninstallPath, "Ollama", client);
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

    private static async Task<SukiOptionalRuntimeActionResult> PostRuntimeActionAsync(
        string apiUrl,
        Uri path,
        string label,
        HttpClient? client = null)
    {
        var ownsClient = client is null;
        client ??= new HttpClient();
        try
        {
            client.BaseAddress = NormalizeBaseUri(apiUrl);
            using var content = new StringContent("", Encoding.UTF8, "application/json");
            var response = await client.PostAsync(path, content);
            var json = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                return new SukiOptionalRuntimeActionResult(
                    new SukiOptionalRuntimeStatus(label, "操作失敗", $"{(int)response.StatusCode} {Shorten(json, 180)}", false, false),
                    $"{(int)response.StatusCode} {Shorten(json, 180)}");
            }

            return new SukiOptionalRuntimeActionResult(ParseStatusJson(json, label), "");
        }
        catch (Exception ex)
        {
            return new SukiOptionalRuntimeActionResult(
                new SukiOptionalRuntimeStatus(label, "操作失敗", ex.Message, false, false),
                ex.Message);
        }
        finally
        {
            if (ownsClient)
                client.Dispose();
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

    private static string Shorten(string value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "";

        var text = value.Trim().ReplaceLineEndings(" ");
        return text.Length <= maxLength ? text : $"{text[..maxLength]}...";
    }
}
