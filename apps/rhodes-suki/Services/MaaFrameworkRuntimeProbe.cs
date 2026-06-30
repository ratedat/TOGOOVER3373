using MaaFramework.Binding;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public sealed class MaaFrameworkRuntimeProbe
{
    public IntegrationStatus Probe()
    {
        try
        {
            var bindingAssembly = typeof(MaaToolkit).Assembly.GetName();
            var version = bindingAssembly.Version?.ToString() ?? "unknown";
            return new IntegrationStatus(
                "MAAFramework",
                "参照済み",
                $"Maa.Framework binding assembly {bindingAssembly.Name} {version}. 1280x720 is 16:9.",
                true);
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
}
