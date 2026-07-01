namespace RhodesSuki.Services;

public static class RhodesSukiDebugPaths
{
    public const string DebugLogDirectoryName = "RHODES OBS COMMANDER3373 Debug Logs";
    public const string RecognitionScansDirectoryName = "Recognition Scans";

    public static string DebugLogDirectory => Path.Combine(AppContext.BaseDirectory, DebugLogDirectoryName);

    public static string RecognitionScansDirectory => Path.Combine(DebugLogDirectory, RecognitionScansDirectoryName);
}
