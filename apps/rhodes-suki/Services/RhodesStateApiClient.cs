using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public sealed record RhodesStateApiResult(
    string StateJson,
    string Error)
{
    public bool Succeeded => string.IsNullOrWhiteSpace(Error);
}

public sealed record RhodesCandidateStateApplyResult(
    string StateJson,
    SukiCandidateApplySummary Summary);

public static class RhodesStateApiClient
{
    public static async Task<RhodesStateApiResult> FetchAsync(
        string baseUrl,
        TimeSpan? timeout = null,
        HttpClient? client = null,
        CancellationToken cancellationToken = default)
    {
        var ownsClient = client is null;
        client ??= new HttpClient { Timeout = timeout ?? TimeSpan.FromSeconds(10) };
        try
        {
            var response = await client.GetAsync($"{baseUrl.TrimEnd('/')}/api/state", cancellationToken);
            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                return new RhodesStateApiResult("", $"{(int)response.StatusCode} {Shorten(json, 180)}");

            return new RhodesStateApiResult(json, "");
        }
        catch (Exception ex)
        {
            return new RhodesStateApiResult("", Shorten(ex.Message, 180));
        }
        finally
        {
            if (ownsClient)
                client.Dispose();
        }
    }

    public static async Task<RhodesStateApiResult> SaveAsync(
        string baseUrl,
        string stateJson,
        TimeSpan? timeout = null,
        HttpClient? client = null,
        CancellationToken cancellationToken = default)
    {
        var ownsClient = client is null;
        client ??= new HttpClient { Timeout = timeout ?? TimeSpan.FromSeconds(10) };
        try
        {
            using var content = new StringContent(stateJson, Encoding.UTF8, "application/json");
            var response = await client.PutAsync($"{baseUrl.TrimEnd('/')}/api/state", content, cancellationToken);
            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                return new RhodesStateApiResult("", $"{(int)response.StatusCode} {Shorten(json, 180)}");

            return new RhodesStateApiResult(json, "");
        }
        catch (Exception ex)
        {
            return new RhodesStateApiResult("", Shorten(ex.Message, 180));
        }
        finally
        {
            if (ownsClient)
                client.Dispose();
        }
    }

    public static string ApplyAdbSettingsToStateJson(string stateJson, RhodesAdbApiSettings settings)
    {
        var root = JsonNode.Parse(string.IsNullOrWhiteSpace(stateJson) ? "{}" : stateJson)?.AsObject() ?? [];
        var adb = root["adb"] as JsonObject;
        if (adb is null)
        {
            adb = [];
            root["adb"] = adb;
        }
        adb["autoDetect"] = settings.AutoDetect;
        adb["connectionPreset"] = string.IsNullOrWhiteSpace(settings.ConnectionPreset) ? "auto" : settings.ConnectionPreset;
        adb["adbPath"] = settings.AdbPath ?? "";
        adb["serial"] = settings.Serial ?? "";
        adb["restartServerOnFailure"] = true;
        adb["restartProcessOnFailure"] = true;
        adb["reconnectAttempts"] = 5;
        adb["reconnectDelayMs"] = 1000;
        root["updatedAt"] = DateTimeOffset.UtcNow.ToString("O");
        return root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    }

    public static string ApplyRunContextToStateJson(
        string stateJson,
        string campaignId,
        DateTimeOffset? now = null)
    {
        var root = JsonNode.Parse(string.IsNullOrWhiteSpace(stateJson) ? "{}" : stateJson)?.AsObject() ?? [];
        RhodesRunStateStore.ApplyRunContext(root, campaignId, now ?? DateTimeOffset.UtcNow);
        return root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    }

    public static string ApplyChoicesToStateJson(
        string stateJson,
        IEnumerable<SukiChoiceItem> operators,
        IEnumerable<SukiChoiceItem> relics,
        SukiChoicePersistenceOptions choiceOptions,
        DateTimeOffset? now = null)
    {
        var root = JsonNode.Parse(string.IsNullOrWhiteSpace(stateJson) ? "{}" : stateJson)?.AsObject() ?? [];
        RhodesRunStateStore.ApplyChoices(root, operators, relics, choiceOptions, now ?? DateTimeOffset.UtcNow);
        return root.ToJsonString();
    }

