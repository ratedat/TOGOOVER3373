using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesAdbPresetCatalog
{
    public static IReadOnlyList<MaaAdbPresetPreview> DefaultPresets()
    {
        return
        [
            new MaaAdbPresetPreview(
                "auto",
                "自動 / PATH adb",
                "PATH上のadbを使います。serialは空欄のまま接続済み端末を使います。",
                "adb",
                ""),
            new MaaAdbPresetPreview(
                "mumu",
                "MuMu Player",
                "MuMu Player 12向けです。多重起動時はMuMu側のADBポートを確認してください。",
                FirstExistingOrFallback(MuMuAdbPathCandidates(), "adb"),
                "127.0.0.1:16384"),
            new MaaAdbPresetPreview(
                "google-play-games-dev",
                "Google Play Games 開発者",
                "Google Play Games開発者エミュレーター向けです。Hyper-VとGoogleログインが必要です。",
                FirstExistingOrFallback(GooglePlayGamesAdbPathCandidates(), "adb"),
                "127.0.0.1:6520"),
            new MaaAdbPresetPreview(
                "avd",
                "Android Studio AVD",
                "Android SDK platform-toolsのadbを優先します。",
                FirstExistingOrFallback(AndroidSdkAdbPathCandidates(), "adb"),
                "emulator-5554"),
            new MaaAdbPresetPreview(
                "custom",
                "手動",
                "ADBパスとserialを手動入力します。",
                "adb",
                ""),
        ];
    }

    private static IEnumerable<string> MuMuAdbPathCandidates()
    {
        foreach (var root in ProgramInstallRoots())
        {
            yield return Path.Combine(root, "Netease", "MuMu Player 12", "shell", "adb.exe");
            yield return Path.Combine(root, "Netease", "MuMu PlayerGlobal-12.0", "shell", "adb.exe");
            yield return Path.Combine(root, "MuMu Player 12", "shell", "adb.exe");
        }
    }

    private static IEnumerable<string> GooglePlayGamesAdbPathCandidates()
    {
        foreach (var root in ProgramInstallRoots())
        {
            yield return Path.Combine(root, "Google", "Play Games Developer Emulator", "current", "emulator", "adb.exe");
            yield return Path.Combine(root, "Google", "Play Games", "current", "emulator", "adb.exe");
        }

        foreach (var candidate in AndroidSdkAdbPathCandidates())
        {
            yield return candidate;
        }
    }

    private static IEnumerable<string> AndroidSdkAdbPathCandidates()
    {
        var androidHome = Environment.GetEnvironmentVariable("ANDROID_HOME");
        if (!string.IsNullOrWhiteSpace(androidHome))
            yield return Path.Combine(androidHome, "platform-tools", "adb.exe");

        var androidSdkRoot = Environment.GetEnvironmentVariable("ANDROID_SDK_ROOT");
        if (!string.IsNullOrWhiteSpace(androidSdkRoot))
            yield return Path.Combine(androidSdkRoot, "platform-tools", "adb.exe");

        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (!string.IsNullOrWhiteSpace(localAppData))
            yield return Path.Combine(localAppData, "Android", "Sdk", "platform-tools", "adb.exe");
    }

    private static IEnumerable<string> ProgramInstallRoots()
    {
        var roots = new List<string?>
        {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        };

        foreach (var driveRoot in FixedDriveRoots())
        {
            roots.Add(Path.Combine(driveRoot, "Program Files"));
            roots.Add(Path.Combine(driveRoot, "Program Files (x86)"));
        }

        return roots
            .Where(root => !string.IsNullOrWhiteSpace(root))
            .Select(root => root!)
            .Distinct(StringComparer.OrdinalIgnoreCase);
    }

    private static IEnumerable<string> FixedDriveRoots()
    {
        try
        {
            return DriveInfo.GetDrives()
                .Where(drive => drive.IsReady && drive.DriveType == DriveType.Fixed)
                .Select(drive => drive.RootDirectory.FullName)
                .ToArray();
        }
        catch
        {
            return [];
        }
    }

    private static string FirstExistingOrFallback(IEnumerable<string> candidates, string fallback)
    {
        foreach (var candidate in candidates.Where(path => !string.IsNullOrWhiteSpace(path)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (File.Exists(candidate))
                return candidate;
        }

        return fallback;
    }
}
