using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesMaaRoiSelectionMatcher
{
    public static MaaRoiPreviewRow? MatchForTaskResult(
        IEnumerable<MaaRoiPreviewRow> roiRows,
        MaaTaskRunResult? taskResult)
    {
        return string.IsNullOrWhiteSpace(taskResult?.Entry)
            ? null
            : MatchForEntry(roiRows, taskResult.Entry);
    }

    public static MaaRoiPreviewRow? MatchForLogRow(
        IEnumerable<MaaRoiPreviewRow> roiRows,
        RhodesRecognitionScanLogRow? logRow)
    {
        return string.IsNullOrWhiteSpace(logRow?.Entry)
            ? null
            : MatchForEntry(roiRows, logRow.Entry);
    }

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

    private static MaaRoiPreviewRow? MatchForEntry(
        IEnumerable<MaaRoiPreviewRow> roiRows,
        string entry)
    {
        var matches = roiRows
            .Where(roi => roi.Entry.Equals(entry, StringComparison.Ordinal))
            .ToArray();

        return matches.FirstOrDefault(roi => roi.Source.Equals("roi", StringComparison.Ordinal)
                || roi.Source.EndsWith(".roi", StringComparison.Ordinal))
            ?? matches.FirstOrDefault(roi => roi.Source.Equals("rect", StringComparison.Ordinal)
                || roi.Source.EndsWith(".rect", StringComparison.Ordinal))
            ?? matches.FirstOrDefault();
    }
}
