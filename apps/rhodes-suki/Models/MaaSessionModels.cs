using MaaFramework.Binding;

namespace RhodesSuki.Models;

public sealed record MaaBaseResolution(int Width, int Height)
{
    public string AspectRatioLabel => $"{Width}x{Height} (16:9)";
}

public sealed record MaaSessionOptions(
    string ResourceRoot,
    string AgentBinaryRoot,
    string AdbPath,
    string AdbSerial,
    string AdbConfigJson,
    AdbInputMethods InputMethod,
    AdbScreencapMethods ScreencapMethod);

public sealed record MaaAdbPresetPreview(
    string Id,
    string Label,
    string Description,
    string AdbPath,
    string Serial)
{
    public string DisplayName => string.IsNullOrWhiteSpace(Serial) ? Label : $"{Label} ({Serial})";

    public string PathSummary => string.IsNullOrWhiteSpace(AdbPath) ? "adb" : AdbPath;
}

public sealed record MaaAdbDevicePreview(
    string Serial,
    string State,
    string Detail)
{
    public bool IsUsable => State.Equals("device", StringComparison.OrdinalIgnoreCase);

    public string DisplayName => string.IsNullOrWhiteSpace(Detail)
        ? $"{State} {Serial}"
        : $"{State} {Serial} {Detail}";
}

public sealed record RhodesSukiSettings(
    string AdbPath = "adb",
    string AdbSerial = "",
    string AdbConfigJson = "{}",
    string RhodesApiUrl = "http://127.0.0.1:5173",
    string SelectedAdbPresetId = "auto",
    string SelectedResourceProfileId = "runStatusFull");

public sealed record MaaSessionSnapshot(
    string State,
    string Detail,
    string ResourceRoot,
    string AgentBinaryRoot,
    bool ResourceRootExists,
    bool AgentBinaryRootExists,
    bool IsReady);

public sealed record MaaRoi(int X, int Y, int Width, int Height)
{
    public int[] ToArray() => [X, Y, Width, Height];
}

public sealed record MaaProbePayloadPreview(
    string Name,
    string Purpose,
    string Payload);

public sealed record MaaProbeResult(
    string Name,
    string Status,
    bool Succeeded,
    string Detail,
    string RecognitionDetailJson = "",
    string Algorithm = "",
    bool Hit = false);

public sealed record MaaCaptureResult(
    string Status,
    bool Succeeded,
    string Detail,
    byte[] EncodedImage);

public sealed record MaaResourceTaskPreview(
    string Entry,
    string Label,
    string Purpose,
    IReadOnlyList<string>? ProfileIds = null,
    string Source = "")
{
    public string ProfileSummary => ProfileIds is { Count: > 0 } ? $"profiles: {string.Join(", ", ProfileIds)}" : "profiles: manual";

    public string SourceSummary => string.IsNullOrWhiteSpace(Source) ? "source: manual" : $"source: {Source}";
}

public sealed record MaaResourceProfilePreview(
    string Id,
    string Label,
    int TaskCount)
{
    public string DisplayName => $"{Label} ({TaskCount})";

    public string ProfileSummary => Id == "all" ? "profiles: all" : $"profile: {Id}";

    public string SourceSummary => "source: data/recognition/maa-tasks.json";
}

public sealed record MaaTaskRunResult(
    string Entry,
    string Status,
    bool Succeeded,
    string Detail,
    string RecognitionDetailJson = "",
    string Algorithm = "",
    bool Hit = false);

public sealed record MaaTaskDetailSnapshot(
    string Summary,
    string RecognitionDetailJson,
    string Algorithm,
    bool Hit);

public sealed record MaaTaskDiagnosticsSnapshot(
    int Total,
    int Succeeded,
    int Hit,
    int Failed,
    int OcrCandidateCount,
    int TemplateCandidateCount,
    string Summary,
    IReadOnlyList<string> Lines)
{
    public static MaaTaskDiagnosticsSnapshot Empty { get; } = new(
        0,
        0,
        0,
        0,
        0,
        0,
        "MAA task未実行",
        ["MAA Resource taskを実行すると診断サマリを表示します。"]);
}

public sealed record MaaCandidatePreview(
    string Kind,
    string Label,
    string Value,
    string RawText,
    double? Confidence,
    string Field = "",
    string OperatorId = "",
    string RelicId = "",
    string CampaignId = "",
    string RecognitionKey = "");

public sealed record SukiCandidateApplySummary(
    int AppliedCount,
    int IgnoredCount,
    IReadOnlyList<string> AppliedFields)
{
    public static SukiCandidateApplySummary Empty { get; } = new(0, 0, []);
}
