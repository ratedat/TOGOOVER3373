using MaaFramework.Binding;
using RhodesSuki.Models;
using System.Runtime.InteropServices;

namespace RhodesSuki.Services;

public sealed class MaaFrameworkRuntimeProbe
{
    public IntegrationStatus Probe()
    {
        try
        {
            var bindingAssembly = typeof(MaaToolkit).Assembly.GetName();
            var facts = new MaaFrameworkRuntimeProbeFacts(
                bindingAssembly.Name ?? "MaaFramework.Binding",
                bindingAssembly.Version?.ToString() ?? "unknown",
                CurrentRuntimeIdentifier(),
                NativeRuntimeDirectory(AppContext.BaseDirectory),
                MissingNativeFiles(AppContext.BaseDirectory),
                OperatingSystem.IsWindows(),
                OperatingSystem.IsWindows()
                    ? MissingVisualCppRuntimeFiles(AppContext.BaseDirectory, NativeRuntimeDirectory(AppContext.BaseDirectory))
                    : []);
            return BuildStatus(facts);
        }
        catch (DllNotFoundException ex)
        {
            return new IntegrationStatus(
                "MAAFramework",
                "ネイティブ未読込",
                $"MAAFramework native DLL の読込に失敗しました。Visual C++ 2015-2022 Redistributable x64 と runtimes 配下のDLL配置を確認してください: {ex.Message}",
                false);
        }
        catch (BadImageFormatException ex)
        {
            return new IntegrationStatus(
                "MAAFramework",
                "アーキ不一致",
                $"MAAFramework native DLL と実行ファイルのCPUアーキテクチャが一致していません: {ex.Message}",
                false);
        }
        catch (Exception ex)
        {
            return new IntegrationStatus(
                "MAAFramework",
                "未初期化",
                ex.Message,
                false);
        }
    }

    public static IntegrationStatus BuildStatus(MaaFrameworkRuntimeProbeFacts facts)
    {
        if (facts.MissingNativeFiles.Count > 0)
        {
            return new IntegrationStatus(
                "MAAFramework",
                "ネイティブ未配置",
                $"runtime={facts.RuntimeIdentifier}; missing={string.Join(", ", facts.MissingNativeFiles)}; path={facts.NativeRuntimeDirectory}",
                false);
        }

        if (facts.VisualCppRuntimeCheckRequired && facts.MissingVisualCppRuntimeFiles.Count > 0)
        {
            return new IntegrationStatus(
                "MAAFramework",
                "VC++不足",
                $"Microsoft Visual C++ 2015-2022 Redistributable x64 が不足している可能性があります。missing={string.Join(", ", facts.MissingVisualCppRuntimeFiles)}",
                false);
        }

        var vcDetail = facts.VisualCppRuntimeCheckRequired ? "VC++ runtime OK" : "native runtime OK";
        return new IntegrationStatus(
            "MAAFramework",
            "参照済み",
            $"{facts.BindingAssemblyName} {facts.BindingAssemblyVersion}; runtime={facts.RuntimeIdentifier}; {vcDetail}; 1280x720 is 16:9.",
            true);
    }

    private static string CurrentRuntimeIdentifier()
    {
        var os = OperatingSystem.IsWindows()
            ? "win"
            : OperatingSystem.IsMacOS()
                ? "osx"
                : "linux";
        var arch = RuntimeInformation.ProcessArchitecture switch
        {
            Architecture.X64 => "x64",
            Architecture.Arm64 => "arm64",
            Architecture.X86 => "x86",
            Architecture.Arm => "arm",
            _ => RuntimeInformation.ProcessArchitecture.ToString().ToLowerInvariant(),
        };
        return $"{os}-{arch}";
    }

    private static string NativeRuntimeDirectory(string appBaseDirectory)
    {
        return Path.Combine(appBaseDirectory, "runtimes", CurrentRuntimeIdentifier(), "native");
    }

    private static IReadOnlyList<string> MissingNativeFiles(string appBaseDirectory)
    {
        var nativeDirectory = NativeRuntimeDirectory(appBaseDirectory);
        return RequiredNativeFiles()
            .Where(file => !File.Exists(Path.Combine(nativeDirectory, file)))
            .ToArray();
    }

    private static IReadOnlyList<string> RequiredNativeFiles()
    {
        if (OperatingSystem.IsWindows())
        {
            return
            [
                "MaaFramework.dll",
                "MaaToolkit.dll",
                "MaaUtils.dll",
                "MaaAdbControlUnit.dll",
                "fastdeploy_ppocr_maa.dll",
                "onnxruntime_maa.dll",
                "opencv_world4_maa.dll",
            ];
        }

        if (OperatingSystem.IsMacOS())
        {
            return
            [
                "libMaaFramework.dylib",
                "libMaaToolkit.dylib",
                "libMaaUtils.dylib",
                "libMaaAdbControlUnit.dylib",
            ];
        }

        return
        [
            "libMaaFramework.so",
            "libMaaToolkit.so",
            "libMaaUtils.so",
            "libMaaAdbControlUnit.so",
        ];
    }

    private static IReadOnlyList<string> MissingVisualCppRuntimeFiles(string appBaseDirectory, string nativeRuntimeDirectory)
    {
        var searchDirectories = new[]
        {
            appBaseDirectory,
            nativeRuntimeDirectory,
            Environment.SystemDirectory,
        }.Where(path => !string.IsNullOrWhiteSpace(path)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

        return RequiredVisualCppRuntimeFiles()
            .Where(file => !searchDirectories.Any(directory => File.Exists(Path.Combine(directory, file))))
            .ToArray();
    }

    private static IReadOnlyList<string> RequiredVisualCppRuntimeFiles()
    {
        return
        [
            "vcruntime140.dll",
            "vcruntime140_1.dll",
            "msvcp140.dll",
        ];
    }
}