    public static RhodesCandidateStateApplyResult ApplyCandidatesToStateJson(
        string stateJson,
        IEnumerable<MaaCandidatePreview> candidates,
        DateTimeOffset? now = null)
    {
        var root = JsonNode.Parse(string.IsNullOrWhiteSpace(stateJson) ? "{}" : stateJson)?.AsObject() ?? [];
        var summary = RhodesRecognitionCandidateApplier.Apply(root, candidates, now ?? DateTimeOffset.UtcNow);
        return new RhodesCandidateStateApplyResult(root.ToJsonString(), summary);
    }

    public static string ApplySukiPreferencesToStateJson(
        string stateJson,
        SukiChoicePersistenceOptions choiceOptions,
        SukiOutputPreferences outputPreferences,
        string ocrEngine = "profile")
    {
        var root = JsonNode.Parse(string.IsNullOrWhiteSpace(stateJson) ? "{}" : stateJson)?.AsObject() ?? [];
        var preferences = root["preferences"] as JsonObject;
        if (preferences is null)
        {
            preferences = [];
            root["preferences"] = preferences;
        }

        preferences["ocrEngine"] = SukiOcrEngineCatalog.Normalize(ocrEngine);
        preferences["operatorShowSelectedFirst"] = choiceOptions.OperatorShowSelectedFirst;
        preferences["operatorHideExcluded"] = choiceOptions.OperatorHideExcluded;
        preferences["operatorSelectedOnly"] = choiceOptions.OperatorSelectedOnly;
        preferences["relicShowSelectedFirst"] = choiceOptions.RelicShowSelectedFirst;
        preferences["relicHideExcluded"] = choiceOptions.RelicHideExcluded;
        preferences["relicSelectedOnly"] = choiceOptions.RelicSelectedOnly;
        preferences["operatorGridColumns"] = Math.Clamp(choiceOptions.OperatorGridColumns, 1, 6);
        preferences["relicGridColumns"] = Math.Clamp(choiceOptions.RelicGridColumns, 1, 6);

        var scrollSpeed = Math.Clamp(outputPreferences.ScrollSpeed, 0, 30);
        foreach (var field in new[]
        {
            "compactRelicScrollSpeed",
            "verticalRelicScrollSpeed",
            "verticalOperatorScrollSpeed",
            "horizontalRelicScrollSpeed",
            "horizontalOperatorScrollSpeed",
        })
        {
            preferences[field] = scrollSpeed;
        }

        preferences["sukiOutputSeparateWindow"] = outputPreferences.SeparateWindow;
        preferences["sukiOutputTransparentBackground"] = outputPreferences.TransparentBackground;
        preferences["sukiOutputParts"] = ToOutputPartsJson(outputPreferences.Parts);

        var currentMode = JsonString(root, "mode");
        if (outputPreferences.TournamentMode)
            root["mode"] = "tournament";
        else if (string.Equals(currentMode, "tournament", StringComparison.OrdinalIgnoreCase))
            root["mode"] = "casual";

        root["updatedAt"] = DateTimeOffset.UtcNow.ToString("O");
        return root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    }

    private static string Shorten(string value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "";

        var text = value.Trim().ReplaceLineEndings(" ");
        return text.Length <= maxLength ? text : $"{text[..maxLength]}...";
    }

    private static JsonArray ToOutputPartsJson(IEnumerable<SukiOutputPartState> parts)
    {
        var array = new JsonArray();
        foreach (var part in parts)
        {
            if (string.IsNullOrWhiteSpace(part.Id))
                continue;

            array.Add(new JsonObject
            {
                ["id"] = part.Id,
                ["enabled"] = part.Enabled,
                ["scrollEnabled"] = part.ScrollEnabled,
                ["hideExcluded"] = part.HideExcluded,
                ["width"] = Math.Max(1, part.Width),
                ["height"] = Math.Max(1, part.Height),
            });
        }

        return array;
    }

    private static string JsonString(JsonObject parent, string propertyName)
    {
        return parent.TryGetPropertyValue(propertyName, out var node)
            && node is JsonValue value
            && value.TryGetValue<string>(out var text)
            ? text
            : "";
    }
}
