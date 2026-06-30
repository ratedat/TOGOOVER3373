using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace RhodesSuki.Models;

public sealed record SukiCampaignPreview(
    string Id,
    int Number,
    string Title,
    string FullTitle)
{
    public string DisplayName => $"IS#{Number} {Title}";
}

public sealed record SukiRunStateSnapshot(
    string CampaignId,
    IReadOnlySet<string> SelectedOperatorIds,
    IReadOnlySet<string> SelectedRelicIds,
    IReadOnlySet<string> ExcludedOperatorIds,
    IReadOnlySet<string> ExcludedRelicIds,
    bool OperatorShowSelectedFirst,
    bool OperatorHideExcluded,
    bool OperatorSelectedOnly,
    bool RelicShowSelectedFirst,
    bool RelicHideExcluded,
    bool RelicSelectedOnly);

public sealed record RhodesRunCatalogSnapshot(
    IReadOnlyList<SukiCampaignPreview> Campaigns,
    IReadOnlyList<SukiChoiceItem> Operators,
    IReadOnlyList<SukiChoiceItem> Relics,
    SukiRunStateSnapshot Current);

public sealed record SukiChoiceFilterOptions(
    string SearchText = "",
    string Category = "",
    string OperatorClass = "",
    string OperatorBranch = "",
    string Rarity = "",
    string CampaignId = "",
    bool ShowSelectedFirst = false,
    bool HideExcluded = false,
    bool SelectedOnly = false,
    bool IncludeHidden = false);

public sealed class SukiChoiceItem : INotifyPropertyChanged
{
    private bool _isSelected;
    private bool _isExcluded;

    public SukiChoiceItem(
        string kind,
        string id,
        string name,
        string heading,
        string operatorClass,
        string operatorBranch,
        string campaignId,
        string category,
        int rarity,
        int sortOrder,
        bool hiddenByDefault,
        string detail = "",
        string searchText = "")
    {
        Kind = kind;
        Id = id;
        Name = name;
        Heading = heading;
        OperatorClass = operatorClass;
        OperatorBranch = operatorBranch;
        CampaignId = campaignId;
        Category = category;
        Rarity = rarity;
        SortOrder = sortOrder;
        HiddenByDefault = hiddenByDefault;
        Detail = detail;
        SearchText = string.IsNullOrWhiteSpace(searchText)
            ? $"{id} {name} {heading} {operatorClass} {operatorBranch} {campaignId} {category} {detail}"
            : searchText;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string Kind { get; }

    public string Id { get; }

    public string Name { get; }

    public string Heading { get; }

    public string Detail { get; }

    public string OperatorClass { get; }

    public string OperatorBranch { get; }

    public string CampaignId { get; }

    public string Category { get; }

    public int Rarity { get; }

    public int SortOrder { get; }

    public bool HiddenByDefault { get; }

    public string SearchText { get; }

    public bool IsSelected
    {
        get => _isSelected;
        set
        {
            if (_isSelected == value)
                return;
            _isSelected = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(SelectionButtonLabel));
            OnPropertyChanged(nameof(StateLabel));
        }
    }

    public bool IsExcluded
    {
        get => _isExcluded;
        set
        {
            if (_isExcluded == value)
                return;
            _isExcluded = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(ExclusionButtonLabel));
            OnPropertyChanged(nameof(StateLabel));
        }
    }

    public string SelectionButtonLabel => IsSelected ? "選択解除" : "選択";

    public string ExclusionButtonLabel => IsExcluded ? "除外解除" : "表示除外";

    public string StateLabel
    {
        get
        {
            if (IsSelected && IsExcluded)
                return "選択 / 除外";
            if (IsSelected)
                return "選択中";
            if (IsExcluded)
                return "除外";
            if (HiddenByDefault)
                return "未実装";
            return "";
        }
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}
