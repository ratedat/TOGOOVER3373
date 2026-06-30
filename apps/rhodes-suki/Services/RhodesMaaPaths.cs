using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesMaaPaths
{
    public static MaaBaseResolution BaseResolution { get; } = new(1280, 720);

    public static string AppBaseDirectory => AppContext.BaseDirectory;

    public static string DefaultResourceRoot => Path.Combine(AppBaseDirectory, "resource", "base");

    public static string DefaultAgentBinaryRoot
    {
        get
        {
            var libsPath = Path.Combine(AppBaseDirectory, "libs", "MaaAgentBinary");
            if (Directory.Exists(libsPath)) return libsPath;
            return Path.Combine(AppBaseDirectory, "MaaAgentBinary");
        }
    }
}
