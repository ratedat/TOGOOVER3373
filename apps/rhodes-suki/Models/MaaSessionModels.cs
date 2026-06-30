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
    string Purpose);

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
