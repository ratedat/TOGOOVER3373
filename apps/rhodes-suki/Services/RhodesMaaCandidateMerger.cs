using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesMaaCandidateMerger
{
    public static IReadOnlyList<MaaCandidatePreview> Merge(
        IEnumerable<MaaCandidatePreview> primaryCandidates,
        IEnumerable<MaaCandidatePreview> supplementalCandidates)
    {
        var merged = primaryCandidates.ToList();
        var hasPrimaryThought = merged.Any(candidate => IsKind(candidate, "thought"));

        foreach (var candidate in supplementalCandidates)
        {
            if (ShouldAdd(merged, candidate, hasPrimaryThought))
                merged.Add(candidate);
        }

        return merged;
    }

    private static bool ShouldAdd(
        IReadOnlyList<MaaCandidatePreview> existing,
        MaaCandidatePreview candidate,
        bool hasPrimaryThought)
    {
        if (IsKind(candidate, "thought"))
            return !hasPrimaryThought;

        if (IsKind(candidate, "age"))
            return !existing.Any(item => IsKind(item, "age"));

        if (IsKind(candidate, "runStatus"))
        {
            var field = CandidateId(candidate.Field, candidate.Value);
            return !string.IsNullOrWhiteSpace(field)
                && !existing.Any(item => IsKind(item, "runStatus")
                    && CandidateId(item.Field, item.Value).Equals(field, StringComparison.Ordinal));
        }

        if (IsKind(candidate, "operator"))
        {
            var id = CandidateId(candidate.OperatorId, candidate.Value);
            return !string.IsNullOrWhiteSpace(id)
                && !existing.Any(item => IsKind(item, "operator")
                    && CandidateId(item.OperatorId, item.Value).Equals(id, StringComparison.Ordinal));
        }

        if (IsKind(candidate, "relic"))
        {
            var id = CandidateId(candidate.RelicId, candidate.Value);
            return !string.IsNullOrWhiteSpace(id)
                && !existing.Any(item => IsKind(item, "relic")
                    && CandidateId(item.RelicId, item.Value).Equals(id, StringComparison.Ordinal));
        }

        if (!string.IsNullOrWhiteSpace(candidate.RecognitionKey))
        {
            return !existing.Any(item => item.RecognitionKey.Equals(candidate.RecognitionKey, StringComparison.Ordinal));
        }

        return false;
    }

    private static bool IsKind(MaaCandidatePreview candidate, string kind)
    {
        return candidate.Kind.Equals(kind, StringComparison.OrdinalIgnoreCase);
    }

    private static string CandidateId(string primary, string fallback)
    {
        return string.IsNullOrWhiteSpace(primary) ? fallback.Trim() : primary.Trim();
    }
}
