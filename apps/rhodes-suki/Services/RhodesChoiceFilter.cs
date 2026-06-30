using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesChoiceFilter
{
    public static IReadOnlyList<SukiChoiceItem> Apply(
        IEnumerable<SukiChoiceItem> items,
        SukiChoiceFilterOptions options)
    {
        var query = Normalize(options.SearchText);
        var filtered = items.Where(item =>
        {
            if (!options.IncludeHidden && item.HiddenByDefault)
                return false;
            if (options.HideExcluded && item.IsExcluded)
                return false;
            if (options.SelectedOnly && !item.IsSelected)
                return false;
            if (!string.IsNullOrWhiteSpace(options.CampaignId) && item.CampaignId != options.CampaignId)
                return false;
            if (!IsAll(options.Category) && item.Category != options.Category)
                return false;
            if (!IsAll(options.OperatorClass) && item.OperatorClass != options.OperatorClass)
                return false;
            if (!IsAll(options.OperatorBranch) && item.OperatorBranch != options.OperatorBranch)
                return false;
            if (!IsAll(options.Rarity) && item.Rarity.ToString() != options.Rarity.TrimStart('★'))
                return false;
            return string.IsNullOrWhiteSpace(query) || Normalize(item.SearchText).Contains(query, StringComparison.Ordinal);
        });

        return (options.ShowSelectedFirst
                ? filtered.OrderByDescending(item => item.IsSelected).ThenBy(item => item.SortOrder).ThenBy(item => item.Name, StringComparer.Ordinal)
                : filtered.OrderBy(item => item.SortOrder).ThenBy(item => item.Name, StringComparer.Ordinal))
            .ToArray();
    }

    private static bool IsAll(string value)
    {
        return string.IsNullOrWhiteSpace(value) || value == "すべて" || value.Equals("all", StringComparison.OrdinalIgnoreCase);
    }

    private static string Normalize(string value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? ""
            : value.Trim().Replace(" ", "", StringComparison.Ordinal).Replace("　", "", StringComparison.Ordinal).ToUpperInvariant();
    }
}
