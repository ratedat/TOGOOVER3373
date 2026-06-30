using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesMaaTaskDiagnostics
{
    public static MaaTaskDiagnosticsSnapshot Summarize(IEnumerable<MaaTaskRunResult> taskResults)
    {
        var results = taskResults.ToList();
        if (results.Count == 0)
            return MaaTaskDiagnosticsSnapshot.Empty;

        var candidates = RhodesMaaResultPreview.FromTaskResults(results).ToList();
        var ocrCandidates = candidates.Where(candidate => candidate.Kind.Equals("ocr", StringComparison.OrdinalIgnoreCase)).ToList();
        var templateCandidates = candidates.Where(candidate => candidate.Kind.Equals("template", StringComparison.OrdinalIgnoreCase)).ToList();
        var failed = results.Where(result => !result.Succeeded).ToList();
        var hit = results.Count(result => result.Hit);
        var succeeded = results.Count(result => result.Succeeded);
        var lines = new List<string>
        {
            $"task {results.Count} / success {succeeded} / hit {hit} / failed {failed.Count} / OCR {ocrCandidates.Count} / template {templateCandidates.Count}",
        };

        foreach (var result in failed.Take(5))
        {
            lines.Add($"失敗: {result.Entry} [{result.Status}] {Shorten(result.Detail, 96)}");
        }

        foreach (var candidate in ocrCandidates.Take(8))
        {
            lines.Add($"OCR: {candidate.Label} => {candidate.Value}{ScoreSuffix(candidate.Confidence)}");
        }

        foreach (var candidate in templateCandidates.Take(8))
        {
            lines.Add($"Template: {candidate.Label} => {candidate.Value}{ScoreSuffix(candidate.Confidence)}");
        }

        return new MaaTaskDiagnosticsSnapshot(
            results.Count,
            succeeded,
            hit,
            failed.Count,
            ocrCandidates.Count,
            templateCandidates.Count,
            lines[0],
            lines);
    }

    private static string ScoreSuffix(double? score)
    {
        return score.HasValue ? $" ({score.Value:0.###})" : "";
    }

    private static string Shorten(string value, int maxLength)
    {
        var text = string.IsNullOrWhiteSpace(value) ? "" : value.Trim().ReplaceLineEndings(" ");
        return text.Length <= maxLength ? text : $"{text[..maxLength]}...";
    }
}
