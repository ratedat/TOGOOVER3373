using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesMaaRoiPreviewProjector
{
    public static IReadOnlyList<MaaRoiPreviewRow> Project(
        IEnumerable<MaaRoiDetailRow> rows,
        MaaBaseResolution baseResolution,
        int imageWidth,
        int imageHeight)
    {
        var sourceWidth = imageWidth > 0 ? imageWidth : baseResolution.Width;
        var sourceHeight = imageHeight > 0 ? imageHeight : baseResolution.Height;
        var scaleX = baseResolution.Width / (double)sourceWidth;
        var scaleY = baseResolution.Height / (double)sourceHeight;
        var scaleLabel = sourceWidth == baseResolution.Width && sourceHeight == baseResolution.Height
            ? "1:1"
            : $"{sourceWidth}x{sourceHeight}->{baseResolution.Width}x{baseResolution.Height}";

        return rows
            .Select(row => new MaaRoiPreviewRow(
                row.Entry,
                row.Source,
                row.X * scaleX,
                row.Y * scaleY,
                row.Width * scaleX,
                row.Height * scaleY,
                row.Raw,
                scaleLabel))
            .ToArray();
    }
}
