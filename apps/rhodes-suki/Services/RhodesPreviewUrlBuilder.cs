namespace RhodesSuki.Services;

public static class RhodesPreviewUrlBuilder
{
    public static string Build(string baseUrl, string path)
    {
        var root = string.IsNullOrWhiteSpace(baseUrl) ? "http://127.0.0.1:5173" : baseUrl.Trim();
        var normalizedPath = string.IsNullOrWhiteSpace(path) ? "/control-v2" : path.Trim();
        if (!normalizedPath.StartsWith('/'))
            normalizedPath = $"/{normalizedPath}";

        return $"{root.TrimEnd('/')}{normalizedPath}";
    }
}
