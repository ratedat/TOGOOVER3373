using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Windows.Input;
using Avalonia.Media.Imaging;
using RhodesSuki.Models;
using RhodesSuki.Services;

namespace RhodesSuki.ViewModels;

public sealed class MainWindowViewModel : INotifyPropertyChanged, IDisposable
{
    private readonly RhodesMaaSession _session;
    private readonly IReadOnlyList<MaaResourceTaskPreview> _allResourceTasks;
    private readonly IReadOnlyList<SukiChoiceItem> _allOperators;
    private readonly IReadOnlyList<SukiChoiceItem> _allRelics;
    private readonly SukiRunStateSnapshot _runState;
    private byte[] _lastCapture = [];
    private string _adbPath = "adb";
    private string _adbSerial = "";
    private string _adbConfigJson = "{}";
    private string _workspaceTab = "run";
    private string _choiceTab = "operators";
    private string _operatorSearch = "";
    private string _operatorRarityFilter = "すべて";
    private string _operatorClassFilter = "すべて";
    private string _operatorBranchFilter = "すべて";
    private string _relicSearch = "";
    private string _relicCategoryFilter = "すべて";
    private string _sessionState;
    private string _sessionDetail;
    private string _captureState = "未取得";
    private string _lastCapturePath = "";
    private string _rhodesApiUrl = "http://127.0.0.1:5173";
    private string _statusMessage = "MAAFramework の検証準備ができています。";
    private Bitmap? _lastCaptureImage;
    private MaaAdbPresetPreview? _selectedAdbPreset;
    private MaaResourceProfilePreview? _selectedResourceProfile;
    private SukiCampaignPreview? _selectedCampaign;
    private MaaTaskDiagnosticsSnapshot _resourceTaskDiagnostics = MaaTaskDiagnosticsSnapshot.Empty;
    private bool _operatorShowSelectedFirst;
    private bool _operatorHideExcluded;
    private bool _operatorSelectedOnly;
    private bool _relicShowSelectedFirst;
    private bool _relicHideExcluded;
    private bool _relicSelectedOnly;
    private bool _outputSeparateWindow = true;
    private bool _outputTournamentMode;
    private bool _outputTransparentBackground = true;
    private int _outputScrollSpeed = 40;
    private bool _isBusy;

