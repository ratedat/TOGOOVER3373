using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace RhodesSuki.Models;

public sealed record SukiCampaignPreview(
    string Id,
    int Number,
    string Title,
    string FullTitle,
    IReadOnlyList<SukiCampaignSpecialField> SpecialFields)
{
    public string DisplayName => $"IS#{Number} {Title}";
}

public sealed record SukiCampaignSpecialField(
    string Id,
    string Label,
    string Type,
    string EffectSlot,
    string UnitLabel);

public sealed record SukiWorkspaceNavItem(
    string Id,
    string Label,
    string Subtitle,
    string Description);

public sealed record SukiStatusChip(
    string Label,
    string Value,
    string Detail);

public sealed record SukiRunFieldPreview(
    string Label,
    string Value,
    string Source,
    string RecognitionTaskId,
    string Detail);

public sealed record SukiSpecialValuePreview(
    string Label,
    string Value,
    string Kind,
    string ProfileId,
    string Detail);

public sealed record SukiSpecialFieldState(
    string CampaignId,
    string FieldId,
    string Label,
    string Type,
    string Value,
    string Kind,
    string ProfileId,
    string Detail);

public sealed record SukiCampaignWorkspacePreview(
    string Id,
    string DisplayName,
    string Detail,
    bool IsCurrentRun,
    bool IsSelected)
{
    public string SelectedLabel => IsSelected ? "表示中" : "";

    public string CurrentRunLabel => IsCurrentRun ? "ラン元" : "";

    public string CurrentRunActionLabel => IsCurrentRun ? "現在ラン" : "現在ランに設定";

    public bool CanSetCurrentRun => !IsCurrentRun;
}

public sealed record SukiRuntimeCapabilityPreview(
    string Id,
    string Name,
    string Tag,
    string State,
    string Detail,
    string PrimaryAction,
    bool IsOptional)
{
    public string InstallLabel => IsOptional ? "任意DL" : "必須";
}

public sealed record SukiInspectorRow(
    string Label,
    string Value,
    string Detail);

public sealed class SukiOutputPartPreview : INotifyPropertyChanged
{
    private bool _enabled;
    private bool _scrollEnabled;
    private bool _hideExcluded;
    private int _width;
    private int _height;

    public SukiOutputPartPreview(
        string id,
        string label,
        string bindingPath,
        string detail,
        bool enabled,
        bool scrollEnabled,
        bool hideExcluded,
        int width,
        int height)
    {
        Id = id;
        Label = label;
        BindingPath = bindingPath;
        Detail = detail;
        _enabled = enabled;
        _scrollEnabled = scrollEnabled;
        _hideExcluded = hideExcluded;
        _width = width;
        _height = height;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string Id { get; }

    public string Label { get; }

    public string BindingPath { get; }

    public string Detail { get; }

    public bool Enabled
    {
        get => _enabled;
        set
        {
            if (_enabled == value)
                return;
            _enabled = value;
            OnPropertyChanged();
        }
    }

    public bool ScrollEnabled
    {
        get => _scrollEnabled;
        set
        {
            if (_scrollEnabled == value)
                return;
            _scrollEnabled = value;
            OnPropertyChanged();
        }
    }

    public bool HideExcluded
    {
        get => _hideExcluded;
        set
        {
            if (_hideExcluded == value)
                return;
            _hideExcluded = value;
            OnPropertyChanged();
        }
    }

    public int Width
    {
        get => _width;
        set
        {
            if (_width == value)
                return;
            _width = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(SizeLabel));
        }
    }

    public int Height
    {
        get => _height;
        set
        {
            if (_height == value)
                return;
            _height = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(SizeLabel));
        }
    }

    public string SizeLabel => $"{Width}x{Height}";

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
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
    bool RelicSelectedOnly,
    int OperatorGridColumns = 2,
    int RelicGridColumns = 2,
    string Squad = "",
    string SquadRandomEffect = "",
    string Difficulty = "",
    int Ingot = 0,
    int Idea = 0,
    IReadOnlyList<SukiSpecialFieldState>? SpecialFields = null,
    string OcrEngine = "profile");

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

public sealed record SukiChoiceRow(
    int Columns,
    IReadOnlyList<SukiChoiceItem> Items);

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
        string searchText = "",
        string imagePath = "")
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
        ImagePath = imagePath;
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

    public string ImagePath { get; }

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
