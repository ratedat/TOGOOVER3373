using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesMaaRoiSelectionMatcher
{
    public static MaaRoiPreviewRow? MatchForOcrDetail(
        IEnumerable<MaaRoiPreviewRow> roiRows,
        MaaOcrDetailRow? ocrRow)
    {
        if (ocrRow is null)
            return null;

        return roiRows.FirstOrDefault(roi =>
            roi.Entry.Equals(ocrRow.Entry, StringComparison.Ordinal)
            && (roi.Source.Equals(ocrRow.Source, StringComparison.Ordinal)
                || roi.Source.StartsWith($"{ocrRow.Source}.", StringComparison.Ordinal)));
    }
}