    public MainWindowViewModel(
        IntegrationStatus maaStatus,
        RhodesMaaSession session,
        MaaSessionSnapshot sessionSnapshot)
    {
        _session = session;
        _sessionState = sessionSnapshot.State;
        _sessionDetail = sessionSnapshot.Detail;

        RuntimeStatuses =
        [
            maaStatus,
            new IntegrationStatus("MAA Resource", SessionState, SessionDetail, sessionSnapshot.IsReady),
            new IntegrationStatus("MAA-OCR", "移行対象", "MAAFramework Resource/Tasker 経由へ統合予定", false),
            new IntegrationStatus("GLM-OCR", "任意導入", "高精度検証用の別ランタイムとして維持", false),
        ];

        MigrationSteps =
        [
            "MAAFramework Resource/Controller/Tasker の最小起動を通す",
            "ADB接続とスクリーンショット取得をMAAFrameworkへ移管",
            "基本情報・オペレーター・秘宝OCRをMAAタスク化",
            "GLM-OCRを任意DLの高精度補助として接続",
            "Electron/Tauri版の機能をSukiUI版へ順次移植",
        ];

        var runCatalog = RhodesRunCatalog.LoadDefault();
        _runState = runCatalog.Current;
        WorkspaceNav =
        [
            new SukiWorkspaceNavItem("run", "ラン", "RUN", "基本値とIS固有値"),
            new SukiWorkspaceNavItem("choices", "選択", "CHOICES", "オペレーターと秘宝"),
            new SukiWorkspaceNavItem("recognition", "認識", "RECOGNITION", "OCR/テンプレート候補"),
            new SukiWorkspaceNavItem("output", "出力", "OUTPUT", "OBS表示構成"),
            new SukiWorkspaceNavItem("runtime", "ランタイム", "RUNTIME", "ADB/MAA/GLM/Ollama"),
            new SukiWorkspaceNavItem("debug", "デバッグ", "DEBUG", "ログと検証情報"),
        ];
        HeaderStatusChips = new ObservableCollection<SukiStatusChip>(BuildHeaderStatusChips());
        RunFieldPreviews = new ObservableCollection<SukiRunFieldPreview>(BuildRunFieldPreviews(runCatalog.Current));
        CampaignPreviews = [];
        SpecialValuePreviews = [];
        RuntimeCapabilities = new ObservableCollection<SukiRuntimeCapabilityPreview>(BuildRuntimeCapabilities());
        InspectorRows = [];
        OutputParts =
        [
            new SukiOutputPartPreview("operators", "招集オペレーター", "choices.operators", "選択中オペレーターをOBSへ表示", true, false, true, 420, 132),
            new SukiOutputPartPreview("relics", "秘宝一覧", "choices.relics", "所持秘宝と表示除外を反映", true, true, true, 420, 170),
            new SukiOutputPartPreview("run", "ラン基本値", "run.status", "希望、源石錐、シールド、指揮Lvなど", true, false, false, 260, 116),
            new SukiOutputPartPreview("special", "IS固有値", "run.special", "思案、啓示、灯火などキャンペーン別の値", true, true, false, 300, 126),
            new SukiOutputPartPreview("recognition", "認識ステータス", "recognition.status", "デバッグ配布時のみ候補/信頼度を表示", false, true, false, 360, 92),
        ];
        foreach (var outputPart in OutputParts)
        {
            outputPart.PropertyChanged += (_, _) => RefreshInspectorRows();
        }
        DebugLogLines =
        [
            "Suki shell ready.",
            "Debug logs: RHODES OBS COMMANDER3373 Debug Logs",
            "ADB capture and MAA task results are saved beside the packaged executable.",
        ];
        ProbePayloads = new ObservableCollection<MaaProbePayloadPreview>(Services.RhodesRecognitionProbe.DefaultPayloads());
        ProbeResults = [];
        AdbPresets = new ObservableCollection<MaaAdbPresetPreview>(RhodesAdbPresetCatalog.DefaultPresets());
        AdbDevices = [];
        SelectedAdbPreset = AdbPresets.FirstOrDefault(preset => preset.Id == "auto") ?? AdbPresets.FirstOrDefault();
        Campaigns = new ObservableCollection<SukiCampaignPreview>(runCatalog.Campaigns);
        _allOperators = runCatalog.Operators;
        _allRelics = runCatalog.Relics;
        FilteredOperators = [];
        FilteredRelics = [];
        OperatorRarityOptions = [];
        OperatorClassOptions = [];
        OperatorBranchOptions = [];
        RelicCategoryOptions = [];
        _operatorShowSelectedFirst = runCatalog.Current.OperatorShowSelectedFirst;
        _operatorHideExcluded = runCatalog.Current.OperatorHideExcluded;
        _operatorSelectedOnly = runCatalog.Current.OperatorSelectedOnly;
        _relicShowSelectedFirst = runCatalog.Current.RelicShowSelectedFirst;
        _relicHideExcluded = runCatalog.Current.RelicHideExcluded;
        _relicSelectedOnly = runCatalog.Current.RelicSelectedOnly;
        _selectedCampaign = Campaigns.FirstOrDefault(campaign => campaign.Id == runCatalog.Current.CampaignId) ?? Campaigns.FirstOrDefault();
        _allResourceTasks = RhodesMaaResourceCatalog.DefaultTasks();
        ResourceProfiles = new ObservableCollection<MaaResourceProfilePreview>(RhodesMaaResourceCatalog.ProfileGroups(_allResourceTasks));
        ResourceTasks = [];
        ResourceTaskResults = [];
        CandidateResults = [];
        BaseResolution = Services.RhodesMaaPaths.BaseResolution;
        ResourceRoot = sessionSnapshot.ResourceRoot;
        AgentBinaryRoot = sessionSnapshot.AgentBinaryRoot;

        ConnectCommand = new AsyncRelayCommand(ConnectAsync);
        SaveSettingsCommand = new AsyncRelayCommand(SaveSettingsAsync);
        ApplyAdbPresetCommand = new AsyncRelayCommand(parameter => ApplyAdbPresetAsync(parameter as MaaAdbPresetPreview));
        RefreshAdbDevicesCommand = new AsyncRelayCommand(RefreshAdbDevicesAsync);
        ApplyAdbDeviceCommand = new AsyncRelayCommand(parameter => ApplyAdbDeviceAsync(parameter as MaaAdbDevicePreview));
        CaptureCommand = new AsyncRelayCommand(CaptureAsync);
        RunAllProbesCommand = new AsyncRelayCommand(RunAllProbesAsync);
        RunSelectedProfileRecognitionCommand = new AsyncRelayCommand(RunSelectedProfileRecognitionAsync);
        RunAllResourceTasksCommand = new AsyncRelayCommand(RunAllResourceTasksAsync);
        ExportResourceTaskResultsCommand = new AsyncRelayCommand(ExportResourceTaskResultsAsync);
        ConvertResourceTaskResultsCommand = new AsyncRelayCommand(ConvertResourceTaskResultsAsync);
        RunProbeCommand = new AsyncRelayCommand(parameter => RunProbeAsync(parameter as MaaProbePayloadPreview));
        RunResourceTaskCommand = new AsyncRelayCommand(parameter => RunResourceTaskAsync(parameter as MaaResourceTaskPreview));
        SetWorkspaceCommand = new AsyncRelayCommand(SetWorkspaceAsync);
        SetChoiceTabCommand = new AsyncRelayCommand(SetChoiceTabAsync);
        ToggleChoiceSelectedCommand = new AsyncRelayCommand(ToggleChoiceSelectedAsync);
        ToggleChoiceExcludedCommand = new AsyncRelayCommand(ToggleChoiceExcludedAsync);
        ClearVisibleChoicesCommand = new AsyncRelayCommand(ClearVisibleChoicesAsync);
        SelectedResourceProfile = ResourceProfiles.FirstOrDefault(profile => profile.Id == "runStatusFull") ?? ResourceProfiles.FirstOrDefault();
        RefreshOperatorFilterOptions();
        RefreshRelicFilterOptions();
        RefreshChoiceLists();
        RefreshCampaignPreviews();
        RefreshSpecialValuePreviews();
        RefreshInspectorRows();
        LoadSettings();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string Title { get; } = "RHODES OBS COMMANDER3373";

    public string Subtitle { get; } = "MAAFramework family desktop shell";

    public ObservableCollection<SukiWorkspaceNavItem> WorkspaceNav { get; }

    public ObservableCollection<SukiStatusChip> HeaderStatusChips { get; }

    public ObservableCollection<SukiRunFieldPreview> RunFieldPreviews { get; }

    public ObservableCollection<SukiCampaignWorkspacePreview> CampaignPreviews { get; }

    public ObservableCollection<SukiSpecialValuePreview> SpecialValuePreviews { get; }

    public ObservableCollection<SukiRuntimeCapabilityPreview> RuntimeCapabilities { get; }

    public ObservableCollection<SukiInspectorRow> InspectorRows { get; }

    public ObservableCollection<SukiOutputPartPreview> OutputParts { get; }

    public ObservableCollection<string> DebugLogLines { get; }

    public ObservableCollection<IntegrationStatus> RuntimeStatuses { get; }

    public ObservableCollection<string> MigrationSteps { get; }

    public ObservableCollection<MaaProbePayloadPreview> ProbePayloads { get; }

    public ObservableCollection<MaaProbeResult> ProbeResults { get; }

    public ObservableCollection<MaaAdbPresetPreview> AdbPresets { get; }

    public ObservableCollection<MaaAdbDevicePreview> AdbDevices { get; }

    public ObservableCollection<SukiCampaignPreview> Campaigns { get; }

    public ObservableCollection<SukiChoiceItem> FilteredOperators { get; }

    public ObservableCollection<SukiChoiceItem> FilteredRelics { get; }

    public ObservableCollection<string> OperatorRarityOptions { get; }

    public ObservableCollection<string> OperatorClassOptions { get; }

    public ObservableCollection<string> OperatorBranchOptions { get; }

    public ObservableCollection<string> RelicCategoryOptions { get; }

    public ObservableCollection<MaaResourceProfilePreview> ResourceProfiles { get; }

    public ObservableCollection<MaaResourceTaskPreview> ResourceTasks { get; }

    public ObservableCollection<MaaTaskRunResult> ResourceTaskResults { get; }

    public ObservableCollection<MaaCandidatePreview> CandidateResults { get; }

    public MaaTaskDiagnosticsSnapshot ResourceTaskDiagnostics
    {
        get => _resourceTaskDiagnostics;
        private set
        {
            if (!SetProperty(ref _resourceTaskDiagnostics, value))
                return;
            RefreshInspectorRows();
        }
    }

    public MaaBaseResolution BaseResolution { get; }

    public string ResourceRoot { get; }

    public string AgentBinaryRoot { get; }

    public string AdbPath
    {
        get => _adbPath;
        set
        {
            if (!SetProperty(ref _adbPath, value))
                return;
            OnPropertyChanged(nameof(AdbHeaderDetail));
            RefreshInspectorRows();
        }
    }

    public string AdbSerial
    {
        get => _adbSerial;
        set
        {
            if (!SetProperty(ref _adbSerial, value))
                return;
            OnPropertyChanged(nameof(AdbHeaderTitle));
            OnPropertyChanged(nameof(AdbHeaderDetail));
            RefreshInspectorRows();
        }
    }

    public string AdbConfigJson
    {
        get => _adbConfigJson;
        set => SetProperty(ref _adbConfigJson, string.IsNullOrWhiteSpace(value) ? "{}" : value);
    }

    public string WorkspaceTab
    {
        get => _workspaceTab;
        private set
        {
            if (!SetProperty(ref _workspaceTab, value))
                return;
            OnPropertyChanged(nameof(IsRunWorkspaceVisible));
            OnPropertyChanged(nameof(IsChoicesWorkspaceVisible));
            OnPropertyChanged(nameof(IsRecognitionWorkspaceVisible));
            OnPropertyChanged(nameof(IsOutputWorkspaceVisible));
            OnPropertyChanged(nameof(IsRuntimeWorkspaceVisible));
            OnPropertyChanged(nameof(IsDebugWorkspaceVisible));
            OnPropertyChanged(nameof(WorkspaceTitle));
            RefreshInspectorRows();
        }
    }

    public SukiCampaignPreview? SelectedCampaign
    {
        get => _selectedCampaign;
        set
        {
            if (!SetProperty(ref _selectedCampaign, value))
                return;
            RefreshRelicFilterOptions();
            RefreshChoiceLists();
            RefreshCampaignPreviews();
            RefreshSpecialValuePreviews();
            RefreshInspectorRows();
            OnPropertyChanged(nameof(RunContextSummary));
            OnPropertyChanged(nameof(CampaignHeaderTitle));
            OnPropertyChanged(nameof(CampaignHeaderDetail));
        }
    }

    public bool IsRunWorkspaceVisible => WorkspaceTab == "run";

    public bool IsChoicesWorkspaceVisible => WorkspaceTab == "choices";

    public bool IsRecognitionWorkspaceVisible => WorkspaceTab == "recognition";

    public bool IsOutputWorkspaceVisible => WorkspaceTab == "output";

    public bool IsRuntimeWorkspaceVisible => WorkspaceTab == "runtime";

    public bool IsDebugWorkspaceVisible => WorkspaceTab == "debug";

    public string WorkspaceTitle => WorkspaceTab switch
    {
        "choices" => "選択カタログ",
        "recognition" => "認識ワークフロー",
        "output" => "出力 / OBS",
        "runtime" => "ランタイム",
        "debug" => "デバッグ",
        _ => "ラン基本値",
    };

    public string ChoiceTab
    {
        get => _choiceTab;
        private set
        {
            if (!SetProperty(ref _choiceTab, value))
                return;
            OnPropertyChanged(nameof(IsOperatorsPanelVisible));
            OnPropertyChanged(nameof(IsRelicsPanelVisible));
            OnPropertyChanged(nameof(IsRecognitionPanelVisible));
            OnPropertyChanged(nameof(ChoicePanelTitle));
        }
    }

    public bool IsOperatorsPanelVisible => ChoiceTab == "operators";

    public bool IsRelicsPanelVisible => ChoiceTab == "relics";

    public bool IsRecognitionPanelVisible => ChoiceTab == "recognition";

    public string ChoicePanelTitle => ChoiceTab switch
    {
        "relics" => "秘宝",
        "recognition" => "認識タスク",
        _ => "オペレーター",
    };

    public string CampaignHeaderTitle => SelectedCampaign?.DisplayName ?? "IS未選択";

    public string CampaignHeaderDetail
    {
        get
        {
            var selectedOperators = _allOperators.Count(item => item.IsSelected);
            var selectedRelics = _allRelics.Count(item => item.CampaignId == SelectedCampaign?.Id && item.IsSelected);
            var isCurrentRunCampaign = string.Equals(SelectedCampaign?.Id, _runState.CampaignId, StringComparison.Ordinal);
            var squad = isCurrentRunCampaign && !string.IsNullOrWhiteSpace(_runState.Squad) ? _runState.Squad : "分隊未選択";
            var difficulty = isCurrentRunCampaign && !string.IsNullOrWhiteSpace(_runState.Difficulty) ? _runState.Difficulty : "等級未選択";
            return $"{squad} · 招集{selectedOperators}名 · 秘宝{selectedRelics}件 · {difficulty}";
        }
    }

    public string AdbHeaderTitle => string.IsNullOrWhiteSpace(AdbSerial) ? "ADB未選択" : AdbSerial;

    public string AdbHeaderDetail
    {
        get
        {
            var preset = SelectedAdbPreset?.Label ?? "手動";
            return $"{preset} · MAAFramework · {BaseResolution.AspectRatioLabel}";
        }
    }

    public string RunContextSummary
    {
        get
        {
            var selectedOperators = _allOperators.Count(item => item.IsSelected);
            var selectedRelics = _allRelics.Count(item => item.CampaignId == SelectedCampaign?.Id && item.IsSelected);
            return $"{SelectedCampaign?.DisplayName ?? "IS未選択"} / 招集{selectedOperators}名 / 秘宝{selectedRelics}件";
        }
    }

    public string OperatorListSummary => $"{FilteredOperators.Count}件 / 招集{_allOperators.Count(item => item.IsSelected)}名";

    public string RelicListSummary
    {
        get
        {
            var selected = _allRelics.Count(item => item.CampaignId == SelectedCampaign?.Id && item.IsSelected);
            var total = _allRelics.Count(item => item.CampaignId == SelectedCampaign?.Id);
            return $"{FilteredRelics.Count}件 / 所持{selected}件 / IS内{total}件";
        }
    }

    public string OperatorSearch
    {
        get => _operatorSearch;
        set
        {
            if (!SetProperty(ref _operatorSearch, value ?? ""))
                return;
            RefreshOperatorChoices();
        }
    }

    public string OperatorRarityFilter
    {
        get => _operatorRarityFilter;
        set
        {
            if (!SetProperty(ref _operatorRarityFilter, string.IsNullOrWhiteSpace(value) ? "すべて" : value))
                return;
            RefreshOperatorFilterOptions();
            RefreshOperatorChoices();
        }
    }

    public string OperatorClassFilter
    {
        get => _operatorClassFilter;
        set
        {
            if (!SetProperty(ref _operatorClassFilter, string.IsNullOrWhiteSpace(value) ? "すべて" : value))
                return;
            RefreshOperatorFilterOptions();
            RefreshOperatorChoices();
        }
    }

    public string OperatorBranchFilter
    {
        get => _operatorBranchFilter;
        set
        {
            if (!SetProperty(ref _operatorBranchFilter, string.IsNullOrWhiteSpace(value) ? "すべて" : value))
                return;
            RefreshOperatorChoices();
        }
    }

    public bool OperatorShowSelectedFirst
    {
        get => _operatorShowSelectedFirst;
        set
        {
            if (!SetProperty(ref _operatorShowSelectedFirst, value))
                return;
            RefreshOperatorChoices();
        }
    }

    public bool OperatorHideExcluded
    {
        get => _operatorHideExcluded;
        set
        {
            if (!SetProperty(ref _operatorHideExcluded, value))
                return;
            RefreshOperatorChoices();
        }
    }

    public bool OperatorSelectedOnly
    {
        get => _operatorSelectedOnly;
        set
        {
            if (!SetProperty(ref _operatorSelectedOnly, value))
                return;
            RefreshOperatorChoices();
        }
    }

    public string RelicSearch
    {
        get => _relicSearch;
        set
        {
            if (!SetProperty(ref _relicSearch, value ?? ""))
                return;
            RefreshRelicChoices();
        }
    }

    public string RelicCategoryFilter
    {
        get => _relicCategoryFilter;
        set
        {
            if (!SetProperty(ref _relicCategoryFilter, string.IsNullOrWhiteSpace(value) ? "すべて" : value))
                return;
            RefreshRelicChoices();
        }
    }

    public bool RelicShowSelectedFirst
    {
        get => _relicShowSelectedFirst;
        set
        {
            if (!SetProperty(ref _relicShowSelectedFirst, value))
                return;
            RefreshRelicChoices();
        }
    }

    public bool RelicHideExcluded
    {
        get => _relicHideExcluded;
        set
        {
            if (!SetProperty(ref _relicHideExcluded, value))
                return;
            RefreshRelicChoices();
        }
    }

    public bool RelicSelectedOnly
    {
        get => _relicSelectedOnly;
        set
        {
            if (!SetProperty(ref _relicSelectedOnly, value))
                return;
            RefreshRelicChoices();
        }
    }

    public bool OutputSeparateWindow
    {
        get => _outputSeparateWindow;
        set
        {
            if (!SetProperty(ref _outputSeparateWindow, value))
                return;
            RefreshInspectorRows();
        }
    }

    public bool OutputTournamentMode
    {
        get => _outputTournamentMode;
        set
        {
            if (!SetProperty(ref _outputTournamentMode, value))
                return;
            RefreshInspectorRows();
        }
    }

    public bool OutputTransparentBackground
    {
        get => _outputTransparentBackground;
        set
        {
            if (!SetProperty(ref _outputTransparentBackground, value))
                return;
            RefreshInspectorRows();
        }
    }

    public int OutputScrollSpeed
    {
        get => _outputScrollSpeed;
        set
        {
            if (!SetProperty(ref _outputScrollSpeed, Math.Clamp(value, 0, 160)))
                return;
            RefreshInspectorRows();
        }
    }

    public string SessionState
    {
        get => _sessionState;
        private set
        {
            if (!SetProperty(ref _sessionState, value))
                return;
            RefreshRuntimeCapabilities();
            RefreshInspectorRows();
        }
    }

    public string SessionDetail
    {
        get => _sessionDetail;
        private set
        {
            if (!SetProperty(ref _sessionDetail, value))
                return;
            RefreshRuntimeCapabilities();
            RefreshInspectorRows();
        }
    }

    public string CaptureState
    {
        get => _captureState;
        private set
        {
            if (!SetProperty(ref _captureState, value))
                return;
            RefreshInspectorRows();
        }
    }

    public string LastCapturePath
    {
        get => _lastCapturePath;
        private set
        {
            if (!SetProperty(ref _lastCapturePath, value))
                return;
            RefreshInspectorRows();
        }
    }

    public Bitmap? LastCaptureImage
    {
        get => _lastCaptureImage;
        private set => SetCaptureImage(value);
    }

    public string RhodesApiUrl
    {
        get => _rhodesApiUrl;
        set
        {
            if (!SetProperty(ref _rhodesApiUrl, string.IsNullOrWhiteSpace(value) ? "http://127.0.0.1:5173" : value.TrimEnd('/')))
                return;
            RefreshInspectorRows();
        }
    }

    public string StatusMessage
    {
        get => _statusMessage;
        private set => SetProperty(ref _statusMessage, value);
    }

    public MaaAdbPresetPreview? SelectedAdbPreset
    {
        get => _selectedAdbPreset;
        set
        {
            if (!SetProperty(ref _selectedAdbPreset, value))
                return;
            OnPropertyChanged(nameof(AdbHeaderDetail));
            RefreshRuntimeCapabilities();
            RefreshInspectorRows();
        }
    }

    public MaaResourceProfilePreview? SelectedResourceProfile
    {
        get => _selectedResourceProfile;
        set
        {
            if (!SetProperty(ref _selectedResourceProfile, value))
                return;
            RefreshResourceTasks();
            RefreshInspectorRows();
        }
    }

    public bool IsBusy
    {
        get => _isBusy;
        private set => SetProperty(ref _isBusy, value);
    }

    public ICommand ConnectCommand { get; }

    public ICommand SaveSettingsCommand { get; }

    public ICommand ApplyAdbPresetCommand { get; }

    public ICommand RefreshAdbDevicesCommand { get; }

    public ICommand ApplyAdbDeviceCommand { get; }

    public ICommand CaptureCommand { get; }

    public ICommand RunAllProbesCommand { get; }

    public ICommand RunSelectedProfileRecognitionCommand { get; }

    public ICommand RunAllResourceTasksCommand { get; }

    public ICommand ExportResourceTaskResultsCommand { get; }

    public ICommand ConvertResourceTaskResultsCommand { get; }

    public ICommand RunProbeCommand { get; }

    public ICommand RunResourceTaskCommand { get; }

    public ICommand SetWorkspaceCommand { get; }

    public ICommand SetChoiceTabCommand { get; }

    public ICommand ToggleChoiceSelectedCommand { get; }

    public ICommand ToggleChoiceExcludedCommand { get; }

    public ICommand ClearVisibleChoicesCommand { get; }

    public void Dispose()
    {
        _lastCaptureImage?.Dispose();
        _session.Dispose();
    }

    private IEnumerable<SukiStatusChip> BuildHeaderStatusChips()
    {
        var maxHope = _runState.MaxHope is null ? "-" : _runState.MaxHope.Value.ToString();
        yield return new SukiStatusChip("希望", $"{_runState.Hope}/{maxHope}", "run.hope");
        yield return new SukiStatusChip("源石錐", _runState.Ingot.ToString(), "run.ingot");
        yield return new SukiStatusChip("想念", _runState.Idea.ToString(), "is5.idea");
        yield return new SukiStatusChip("シールド", _runState.Shield.ToString(), "run.shield");
        yield return new SukiStatusChip("耐久", _runState.LifePoints.ToString(), "run.hp");
        yield return new SukiStatusChip("指揮", $"Lv{_runState.CommandLevel}", "run.commandLevel");
        yield return new SukiStatusChip("等級", string.IsNullOrWhiteSpace(_runState.Difficulty) ? "-" : _runState.Difficulty, "run.difficulty");
        yield return new SukiStatusChip("分隊", string.IsNullOrWhiteSpace(_runState.Squad) ? "-" : _runState.Squad, "run.squad");
    }

    private static IEnumerable<SukiRunFieldPreview> BuildRunFieldPreviews(SukiRunStateSnapshot state)
    {
        var maxHope = state.MaxHope is null ? "-" : state.MaxHope.Value.ToString();
        yield return new SukiRunFieldPreview("希望", $"{state.Hope}/{maxHope}", "OCR / MAAFramework", "run.hope.current + run.hope.max", "現在値と上限値を分離して読む");
        yield return new SukiRunFieldPreview("源石錐", state.Ingot.ToString(), "OCR / Template anchor", "run.ingot", "右上の源石錐アイコンを基準に取得");
        yield return new SukiRunFieldPreview("想念", state.Idea.ToString(), "Template / OCR", "run.idea.current", "IS#5では想念アイコン直下の数値");
        yield return new SukiRunFieldPreview("シールド", state.Shield.ToString(), "Template / OCR", "run.shield", "耐久値右側の盾アイコン基準");
        yield return new SukiRunFieldPreview("耐久", state.LifePoints.ToString(), "OCR / Manual review", "run.life", "左上の耐久値");
        yield return new SukiRunFieldPreview("指揮Lv", $"Lv{state.CommandLevel}", "OCR", "run.command_level", "指揮Lvパネル");
        yield return new SukiRunFieldPreview("等級", string.IsNullOrWhiteSpace(state.Difficulty) ? "-" : state.Difficulty, "Manual / squad panel", "run.difficulty_grade", "閉じたマップ上のバッジではなく分隊情報から確定");
        yield return new SukiRunFieldPreview("分隊", string.IsNullOrWhiteSpace(state.Squad) ? "-" : state.Squad, "Manual / OCR", "run.squad_name", "分隊カードまたは情報パネル");
    }

    private IEnumerable<SukiRuntimeCapabilityPreview> BuildRuntimeCapabilities()
    {
        yield return new SukiRuntimeCapabilityPreview(
            "adb",
            "ADB",
            "CORE",
            string.IsNullOrWhiteSpace(AdbSerial) ? "未選択" : "選択済み",
            $"{SelectedAdbPreset?.Label ?? "自動"} / {AdbHeaderTitle}",
            "端末一覧",
            false);
        yield return new SukiRuntimeCapabilityPreview(
            "maa",
            "MAAFramework",
            "CORE",
            SessionState,
            SessionDetail,
            "接続",
            false);
        yield return new SukiRuntimeCapabilityPreview(
            "maa-ocr",
            "MAA-OCR",
            "OCR",
            "移行対象",
            "MAA Resource/Tasker 経由の標準OCR",
            "認識",
            false);
        yield return new SukiRuntimeCapabilityPreview(
            "glm",
            "GLM-OCR",
            "OPTIONAL",
            "任意導入",
            "高精度検証用。一般配布では任意DLで扱う",
            "状態確認",
            true);
        yield return new SukiRuntimeCapabilityPreview(
            "ollama",
            "Ollama",
            "OPTIONAL",
            "任意導入",
            "GLM-OCRローカル実行の補助ランタイム",
            "状態確認",
            true);
        yield return new SukiRuntimeCapabilityPreview(
            "hyperv",
            "Hyper-V",
            "PLATFORM",
            "確認対象",
            "Google Play Gamesや一部エミュレーターの前提確認",
            "診断",
            false);
    }

    private void RefreshRuntimeCapabilities()
    {
        ReplaceCollection(RuntimeCapabilities, BuildRuntimeCapabilities());
    }

    private void RefreshCampaignPreviews()
    {
        ReplaceCollection(
            CampaignPreviews,
            Campaigns.Select(campaign =>
            {
                var relicCount = _allRelics.Count(item => item.CampaignId == campaign.Id);
                var selectedRelics = _allRelics.Count(item => item.CampaignId == campaign.Id && item.IsSelected);
                return new SukiCampaignWorkspacePreview(
                    campaign.Id,
                    campaign.DisplayName,
                    $"{campaign.FullTitle} / 秘宝{selectedRelics}/{relicCount}",
                    string.Equals(campaign.Id, _runState.CampaignId, StringComparison.Ordinal),
                    string.Equals(campaign.Id, SelectedCampaign?.Id, StringComparison.Ordinal));
            }));
    }

    private void RefreshSpecialValuePreviews()
    {
        ReplaceCollection(SpecialValuePreviews, BuildSpecialValuePreviews());
    }

    private IEnumerable<SukiSpecialValuePreview> BuildSpecialValuePreviews()
    {
        var campaignId = SelectedCampaign?.Id ?? _runState.CampaignId;
        if (campaignId == "is5_sarkaz")
        {
            yield return new SukiSpecialValuePreview("想念", _runState.Idea.ToString(), "数値", "run.idea.current", "想念アイコン直下の値。重複する思案とは別管理");
            yield return new SukiSpecialValuePreview("思案", "0件", "個数入力", "is5ThoughtFull", "同一思案の重複所持を許可");
            yield return new SukiSpecialValuePreview("時代", "未選択", "候補選択", "is5AgeFull", "時代スキャン結果をレビューして確定");
            yield return new SukiSpecialValuePreview("思考負荷", "未入力", "補助値", "run.thought_burden", "必要な画面のみで扱い、思考不可は保存対象外");
            yield break;
        }

        if (campaignId == "is3_mizuki")
        {
            yield return new SukiSpecialValuePreview("啓示", "0件", "複数選択", "is3RevelationFull", "啓示候補を重複なしで管理");
            yield return new SukiSpecialValuePreview("拒絶反応", "未選択", "単一選択", "is3RejectionReaction", "現在反応をラン状態へ反映");
            yield break;
        }

        if (campaignId == "is4_sami")
        {
            yield return new SukiSpecialValuePreview("啓示", "0件", "複数選択", "is4RevelationFull", "啓示板と手動入力を統合");
            yield return new SukiSpecialValuePreview("崩壊値", "未入力", "数値", "is4CollapseValue", "OCRまたは手入力で管理");
            yield return new SukiSpecialValuePreview("失いしパラダイム", "未選択", "状態", "is4ParadigmLost", "状態付き特殊値として扱う");
            yield break;
        }

        if (campaignId == "is6_sui")
        {
            yield return new SukiSpecialValuePreview("歳時貨幣", "0件", "複数選択", "is6CoinFull", "表裏や状態差分を別スロットで保持");
            yield return new SukiSpecialValuePreview("時刻", "未入力", "状態", "is6SeasonalHours", "季節時刻を個別状態で管理");
            yield break;
        }

        yield return new SukiSpecialValuePreview("固有値", "未定義", "キャンペーン", "campaign.special", "このISの固有値定義を追加してください");
    }

    private void RefreshInspectorRows()
    {
        ReplaceCollection(InspectorRows, BuildInspectorRows());
    }

    private IEnumerable<SukiInspectorRow> BuildInspectorRows()
    {
        yield return new SukiInspectorRow("ワークスペース", WorkspaceTitle, WorkspaceTab);
        yield return new SukiInspectorRow("IS", CampaignHeaderTitle, CampaignHeaderDetail);

        if (WorkspaceTab == "run")
        {
            yield return new SukiInspectorRow("基本値", $"{RunFieldPreviews.Count}項目", "runStatusFull");
            yield return new SukiInspectorRow("固有値", $"{SpecialValuePreviews.Count}項目", SelectedCampaign?.Id ?? "");
            yield break;
        }

        if (WorkspaceTab == "choices")
        {
            yield return new SukiInspectorRow("オペレーター", OperatorListSummary, "選択 / 除外 / 優先表示");
            yield return new SukiInspectorRow("秘宝", RelicListSummary, "IS別秘宝カタログ");
            yield break;
        }

        if (WorkspaceTab == "recognition")
        {
            yield return new SukiInspectorRow("認識プロファイル", SelectedResourceProfile?.DisplayName ?? "-", SelectedResourceProfile?.ProfileSummary ?? "");
            yield return new SukiInspectorRow("候補", $"{CandidateResults.Count}件", ResourceTaskDiagnostics.Summary);
            yield break;
        }

        if (WorkspaceTab == "output")
        {
            var visible = OutputParts.Count(part => part.Enabled);
            yield return new SukiInspectorRow("表示部品", $"{visible}/{OutputParts.Count}", $"scroll {OutputScrollSpeed}px/s");
            yield return new SukiInspectorRow("別ウィンドウ", OutputSeparateWindow ? "ON" : "OFF", "OBSサイドカー");
            yield return new SukiInspectorRow("大会向け", OutputTournamentMode ? "ON" : "OFF", "表示情報を絞る");
            yield break;
        }

        if (WorkspaceTab == "runtime")
        {
            yield return new SukiInspectorRow("ADB", AdbHeaderTitle, AdbHeaderDetail);
            yield return new SukiInspectorRow("端末", $"{AdbDevices.Count}件", SessionState);
            yield break;
        }

        yield return new SukiInspectorRow("ログ", LastCapturePath, CaptureState);
        yield return new SukiInspectorRow("API", RhodesApiUrl, "候補化API");
    }

    private async Task ConnectAsync()
    {
        await RunBusyAsync(async () =>
        {
            StatusMessage = "MAA Controller に接続しています。";
            var snapshot = await _session.InitializeAdbAsync(BuildSessionOptions());
            SessionState = snapshot.State;
            SessionDetail = snapshot.Detail;
            StatusMessage = snapshot.IsReady ? "接続しました。" : "接続できませんでした。設定を確認してください。";
        });
    }

    private void LoadSettings()
    {
        var settings = RhodesSukiSettingsStore.Load();
        AdbPath = string.IsNullOrWhiteSpace(settings.AdbPath) ? "adb" : settings.AdbPath;
        AdbSerial = settings.AdbSerial;
        AdbConfigJson = string.IsNullOrWhiteSpace(settings.AdbConfigJson) ? "{}" : settings.AdbConfigJson;
        RhodesApiUrl = string.IsNullOrWhiteSpace(settings.RhodesApiUrl) ? "http://127.0.0.1:5173" : settings.RhodesApiUrl;
        SelectedAdbPreset = AdbPresets.FirstOrDefault(preset => preset.Id == settings.SelectedAdbPresetId) ?? SelectedAdbPreset;
        SelectedResourceProfile = ResourceProfiles.FirstOrDefault(profile => profile.Id == settings.SelectedResourceProfileId) ?? SelectedResourceProfile;
    }

    private async Task SaveSettingsAsync()
    {
        await RunBusyAsync(async () =>
        {
            await RhodesSukiSettingsStore.SaveAsync(new RhodesSukiSettings(
                AdbPath,
                AdbSerial,
                AdbConfigJson,
                RhodesApiUrl,
                SelectedAdbPreset?.Id ?? "auto",
                SelectedResourceProfile?.Id ?? "runStatusFull"));
            StatusMessage = $"Suki設定を保存しました: {RhodesSukiSettingsStore.DefaultPath}";
        });
    }

    private Task SetWorkspaceAsync(object? parameter)
    {
        var tab = parameter as string;
        WorkspaceTab = tab is "run" or "choices" or "recognition" or "output" or "runtime" or "debug"
            ? tab
            : "run";
        StatusMessage = $"{WorkspaceTitle}を表示しています。";
        return Task.CompletedTask;
    }

    private Task SetChoiceTabAsync(object? parameter)
    {
        var tab = parameter as string;
        ChoiceTab = tab is "operators" or "relics" or "recognition" ? tab : "operators";
        WorkspaceTab = ChoiceTab == "recognition" ? "recognition" : "choices";
        StatusMessage = $"{ChoicePanelTitle}を表示しています。";
        return Task.CompletedTask;
    }

    private Task ToggleChoiceSelectedAsync(object? parameter)
    {
        if (parameter is not SukiChoiceItem item)
            return Task.CompletedTask;

        item.IsSelected = !item.IsSelected;
        if (item.IsSelected)
            item.IsExcluded = false;
        RefreshChoiceLists();
        StatusMessage = $"{item.Name}: {(item.IsSelected ? "選択しました。" : "選択を解除しました。")}";
        return Task.CompletedTask;
    }

    private Task ToggleChoiceExcludedAsync(object? parameter)
    {
        if (parameter is not SukiChoiceItem item)
            return Task.CompletedTask;

        item.IsExcluded = !item.IsExcluded;
        if (item.IsExcluded)
            item.IsSelected = false;
        RefreshChoiceLists();
        StatusMessage = $"{item.Name}: {(item.IsExcluded ? "表示除外にしました。" : "表示除外を解除しました。")}";
        return Task.CompletedTask;
    }

    private Task ClearVisibleChoicesAsync()
    {
        if (ChoiceTab == "recognition")
        {
            StatusMessage = "認識タスクには手動選択がありません。";
            return Task.CompletedTask;
        }

        var target = ChoiceTab == "relics" ? FilteredRelics : FilteredOperators;
        foreach (var item in target)
        {
            item.IsSelected = false;
        }

        RefreshChoiceLists();
        StatusMessage = $"{ChoicePanelTitle}の表示中選択を解除しました。";
        return Task.CompletedTask;
    }

    private Task ApplyAdbPresetAsync(MaaAdbPresetPreview? preset)
    {
        if (preset is null)
        {
            StatusMessage = "ADBプリセットが選択されていません。";
            return Task.CompletedTask;
        }

        if (!string.IsNullOrWhiteSpace(preset.AdbPath))
            AdbPath = preset.AdbPath;

        AdbSerial = preset.Serial;
        RefreshRuntimeCapabilities();
        RefreshInspectorRows();
        StatusMessage = $"ADBプリセットを適用しました: {preset.DisplayName}";
        return Task.CompletedTask;
    }

    private async Task RefreshAdbDevicesAsync()
    {
        await RunBusyAsync(async () =>
        {
            AdbDevices.Clear();
            var devices = await RhodesAdbDeviceProbe.ListDevicesAsync(AdbPath);
            foreach (var device in devices)
            {
                AdbDevices.Add(device);
            }

            StatusMessage = devices.Count == 0
                ? "ADB端末は見つかりませんでした。エミュレーター側のADB設定を確認してください。"
                : $"ADB端末を取得しました: {devices.Count}件";
            RefreshRuntimeCapabilities();
            RefreshInspectorRows();
        });
    }

    private Task ApplyAdbDeviceAsync(MaaAdbDevicePreview? device)
    {
        if (device is null)
        {
            StatusMessage = "ADB端末が選択されていません。";
            return Task.CompletedTask;
        }

        AdbSerial = device.Serial;
        RefreshRuntimeCapabilities();
        RefreshInspectorRows();
        StatusMessage = $"ADB serialを適用しました: {device.Serial}";
        return Task.CompletedTask;
    }

    private async Task CaptureAsync()
    {
        await RunBusyAsync(async () =>
        {
            var capture = await CaptureCoreAsync();
            if (capture?.Succeeded == true)
            {
                StatusMessage = "スクリーンショットを取得しました。";
            }
        });
    }

    private async Task RunAllProbesAsync()
    {
        await RunBusyAsync(async () =>
        {
            if (!await EnsureCaptureAsync())
                return;

            ProbeResults.Clear();
            foreach (var payload in ProbePayloads)
            {
                await RunProbeCoreAsync(payload);
            }
            RefreshInspectorRows();
        });
    }

    private async Task RunAllResourceTasksAsync()
    {
        await RunBusyAsync(RunAllResourceTasksCoreAsync);
    }

    private async Task ExportResourceTaskResultsAsync()
    {
        await RunBusyAsync(async () =>
        {
            var path = await SaveResourceTaskResultsAsync(ResourceTaskResults, SelectedResourceProfile?.Id);
            StatusMessage = $"MAA task結果を保存しました: {path}";
        });
    }

    private async Task ConvertResourceTaskResultsAsync()
    {
        await RunBusyAsync(ConvertResourceTaskResultsCoreAsync);
    }

    private async Task RunSelectedProfileRecognitionAsync()
    {
        await RunBusyAsync(async () =>
        {
            StatusMessage = "選択プロファイルの認識を開始します。";
            var capture = await CaptureCoreAsync();
            if (capture?.Succeeded != true)
                return;

            await RunAllResourceTasksCoreAsync();
            await ConvertResourceTaskResultsCoreAsync();
        });
    }

    private async Task RunAllResourceTasksCoreAsync()
    {
        ResourceTaskResults.Clear();
        CandidateResults.Clear();
        RefreshResourceTaskDiagnostics();
        RefreshInspectorRows();
        if (!ResourceTasks.Any())
        {
            StatusMessage = "選択プロファイルにResource taskがありません。";
            return;
        }

        foreach (var task in ResourceTasks)
        {
            var result = await _session.RunResourceTaskAsync(task.Entry);
            ResourceTaskResults.Add(result);
            RefreshResourceTaskDiagnostics();
            StatusMessage = $"{task.Entry}: {result.Status}";
        }
        RefreshInspectorRows();
    }

    private async Task ConvertResourceTaskResultsCoreAsync()
    {
        if (!ResourceTaskResults.Any())
        {
            StatusMessage = "先にResource taskを実行してください。";
            return;
        }

        CandidateResults.Clear();
        var apiError = "";
        IReadOnlyList<MaaCandidatePreview> apiCandidates = [];
        var apiProfileId = CandidateApiProfileId();
        if (!string.IsNullOrWhiteSpace(apiProfileId))
        {
            try
            {
                using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
                var response = await client.PostAsJsonAsync(
                    $"{RhodesApiUrl}/api/recognition/maa-resource",
                    new
                    {
                        profile = apiProfileId,
                        source = "maa-framework",
                        taskResults = ResourceTaskResults.ToArray(),
                    });
                var json = await response.Content.ReadAsStringAsync();
                if (response.IsSuccessStatusCode)
                {
                    apiCandidates = ExtractCandidatePreviews(json);
                }
                else
                {
                    apiError = $"{(int)response.StatusCode} {Shorten(json, 160)}";
                }
            }
            catch (Exception ex)
            {
                apiError = Shorten(ex.Message, 160);
            }
        }
        else
        {
            apiError = "allプロファイルでは候補化APIをスキップしました。";
        }

        if (apiCandidates.Count > 0)
        {
            foreach (var candidate in apiCandidates)
            {
                CandidateResults.Add(candidate);
            }
            RefreshInspectorRows();
            StatusMessage = $"候補化しました: {CandidateResults.Count}件";
            return;
        }

        foreach (var candidate in RhodesMaaResultPreview.FromTaskResults(ResourceTaskResults))
        {
            CandidateResults.Add(candidate);
        }

        if (CandidateResults.Count > 0)
        {
            RefreshInspectorRows();
            StatusMessage = string.IsNullOrWhiteSpace(apiError)
                ? $"候補化APIは0件だったためローカルMAAプレビューを表示しました: {CandidateResults.Count}件"
                : $"候補化APIに接続できないためローカルMAAプレビューを表示しました: {CandidateResults.Count}件";
            return;
        }

        RefreshInspectorRows();
        StatusMessage = string.IsNullOrWhiteSpace(apiError)
            ? "候補は0件です。"
            : $"候補化API失敗: {apiError}";
    }

    private string? CandidateApiProfileId()
    {
        var profileId = SelectedResourceProfile?.Id;
        return string.IsNullOrWhiteSpace(profileId) || profileId == "all" ? null : profileId;
    }

    private async Task RunProbeAsync(MaaProbePayloadPreview? payload)
    {
        if (payload is null)
            return;

        await RunBusyAsync(async () =>
        {
            if (!await EnsureCaptureAsync())
                return;

            await RunProbeCoreAsync(payload);
        });
    }

    private async Task RunResourceTaskAsync(MaaResourceTaskPreview? task)
    {
        if (task is null)
            return;

        await RunBusyAsync(async () =>
        {
            var result = await _session.RunResourceTaskAsync(task.Entry);
            ResourceTaskResults.Add(result);
            RefreshResourceTaskDiagnostics();
            RefreshInspectorRows();
            StatusMessage = $"{task.Entry}: {result.Status}";
        });
    }

    private void RefreshResourceTaskDiagnostics()
    {
        ResourceTaskDiagnostics = RhodesMaaTaskDiagnostics.Summarize(ResourceTaskResults);
    }

    private void RefreshResourceTasks()
    {
        ResourceTasks.Clear();
        foreach (var task in _allResourceTasks.Where(task => RhodesMaaResourceCatalog.TaskAppliesToProfile(task, SelectedResourceProfile?.Id)))
        {
            ResourceTasks.Add(task);
        }
        RefreshInspectorRows();
    }

    private void RefreshChoiceLists()
    {
        RefreshOperatorChoices();
        RefreshRelicChoices();
        RefreshCampaignPreviews();
        RefreshInspectorRows();
        OnPropertyChanged(nameof(RunContextSummary));
        OnPropertyChanged(nameof(CampaignHeaderDetail));
    }

    private void RefreshOperatorChoices()
    {
        ReplaceCollection(
            FilteredOperators,
            RhodesChoiceFilter.Apply(
                _allOperators,
                new SukiChoiceFilterOptions(
                    SearchText: OperatorSearch,
                    OperatorClass: OperatorClassFilter,
                    OperatorBranch: OperatorBranchFilter,
                    Rarity: OperatorRarityFilter,
                    ShowSelectedFirst: OperatorShowSelectedFirst,
                    HideExcluded: OperatorHideExcluded,
                    SelectedOnly: OperatorSelectedOnly)));
        OnPropertyChanged(nameof(OperatorListSummary));
        OnPropertyChanged(nameof(RunContextSummary));
        OnPropertyChanged(nameof(CampaignHeaderDetail));
        RefreshInspectorRows();
    }

    private void RefreshRelicChoices()
    {
        ReplaceCollection(
            FilteredRelics,
            RhodesChoiceFilter.Apply(
                _allRelics,
                new SukiChoiceFilterOptions(
                    SearchText: RelicSearch,
                    Category: RelicCategoryFilter,
                    CampaignId: SelectedCampaign?.Id ?? "",
                    ShowSelectedFirst: RelicShowSelectedFirst,
                    HideExcluded: RelicHideExcluded,
                    SelectedOnly: RelicSelectedOnly)));
        OnPropertyChanged(nameof(RelicListSummary));
        OnPropertyChanged(nameof(RunContextSummary));
        OnPropertyChanged(nameof(CampaignHeaderDetail));
        RefreshCampaignPreviews();
        RefreshInspectorRows();
    }

    private void RefreshOperatorFilterOptions()
    {
        var rarityBase = _allOperators.Where(item => !item.HiddenByDefault);
        ReplaceCollection(OperatorRarityOptions, new[] { "すべて" }.Concat(
            rarityBase.Select(item => item.Rarity)
                .Where(item => item > 0)
                .Distinct()
                .OrderByDescending(item => item)
                .Select(item => $"★{item}")));
        EnsureFilterValue(ref _operatorRarityFilter, OperatorRarityOptions, nameof(OperatorRarityFilter));

        var classBase = _allOperators.Where(item => !item.HiddenByDefault && RarityMatches(item));
        ReplaceCollection(OperatorClassOptions, new[] { "すべて" }.Concat(
            classBase.Select(item => item.OperatorClass)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct()
                .Order(StringComparer.Ordinal)));
        EnsureFilterValue(ref _operatorClassFilter, OperatorClassOptions, nameof(OperatorClassFilter));

        var branchBase = classBase.Where(item => OperatorClassFilter == "すべて" || item.OperatorClass == OperatorClassFilter);
        ReplaceCollection(OperatorBranchOptions, new[] { "すべて" }.Concat(
            branchBase.Select(item => item.OperatorBranch)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct()
                .Order(StringComparer.Ordinal)));
        EnsureFilterValue(ref _operatorBranchFilter, OperatorBranchOptions, nameof(OperatorBranchFilter));
    }

    private void RefreshRelicFilterOptions()
    {
        ReplaceCollection(RelicCategoryOptions, new[] { "すべて" }.Concat(
            _allRelics.Where(item => item.CampaignId == SelectedCampaign?.Id)
                .Select(item => item.Category)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct()
                .Order(StringComparer.Ordinal)));
        EnsureFilterValue(ref _relicCategoryFilter, RelicCategoryOptions, nameof(RelicCategoryFilter));
    }

    private bool RarityMatches(SukiChoiceItem item)
    {
        return OperatorRarityFilter == "すべて" || item.Rarity.ToString() == OperatorRarityFilter.TrimStart('★');
    }

    private void EnsureFilterValue(ref string value, IEnumerable<string> options, string propertyName)
    {
        if (options.Contains(value))
            return;

        value = "すべて";
        OnPropertyChanged(propertyName);
    }

    private static void ReplaceCollection<T>(ObservableCollection<T> target, IEnumerable<T> source)
    {
        target.Clear();
        foreach (var item in source)
        {
            target.Add(item);
        }
    }

    private async Task RunProbeCoreAsync(MaaProbePayloadPreview payload)
    {
        if (_session.Tasker is null)
        {
            ProbeResults.Add(new MaaProbeResult(payload.Name, "Invalid", false, "先にADB接続してください。"));
            return;
        }

        var result = await RhodesRecognitionProbe.RunRecognitionAsync(
            _session.Tasker,
            payload.Name,
            payload.Payload,
            _lastCapture);
        ProbeResults.Add(result);
        StatusMessage = $"{payload.Name}: {result.Status}";
    }

    private async Task<bool> EnsureCaptureAsync()
    {
        if (_lastCapture.Length > 0)
            return true;

        var capture = await CaptureCoreAsync();
        return capture?.Succeeded == true;
    }

    private async Task<MaaCaptureResult?> CaptureCoreAsync()
    {
        var capture = await _session.CaptureEncodedAsync();
        CaptureState = capture.Succeeded ? $"取得済み: {capture.Detail}" : $"失敗: {capture.Detail}";
        if (!capture.Succeeded)
        {
            StatusMessage = capture.Detail;
            return capture;
        }

        _lastCapture = capture.EncodedImage;
        LastCaptureImage = CreateCaptureBitmap(capture.EncodedImage);
        LastCapturePath = await SaveCaptureAsync(capture.EncodedImage);
        CaptureState = $"{capture.Detail} / {LastCapturePath}";
        RefreshInspectorRows();
        return capture;
    }

    private static Bitmap CreateCaptureBitmap(byte[] encodedImage)
    {
        using var stream = new MemoryStream(encodedImage);
        return new Bitmap(stream);
    }

    private MaaSessionOptions BuildSessionOptions()
    {
        return RhodesMaaSession.DefaultAdbOptions(
            string.IsNullOrWhiteSpace(AdbPath) ? "adb" : AdbPath.Trim(),
            AdbSerial.Trim(),
            AdbConfigJson.Trim());
    }

    private static async Task<string> SaveCaptureAsync(byte[] encodedImage)
    {
        var directory = Path.Combine(AppContext.BaseDirectory, "RHODES OBS COMMANDER3373 Debug Logs", "maa-captures");
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, $"suki-maa-capture-{DateTimeOffset.Now:yyyyMMdd-HHmmss-fff}.png");
        await File.WriteAllBytesAsync(path, encodedImage);
        return path;
    }

    private static async Task<string> SaveResourceTaskResultsAsync(IEnumerable<MaaTaskRunResult> taskResults, string? profileId)
    {
        var directory = Path.Combine(AppContext.BaseDirectory, "RHODES OBS COMMANDER3373 Debug Logs", "maa-resource-results");
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, $"suki-maa-resource-results-{DateTimeOffset.Now:yyyyMMdd-HHmmss-fff}.json");
        var payload = new
        {
            schemaVersion = 1,
            createdAt = DateTimeOffset.Now,
            profile = string.IsNullOrWhiteSpace(profileId) || profileId == "all" ? null : profileId,
            taskResults = taskResults.ToArray(),
        };
        var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(path, $"{json}{Environment.NewLine}");
        return path;
    }

    private static IReadOnlyList<MaaCandidatePreview> ExtractCandidatePreviews(string json)
    {
        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("result", out var result)
            || !result.TryGetProperty("candidates", out var candidates)
            || candidates.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var previews = new List<MaaCandidatePreview>();
        foreach (var candidate in candidates.EnumerateArray())
        {
            var kind = JsonString(candidate, "kind");
            var label = JsonString(candidate, "label");
            var rawText = JsonString(candidate, "rawText");
            var field = JsonString(candidate, "field");
            var name = JsonString(candidate, "name");
            var value = JsonValueText(candidate, "value");
            var confidence = JsonNumber(candidate, "confidence");
            previews.Add(new MaaCandidatePreview(
                kind,
                string.IsNullOrWhiteSpace(label) ? field : label,
                string.IsNullOrWhiteSpace(value) ? name : value,
                rawText,
                confidence));
        }
        return previews;
    }

    private static string JsonString(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.String
            ? property.GetString() ?? ""
            : "";
    }

    private static string JsonValueText(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property))
            return "";
        return property.ValueKind switch
        {
            JsonValueKind.String => property.GetString() ?? "",
            JsonValueKind.Number => property.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => property.GetRawText(),
        };
    }

    private static double? JsonNumber(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.Number
            && property.TryGetDouble(out var value)
            ? value
            : null;
    }

    private static string Shorten(string value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "";

        var text = value.Trim().ReplaceLineEndings(" ");
        return text.Length <= maxLength ? text : $"{text[..maxLength]}...";
    }

    private async Task RunBusyAsync(Func<Task> action)
    {
        if (IsBusy)
            return;

        try
        {
            IsBusy = true;
            await action();
        }
        catch (Exception ex)
        {
            StatusMessage = ex.Message;
        }
        finally
        {
            IsBusy = false;
        }
    }

    private bool SetProperty<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
            return false;

        field = value;
        OnPropertyChanged(propertyName);
        return true;
    }

    private void SetCaptureImage(Bitmap? value)
    {
        if (ReferenceEquals(_lastCaptureImage, value))
            return;

        var previous = _lastCaptureImage;
        _lastCaptureImage = value;
        OnPropertyChanged(nameof(LastCaptureImage));
        previous?.Dispose();
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}
