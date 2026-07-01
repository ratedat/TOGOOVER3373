using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
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
    private IReadOnlyList<MaaResourceTaskPreview> _allResourceTasks;
    private readonly IReadOnlyList<SukiChoiceItem> _allOperators = [];
    private readonly IReadOnlyList<SukiChoiceItem> _allRelics = [];
    private readonly IntegrationStatus _maaFrameworkStatus;
    private SukiRunStateSnapshot _runState;
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
    private int _operatorPaneColumns = 2;
    private int _relicPaneColumns = 2;
    private string _sessionState;
    private string _sessionDetail;
    private string _captureState = "未取得";
    private string _lastCapturePath = "";
    private string _lastResourceTaskResultsPath = "";
    private string _lastRoiDraftPath = "";
    private string _lastRoiSessionPath = "";
    private string _roiRescanComparisonSummary = "再スキャン比較未実行";
    private string _roiRescanComparisonEvidenceSummary = "比較証跡未保存";
    private string _roiRescanEvidencePreviewTitle = "比較証跡未表示";
    private string _roiRescanEvidencePreviewText = "";
    private string _lastRoiRescanBeforePath = "";
    private string _lastRoiRescanAfterPath = "";
    private MaaEvidencePreviewNode? _selectedRoiRescanEvidencePreviewNode;
    private MaaRoiDraftApplyResult _roiDraftApplyResult = MaaRoiDraftApplyResult.Failed("未確認");
    private MaaRoiBatchApplyResult _roiBatchApplyResult = MaaRoiBatchApplyResult.Failed("未確認");
    private MaaResourceGenerationResult _maaResourceGenerationResult = MaaResourceGenerationResult.Failed("未実行");
    private string _rhodesApiUrl = "http://127.0.0.1:5173";
    private string _statusMessage = "MAAFramework の検証準備ができています。";
    private string _roiSessionRestoreNotice = "ROI調整セッション未読込";
    private string _lastCandidateApplySummary = "候補未反映";
    private SukiOptionalRuntimeStatus _rhodesApiStatus = new("RHODES API", "未確認", "状態同期または認識API実行で確認します。", false, false);
    private SukiOptionalRuntimeStatus _masterDataStatus = new("Master Data", "未確認", "/api/master未確認", false, false);
    private SukiOptionalRuntimeStatus _glmRuntimeStatus = new("GLM-OCR", "未確認", "状態確認を実行してください。", false, false);
    private SukiOptionalRuntimeStatus _ollamaRuntimeStatus = new("Ollama", "未確認", "状態確認を実行してください。", false, false);
    private SukiHypervisorStatus _hypervisorStatus = new("未確認", "Google Play Gamesや一部エミュレーターの前提確認", false, false, "info");
    private RhodesRecognitionScanStatusPreview _recognitionScanStatus = RhodesRecognitionScanStatusPreview.Empty;
    private Bitmap? _lastCaptureImage;
    private int _capturePixelWidth;
    private int _capturePixelHeight;
    private string _selectedRoiPreviewKey = "";
    private int[] _roiDragOrigin = [];
    private double _roiDragStartX;
    private double _roiDragStartY;
    private int[] _roiResizeOrigin = [];
    private string _roiResizeMode = "";
    private double _roiResizeStartX;
    private double _roiResizeStartY;
    private MaaRoiPreviewRow? _selectedRoiPreviewRow;
    private MaaRoiEditDraft _selectedRoiEditDraft = MaaRoiEditDraft.Empty;
    private MaaRoiRescanComparisonRow? _selectedRoiRescanComparisonRow;
    private MaaCandidatePreview? _selectedCandidateResult;
    private MaaOcrDetailRow? _selectedOcrDetailRow;
    private MaaTaskRunResult? _selectedResourceTaskResult;
    private RhodesRecognitionScanLogRow? _selectedRecognitionScanLogRow;
    private MaaAdbPresetPreview? _selectedAdbPreset;
    private MaaResourceProfilePreview? _selectedResourceProfile;
    private SukiOcrEngineOption? _selectedOcrEngine;
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
    private int _outputScrollSpeed = 13;
    private bool _showRoiOverlay = true;
    private int _roiSnapStep = 1;
    private bool _isBusy;

    public MainWindowViewModel(
        IntegrationStatus maaStatus,
        RhodesMaaSession session,
        MaaSessionSnapshot sessionSnapshot)
    {
        _session = session;
        _maaFrameworkStatus = maaStatus;
        _sessionState = sessionSnapshot.State;
        _sessionDetail = sessionSnapshot.Detail;
        _allResourceTasks = RhodesMaaResourceCatalog.DefaultTasks();

        RuntimeStatuses =
        [
            maaStatus,
            new IntegrationStatus("MAA Resource", SessionState, SessionDetail, sessionSnapshot.IsReady),
            new IntegrationStatus(
                "MAA-OCR",
                MaaOcrStatusState(),
                MaaOcrStatusDetail(),
                _allResourceTasks.Count > 0),
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
        OcrEngineOptions = new ObservableCollection<SukiOcrEngineOption>(SukiOcrEngineCatalog.Options);
        SelectedAdbPreset = AdbPresets.FirstOrDefault(preset => preset.Id == "auto") ?? AdbPresets.FirstOrDefault();
        Campaigns = new ObservableCollection<SukiCampaignPreview>(runCatalog.Campaigns);
        _allOperators = runCatalog.Operators;
        _allRelics = runCatalog.Relics;
        FilteredOperators = [];
        FilteredRelics = [];
        FilteredOperatorRows = [];
        FilteredRelicRows = [];
        OperatorRarityOptions = [];
        OperatorClassOptions = [];
        OperatorBranchOptions = [];
        RelicCategoryOptions = [];
        PaneColumnOptions = [1, 2, 3, 4];
        _operatorShowSelectedFirst = runCatalog.Current.OperatorShowSelectedFirst;
        _operatorHideExcluded = runCatalog.Current.OperatorHideExcluded;
        _operatorSelectedOnly = runCatalog.Current.OperatorSelectedOnly;
        _relicShowSelectedFirst = runCatalog.Current.RelicShowSelectedFirst;
        _relicHideExcluded = runCatalog.Current.RelicHideExcluded;
        _relicSelectedOnly = runCatalog.Current.RelicSelectedOnly;
        _operatorPaneColumns = ClampPaneColumns(runCatalog.Current.OperatorGridColumns);
        _relicPaneColumns = ClampPaneColumns(runCatalog.Current.RelicGridColumns);
        _selectedOcrEngine = OcrEngineOptions.FirstOrDefault(option => option.Id == runCatalog.Current.OcrEngine)
            ?? OcrEngineOptions.FirstOrDefault();
        _selectedCampaign = Campaigns.FirstOrDefault(campaign => campaign.Id == runCatalog.Current.CampaignId) ?? Campaigns.FirstOrDefault();
        ResourceProfiles = new ObservableCollection<MaaResourceProfilePreview>(RhodesMaaResourceCatalog.ProfileGroups(_allResourceTasks));
        ResourceTasks = [];
        ResourceTaskResults = [];
        CandidateResults = [];
        OcrDetailRows = [];
        RoiDetailRows = [];
        RoiPreviewRows = [];
        SelectedRoiPreviewRows = [];
        RoiBatchDrafts = [];
        RoiAdjustmentSessions = [];
        RoiRescanComparisonRows = [];
        RoiRescanEvidencePreviewNodes = [];
        RecognitionScanHistory = [];
        RecognitionScanLogRows = [];
        BaseResolution = Services.RhodesMaaPaths.BaseResolution;
        ResourceRoot = sessionSnapshot.ResourceRoot;
        AgentBinaryRoot = sessionSnapshot.AgentBinaryRoot;

        ConnectCommand = new AsyncRelayCommand(ConnectAsync);
        SaveSettingsCommand = new AsyncRelayCommand(SaveSettingsAsync);
        ApplyAdbPresetCommand = new AsyncRelayCommand(parameter => ApplyAdbPresetAsync(parameter as MaaAdbPresetPreview));
        RefreshAdbDevicesCommand = new AsyncRelayCommand(RefreshAdbDevicesAsync);
        ApplyAdbDeviceCommand = new AsyncRelayCommand(parameter => ApplyAdbDeviceAsync(parameter as MaaAdbDevicePreview));
        RunAdbApiTestCommand = new AsyncRelayCommand(RunAdbApiTestAsync);
        RefreshOptionalRuntimesCommand = new AsyncRelayCommand(RefreshOptionalRuntimesAsync);
        InstallGlmOcrCommand = new AsyncRelayCommand(() => RunOptionalRuntimeActionAsync("GLM-OCR導入", RhodesOptionalRuntimeProbe.InstallGlmAsync, status => _glmRuntimeStatus = status));
        UninstallGlmOcrCommand = new AsyncRelayCommand(() => RunOptionalRuntimeActionAsync("GLM-OCR削除", RhodesOptionalRuntimeProbe.UninstallGlmAsync, status => _glmRuntimeStatus = status));
        InstallOllamaCommand = new AsyncRelayCommand(() => RunOptionalRuntimeActionAsync("Ollama導入", RhodesOptionalRuntimeProbe.InstallOllamaAsync, status => _ollamaRuntimeStatus = status));
        StartOllamaCommand = new AsyncRelayCommand(() => RunOptionalRuntimeActionAsync("Ollama起動", RhodesOptionalRuntimeProbe.StartOllamaAsync, status => _ollamaRuntimeStatus = status));
        UninstallOllamaCommand = new AsyncRelayCommand(() => RunOptionalRuntimeActionAsync("Ollama削除", RhodesOptionalRuntimeProbe.UninstallOllamaAsync, status => _ollamaRuntimeStatus = status));
        CaptureCommand = new AsyncRelayCommand(CaptureAsync);
        RunAllProbesCommand = new AsyncRelayCommand(RunAllProbesAsync);
        RunSelectedProfileRecognitionCommand = new AsyncRelayCommand(RunSelectedProfileRecognitionAsync);
        RunSelectedProfileRecognitionAndApplyCommand = new AsyncRelayCommand(RunSelectedProfileRecognitionAndApplyAsync);
        RunSelectedProfileAdbScanCommand = new AsyncRelayCommand(RunSelectedProfileAdbScanAsync);
        RefreshRecognitionScanStatusCommand = new AsyncRelayCommand(RefreshRecognitionScanStatusAsync);
        RefreshRecognitionScanHistoryCommand = new AsyncRelayCommand(RefreshRecognitionScanHistoryAsync);
        LoadRecognitionScanHistoryCommand = new AsyncRelayCommand(parameter => LoadRecognitionScanHistoryAsync(parameter as RhodesRecognitionScanHistoryItem));
        OpenPreviewUrlCommand = new AsyncRelayCommand(OpenPreviewUrlAsync);
        RunAllResourceTasksCommand = new AsyncRelayCommand(RunAllResourceTasksAsync);
        ExportResourceTaskResultsCommand = new AsyncRelayCommand(ExportResourceTaskResultsAsync);
        ExportSelectedRoiDraftCommand = new AsyncRelayCommand(ExportSelectedRoiDraftAsync);
        ExportRoiAdjustmentSessionCommand = new AsyncRelayCommand(ExportRoiAdjustmentSessionAsync);
        RefreshRoiAdjustmentSessionsCommand = new AsyncRelayCommand(RefreshRoiAdjustmentSessionsAsync);
        LoadRoiAdjustmentSessionCommand = new AsyncRelayCommand(parameter => LoadRoiAdjustmentSessionAsync(parameter as MaaRoiAdjustmentSessionItem));
        SelectRoiPreviewCommand = new AsyncRelayCommand(parameter => SelectRoiPreviewAsync(parameter as MaaRoiPreviewRow));
        SetRoiSnapStepCommand = new AsyncRelayCommand(parameter => SetRoiSnapStepAsync(parameter as string));
        ResetSelectedRoiDraftCommand = new AsyncRelayCommand(ResetSelectedRoiDraftAsync);
        AdjustSelectedRoiDraftCommand = new AsyncRelayCommand(parameter => AdjustSelectedRoiDraftAsync(parameter as string));
        PreviewSelectedRoiDraftApplyCommand = new AsyncRelayCommand(PreviewSelectedRoiDraftApplyAsync);
        ApplySelectedRoiDraftCommand = new AsyncRelayCommand(ApplySelectedRoiDraftAsync);
        PreviewVisibleRoiDraftsApplyCommand = new AsyncRelayCommand(PreviewVisibleRoiDraftsApplyAsync);
        ApplyVisibleRoiDraftsCommand = new AsyncRelayCommand(ApplyVisibleRoiDraftsAsync);
        IncludeAllRoiBatchDraftsCommand = new AsyncRelayCommand(_ => SetAllRoiBatchDraftsIncludedAsync(true));
        ExcludeAllRoiBatchDraftsCommand = new AsyncRelayCommand(_ => SetAllRoiBatchDraftsIncludedAsync(false));
        RunRoiRescanComparisonCommand = new AsyncRelayCommand(RunRoiRescanComparisonAsync);
        OpenRoiRescanEvidenceCommand = new AsyncRelayCommand(OpenRoiRescanEvidenceAsync);
        PreviewRoiRescanEvidenceCommand = new AsyncRelayCommand(PreviewRoiRescanEvidenceAsync);
        RegenerateMaaResourceCommand = new AsyncRelayCommand(RegenerateMaaResourceAsync);
        SyncRunStateFromApiCommand = new AsyncRelayCommand(SyncRunStateFromApiAsync);
        ConvertResourceTaskResultsCommand = new AsyncRelayCommand(ConvertResourceTaskResultsAsync);
        ApplyCandidateResultsCommand = new AsyncRelayCommand(ApplyCandidateResultsAsync);
        RunProbeCommand = new AsyncRelayCommand(parameter => RunProbeAsync(parameter as MaaProbePayloadPreview));
        RunResourceTaskCommand = new AsyncRelayCommand(parameter => RunResourceTaskAsync(parameter as MaaResourceTaskPreview));
        SetWorkspaceCommand = new AsyncRelayCommand(SetWorkspaceAsync);
        SetChoiceTabCommand = new AsyncRelayCommand(SetChoiceTabAsync);
        OpenRecognitionProfileCommand = new AsyncRelayCommand(OpenRecognitionProfileAsync);
        SetCurrentCampaignCommand = new AsyncRelayCommand(SetCurrentCampaignAsync);
        ToggleChoiceSelectedCommand = new AsyncRelayCommand(ToggleChoiceSelectedAsync);
        ToggleChoiceExcludedCommand = new AsyncRelayCommand(ToggleChoiceExcludedAsync);
        ClearVisibleChoicesCommand = new AsyncRelayCommand(ClearVisibleChoicesAsync);
        SelectedResourceProfile = ResourceProfiles.FirstOrDefault(profile => profile.Id == "runStatusFull") ?? ResourceProfiles.FirstOrDefault();
        RefreshOperatorFilterOptions();
        RefreshRelicFilterOptions();
        RefreshChoiceLists();
        RefreshCampaignPreviews();
        RefreshSpecialValuePreviews();
        RefreshRecognitionScanHistory();
        RefreshRoiAdjustmentSessions();
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

    public ObservableCollection<SukiOcrEngineOption> OcrEngineOptions { get; }

    public ObservableCollection<SukiCampaignPreview> Campaigns { get; }

    public ObservableCollection<SukiChoiceItem> FilteredOperators { get; }

    public ObservableCollection<SukiChoiceItem> FilteredRelics { get; }

    public ObservableCollection<SukiChoiceRow> FilteredOperatorRows { get; }

    public ObservableCollection<SukiChoiceRow> FilteredRelicRows { get; }

    public ObservableCollection<string> OperatorRarityOptions { get; }

    public ObservableCollection<string> OperatorClassOptions { get; }

    public ObservableCollection<string> OperatorBranchOptions { get; }

    public ObservableCollection<string> RelicCategoryOptions { get; }

    public ObservableCollection<int> PaneColumnOptions { get; }

    public ObservableCollection<MaaResourceProfilePreview> ResourceProfiles { get; }

    public ObservableCollection<MaaResourceTaskPreview> ResourceTasks { get; }

    public ObservableCollection<MaaTaskRunResult> ResourceTaskResults { get; }

    public ObservableCollection<MaaCandidatePreview> CandidateResults { get; }

    public ObservableCollection<MaaOcrDetailRow> OcrDetailRows { get; }

    public ObservableCollection<MaaRoiDetailRow> RoiDetailRows { get; }

    public ObservableCollection<MaaRoiPreviewRow> RoiPreviewRows { get; }

    public ObservableCollection<MaaRoiPreviewRow> SelectedRoiPreviewRows { get; }

    public ObservableCollection<MaaRoiBatchDraftPreview> RoiBatchDrafts { get; }

    public ObservableCollection<MaaRoiAdjustmentSessionItem> RoiAdjustmentSessions { get; }

    public ObservableCollection<MaaRoiRescanComparisonRow> RoiRescanComparisonRows { get; }

    public ObservableCollection<MaaEvidencePreviewNode> RoiRescanEvidencePreviewNodes { get; }

    public ObservableCollection<RhodesRecognitionScanHistoryItem> RecognitionScanHistory { get; }

    public ObservableCollection<RhodesRecognitionScanLogRow> RecognitionScanLogRows { get; }

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
            PersistChoiceStateInBackground();
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
            PersistChoiceStateInBackground();
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
            PersistChoiceStateInBackground();
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
            PersistChoiceStateInBackground();
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
            PersistChoiceStateInBackground();
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
            PersistChoiceStateInBackground();
        }
    }

    public int OperatorPaneColumns
    {
        get => _operatorPaneColumns;
        set
        {
            if (!SetProperty(ref _operatorPaneColumns, ClampPaneColumns(value)))
                return;
            RefreshOperatorRows();
            RefreshInspectorRows();
            PersistChoiceStateInBackground();
        }
    }

    public int RelicPaneColumns
    {
        get => _relicPaneColumns;
        set
        {
            if (!SetProperty(ref _relicPaneColumns, ClampPaneColumns(value)))
                return;
            RefreshRelicRows();
            RefreshInspectorRows();
            PersistChoiceStateInBackground();
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
            if (!SetProperty(ref _outputScrollSpeed, Math.Clamp(value, 0, 30)))
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

    public string LastResourceTaskResultsPath
    {
        get => _lastResourceTaskResultsPath;
        private set
        {
            if (!SetProperty(ref _lastResourceTaskResultsPath, value ?? ""))
                return;
            RefreshRecognitionScanHistory();
        }
    }

    public string LastRoiDraftPath
    {
        get => _lastRoiDraftPath;
        private set
        {
            if (!SetProperty(ref _lastRoiDraftPath, value ?? ""))
                return;
            RefreshInspectorRows();
        }
    }

    public string LastRoiSessionPath
    {
        get => _lastRoiSessionPath;
        private set
        {
            if (!SetProperty(ref _lastRoiSessionPath, value))
                return;
            RefreshInspectorRows();
        }
    }

    public Bitmap? LastCaptureImage
    {
        get => _lastCaptureImage;
        private set => SetCaptureImage(value);
    }

    public string CapturePixelSizeLabel => _capturePixelWidth > 0 && _capturePixelHeight > 0
        ? $"{_capturePixelWidth}x{_capturePixelHeight}"
        : BaseResolution.AspectRatioLabel;

    public string RoiProjectionLabel => RoiPreviewRows.FirstOrDefault()?.ScaleLabel ?? $"base {BaseResolution.AspectRatioLabel}";

    public string RhodesApiUrl
    {
        get => _rhodesApiUrl;
        set
        {
            if (!SetProperty(ref _rhodesApiUrl, string.IsNullOrWhiteSpace(value) ? "http://127.0.0.1:5173" : value.TrimEnd('/')))
                return;
            _rhodesApiStatus = new SukiOptionalRuntimeStatus("RHODES API", "未確認", "API URLが変更されました。状態同期で確認してください。", false, false);
            RefreshRuntimeCapabilities();
            RefreshInspectorRows();
        }
    }

    public string StatusMessage
    {
        get => _statusMessage;
        private set => SetProperty(ref _statusMessage, value);
    }

    public string RoiSessionRestoreNotice
    {
        get => _roiSessionRestoreNotice;
        private set => SetProperty(ref _roiSessionRestoreNotice, string.IsNullOrWhiteSpace(value) ? "ROI調整セッション未読込" : value);
    }

    public string RoiRescanComparisonSummary
    {
        get => _roiRescanComparisonSummary;
        private set
        {
            if (!SetProperty(ref _roiRescanComparisonSummary, string.IsNullOrWhiteSpace(value) ? "再スキャン比較未実行" : value))
                return;
            RefreshInspectorRows();
        }
    }

    public string RoiRescanComparisonEvidenceSummary
    {
        get => _roiRescanComparisonEvidenceSummary;
        private set => SetProperty(ref _roiRescanComparisonEvidenceSummary, string.IsNullOrWhiteSpace(value) ? "比較証跡未保存" : value);
    }

    public string RoiRescanEvidencePreviewTitle
    {
        get => _roiRescanEvidencePreviewTitle;
        private set => SetProperty(ref _roiRescanEvidencePreviewTitle, string.IsNullOrWhiteSpace(value) ? "比較証跡未表示" : value);
    }

    public string RoiRescanEvidencePreviewText
    {
        get => _roiRescanEvidencePreviewText;
        private set => SetProperty(ref _roiRescanEvidencePreviewText, value ?? "");
    }

    public MaaEvidencePreviewNode? SelectedRoiRescanEvidencePreviewNode
    {
        get => _selectedRoiRescanEvidencePreviewNode;
        set
        {
            if (!SetProperty(ref _selectedRoiRescanEvidencePreviewNode, value) || value is null)
                return;
            RoiRescanEvidencePreviewText = string.IsNullOrWhiteSpace(value.PreviewText)
                ? value.Detail
                : value.PreviewText;
        }
    }

    public string LastCandidateApplySummary
    {
        get => _lastCandidateApplySummary;
        private set => SetProperty(ref _lastCandidateApplySummary, string.IsNullOrWhiteSpace(value) ? "候補未反映" : value);
    }

    public bool ShowRoiOverlay
    {
        get => _showRoiOverlay;
        set => SetProperty(ref _showRoiOverlay, value);
    }

    public int RoiSnapStep
    {
        get => _roiSnapStep;
        private set => SetProperty(ref _roiSnapStep, Math.Clamp(value, 1, 32));
    }

    public string RoiSnapStepLabel => $"step {RoiSnapStep}px";

    public MaaRoiPreviewRow? SelectedRoiPreviewRow
    {
        get => _selectedRoiPreviewRow;
        set
        {
            var nextKey = value?.Key ?? "";
            if (_selectedRoiPreviewKey == nextKey && Equals(_selectedRoiPreviewRow, value))
                return;

            _selectedRoiPreviewKey = nextKey;
            _selectedRoiPreviewRow = value;
            OnPropertyChanged();
            RefreshSelectedRoiPreviewRows();
        }
    }

    public MaaRoiEditDraft SelectedRoiEditDraft
    {
        get => _selectedRoiEditDraft;
        private set => SetProperty(ref _selectedRoiEditDraft, value);
    }

    public MaaRoiRescanComparisonRow? SelectedRoiRescanComparisonRow
    {
        get => _selectedRoiRescanComparisonRow;
        set
        {
            if (!SetProperty(ref _selectedRoiRescanComparisonRow, value))
                return;
            SelectCandidateForComparison(value);
        }
    }

    public MaaCandidatePreview? SelectedCandidateResult
    {
        get => _selectedCandidateResult;
        set => SetProperty(ref _selectedCandidateResult, value);
    }

    public MaaRoiDraftApplyResult RoiDraftApplyResult
    {
        get => _roiDraftApplyResult;
        private set
        {
            if (!SetProperty(ref _roiDraftApplyResult, value))
                return;
            RefreshInspectorRows();
        }
    }

    public MaaRoiBatchApplyResult RoiBatchApplyResult
    {
        get => _roiBatchApplyResult;
        private set
        {
            if (!SetProperty(ref _roiBatchApplyResult, value))
                return;
            RefreshInspectorRows();
        }
    }

    public MaaResourceGenerationResult MaaResourceGenerationResult
    {
        get => _maaResourceGenerationResult;
        private set
        {
            if (!SetProperty(ref _maaResourceGenerationResult, value))
                return;
            RefreshInspectorRows();
        }
    }

    public MaaOcrDetailRow? SelectedOcrDetailRow
    {
        get => _selectedOcrDetailRow;
        set
        {
            if (Equals(_selectedOcrDetailRow, value))
                return;

            _selectedOcrDetailRow = value;
            OnPropertyChanged();
            SelectRoiForOcrDetail(value);
        }
    }

    public MaaTaskRunResult? SelectedResourceTaskResult
    {
        get => _selectedResourceTaskResult;
        set
        {
            if (Equals(_selectedResourceTaskResult, value))
                return;

            _selectedResourceTaskResult = value;
            OnPropertyChanged();
            SelectRoiForTaskResult(value);
        }
    }

    public RhodesRecognitionScanLogRow? SelectedRecognitionScanLogRow
    {
        get => _selectedRecognitionScanLogRow;
        set
        {
            if (Equals(_selectedRecognitionScanLogRow, value))
                return;

            _selectedRecognitionScanLogRow = value;
            OnPropertyChanged();
            SelectRoiForLogRow(value);
        }
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

    public SukiOcrEngineOption? SelectedOcrEngine
    {
        get => _selectedOcrEngine;
        set
        {
            if (!SetProperty(ref _selectedOcrEngine, value))
                return;
            RefreshRuntimeCapabilities();
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

    public ICommand RunAdbApiTestCommand { get; }

    public ICommand RefreshOptionalRuntimesCommand { get; }

    public ICommand InstallGlmOcrCommand { get; }

    public ICommand UninstallGlmOcrCommand { get; }

    public ICommand InstallOllamaCommand { get; }

    public ICommand StartOllamaCommand { get; }

    public ICommand UninstallOllamaCommand { get; }

    public ICommand CaptureCommand { get; }

    public ICommand RunAllProbesCommand { get; }

    public ICommand RunSelectedProfileRecognitionCommand { get; }

    public ICommand RunSelectedProfileRecognitionAndApplyCommand { get; }

    public ICommand RunSelectedProfileAdbScanCommand { get; }

    public ICommand RefreshRecognitionScanStatusCommand { get; }

    public ICommand RefreshRecognitionScanHistoryCommand { get; }

    public ICommand LoadRecognitionScanHistoryCommand { get; }

    public ICommand OpenPreviewUrlCommand { get; }

    public ICommand RunAllResourceTasksCommand { get; }

    public ICommand ExportResourceTaskResultsCommand { get; }

    public ICommand ExportSelectedRoiDraftCommand { get; }

    public ICommand ExportRoiAdjustmentSessionCommand { get; }

    public ICommand RefreshRoiAdjustmentSessionsCommand { get; }

    public ICommand LoadRoiAdjustmentSessionCommand { get; }

    public ICommand SelectRoiPreviewCommand { get; }

    public ICommand SetRoiSnapStepCommand { get; }

    public ICommand ResetSelectedRoiDraftCommand { get; }

    public ICommand AdjustSelectedRoiDraftCommand { get; }

    public ICommand PreviewSelectedRoiDraftApplyCommand { get; }

    public ICommand ApplySelectedRoiDraftCommand { get; }

    public ICommand PreviewVisibleRoiDraftsApplyCommand { get; }

    public ICommand ApplyVisibleRoiDraftsCommand { get; }

    public ICommand IncludeAllRoiBatchDraftsCommand { get; }

    public ICommand ExcludeAllRoiBatchDraftsCommand { get; }

    public ICommand RunRoiRescanComparisonCommand { get; }

    public ICommand OpenRoiRescanEvidenceCommand { get; }

    public ICommand PreviewRoiRescanEvidenceCommand { get; }

    public ICommand RegenerateMaaResourceCommand { get; }

    public ICommand SyncRunStateFromApiCommand { get; }

    public ICommand ConvertResourceTaskResultsCommand { get; }

    public ICommand ApplyCandidateResultsCommand { get; }

    public ICommand RunProbeCommand { get; }

    public ICommand RunResourceTaskCommand { get; }

    public RhodesRecognitionScanStatusPreview RecognitionScanStatus
    {
        get => _recognitionScanStatus;
        private set
        {
            if (!SetProperty(ref _recognitionScanStatus, value))
                return;
            RefreshInspectorRows();
        }
    }

    public ICommand SetWorkspaceCommand { get; }

    public ICommand SetChoiceTabCommand { get; }

    public ICommand OpenRecognitionProfileCommand { get; }

    public ICommand SetCurrentCampaignCommand { get; }

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
        yield return new SukiStatusChip("構想", _runState.Idea.ToString(), "is5.idea");
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
        yield return new SukiRunFieldPreview("構想", state.Idea.ToString(), "Template / OCR", "run.idea.current", "IS#5では構想アイコン直下の数値");
        yield return new SukiRunFieldPreview("シールド", state.Shield.ToString(), "Template / OCR", "run.shield", "耐久値右側の盾アイコン基準");
        yield return new SukiRunFieldPreview("耐久", state.LifePoints.ToString(), "OCR / Manual review", "run.life", "左上の耐久値");
        yield return new SukiRunFieldPreview("指揮Lv", $"Lv{state.CommandLevel}", "OCR", "run.command_level", "指揮Lvパネル");
        yield return new SukiRunFieldPreview("等級", string.IsNullOrWhiteSpace(state.Difficulty) ? "-" : state.Difficulty, "Manual / squad panel", "run.difficulty_grade", "閉じたマップ上のバッジではなく分隊情報から確定");
        yield return new SukiRunFieldPreview("分隊", string.IsNullOrWhiteSpace(state.Squad) ? "-" : state.Squad, "Manual / OCR", "run.squad_name", "分隊カードまたは情報パネル");
        yield return new SukiRunFieldPreview("分隊効果", string.IsNullOrWhiteSpace(state.SquadRandomEffect) ? "-" : state.SquadRandomEffect, "OCR / effect match", "run.squad_card", "ランダム分隊効果がある場合の確定候補");
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
            "rhodes-api",
            "RHODES API",
            "CORE",
            _rhodesApiStatus.State,
            $"{_rhodesApiStatus.Detail} / {RhodesApiUrl}",
            "状態同期",
            false);
        yield return new SukiRuntimeCapabilityPreview(
            "master-data",
            "Master Data",
            "CORE",
            _masterDataStatus.State,
            _masterDataStatus.Detail,
            "件数診断",
            false);
        yield return new SukiRuntimeCapabilityPreview(
            "maa",
            "MAAFramework",
            "CORE",
            _maaFrameworkStatus.State,
            _maaFrameworkStatus.Detail,
            "接続",
            false);
        yield return new SukiRuntimeCapabilityPreview(
            "maa-ocr",
            "MAA-OCR",
            "OCR",
            SelectedOcrEngine?.Label ?? MaaOcrStatusState(),
            $"{SelectedOcrEngine?.Id ?? "profile"} / {MaaOcrStatusDetail()}",
            "認識",
            false);
        yield return new SukiRuntimeCapabilityPreview(
            "glm",
            "GLM-OCR",
            "OPTIONAL",
            _glmRuntimeStatus.State,
            _glmRuntimeStatus.Detail,
            "状態確認",
            !_glmRuntimeStatus.Installed);
        yield return new SukiRuntimeCapabilityPreview(
            "ollama",
            "Ollama",
            "OPTIONAL",
            _ollamaRuntimeStatus.State,
            _ollamaRuntimeStatus.Detail,
            "状態確認",
            !_ollamaRuntimeStatus.Installed);
        yield return new SukiRuntimeCapabilityPreview(
            "hyperv",
            "Hyper-V",
            "PLATFORM",
            _hypervisorStatus.State,
            _hypervisorStatus.Detail,
            "診断",
            false);
    }

    private string MaaOcrStatusState()
    {
        return _allResourceTasks.Count > 0 ? "Resource化済み" : "未生成";
    }

    private string MaaOcrStatusDetail()
    {
        if (_allResourceTasks.Count <= 0)
            return "tools/generate-maa-resource.mjs でResourceを生成してください。";

        var profile = SelectedResourceProfile?.DisplayName ?? "プロファイル未選択";
        return $"{_allResourceTasks.Count} task / {profile}";
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

    private void RefreshRunStatePreviews()
    {
        ReplaceCollection(HeaderStatusChips, BuildHeaderStatusChips());
        ReplaceCollection(RunFieldPreviews, BuildRunFieldPreviews(_runState));
        RefreshSpecialValuePreviews();
        RefreshCampaignPreviews();
        OnPropertyChanged(nameof(CampaignHeaderDetail));
        OnPropertyChanged(nameof(RunContextSummary));
        RefreshInspectorRows();
    }

    private void RefreshChoicesFromRunState(SukiRunStateSnapshot state)
    {
        foreach (var item in _allOperators)
            item.IsSelected = state.SelectedOperatorIds.Contains(item.Id);
        foreach (var item in _allRelics)
            item.IsSelected = state.SelectedRelicIds.Contains(item.Id);
        RefreshChoiceLists();
    }

    private void ReloadRunStateFromStore()
    {
        _runState = RhodesRunCatalog.LoadDefault().Current;
        var campaign = Campaigns.FirstOrDefault(item => string.Equals(item.Id, _runState.CampaignId, StringComparison.Ordinal));
        if (campaign is not null && !string.Equals(campaign.Id, SelectedCampaign?.Id, StringComparison.Ordinal))
            SelectedCampaign = campaign;
        var engine = OcrEngineOptions.FirstOrDefault(item => string.Equals(item.Id, _runState.OcrEngine, StringComparison.Ordinal));
        if (engine is not null)
            SelectedOcrEngine = engine;
        RefreshChoicesFromRunState(_runState);
        RefreshRunStatePreviews();
    }

    private IEnumerable<SukiSpecialValuePreview> BuildSpecialValuePreviews()
    {
        var campaignId = SelectedCampaign?.Id ?? _runState.CampaignId;
        var specialFields = (_runState.SpecialFields ?? Array.Empty<SukiSpecialFieldState>())
            .Where(field => string.Equals(field.CampaignId, campaignId, StringComparison.Ordinal))
            .ToArray();
        if (specialFields.Length > 0)
        {
            foreach (var field in specialFields)
            {
                yield return new SukiSpecialValuePreview(field.Label, field.Value, field.Kind, field.ProfileId, field.Detail);
            }
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
            yield return new SukiInspectorRow("API進捗", RecognitionScanStatus.Summary, RecognitionScanStatus.Detail);
            yield return new SukiInspectorRow(
                "履歴",
                $"{RecognitionScanHistory.Count}件",
                RecognitionScanHistory.FirstOrDefault()?.Detail ?? RhodesSukiDebugPaths.RecognitionScansDirectory);
            yield return new SukiInspectorRow("候補", $"{CandidateResults.Count}件", ResourceTaskDiagnostics.Summary);
            yield return new SukiInspectorRow("適用", LastCandidateApplySummary, "data/current-state.json");
            yield return new SukiInspectorRow(
                "ROIドラフト",
                string.IsNullOrWhiteSpace(LastRoiDraftPath) ? SelectedRoiEditDraft.StatusLabel : LastRoiDraftPath,
                $"{SelectedRoiEditDraft.Detail} / {RoiDraftApplyResult.Message}");
            yield return new SukiInspectorRow(
                "ROIセッション",
                string.IsNullOrWhiteSpace(LastRoiSessionPath) ? $"{RoiBatchDrafts.Count}候補" : LastRoiSessionPath,
                $"{RoiBatchApplyResult.Summary} / 保存{RoiAdjustmentSessions.Count}件");
            yield return new SukiInspectorRow("ROI比較", RoiRescanComparisonSummary, RoiRescanComparisonEvidenceSummary);
            yield return new SukiInspectorRow("MAA Resource", MaaResourceGenerationResult.Message, MaaResourceGenerationResult.OutputPath);
            yield return new SukiInspectorRow(
                "結果JSON",
                string.IsNullOrWhiteSpace(LastResourceTaskResultsPath) ? "-" : LastResourceTaskResultsPath,
                "RHODES OBS COMMANDER3373 Debug Logs");
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
            yield return new SukiInspectorRow("RHODES API", _rhodesApiStatus.State, RhodesApiUrl);
            yield return new SukiInspectorRow("Master Data", _masterDataStatus.State, _masterDataStatus.Detail);
            yield return new SukiInspectorRow("端末", $"{AdbDevices.Count}件", SessionState);
            yield return new SukiInspectorRow("Hyper-V", _hypervisorStatus.State, _hypervisorStatus.Detail);
            yield return new SukiInspectorRow("OCRエンジン", SelectedOcrEngine?.Label ?? "プロファイル既定", SelectedOcrEngine?.Id ?? "profile");
            yield return new SukiInspectorRow("任意OCR", $"GLM={_glmRuntimeStatus.State} / Ollama={_ollamaRuntimeStatus.State}", RhodesApiUrl);
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
            var apiError = await SaveAdbSettingsToApiStateAsync();
            StatusMessage = string.IsNullOrWhiteSpace(apiError)
                ? $"Suki設定とADB API設定を保存しました: {RhodesSukiSettingsStore.DefaultPath}"
                : $"Suki設定を保存しました。ADB API設定の反映は失敗: {apiError}";
        });
    }

    private async Task<string> SaveAdbSettingsToApiStateAsync()
    {
        var fetched = await RhodesStateApiClient.FetchAsync(RhodesApiUrl);
        if (!fetched.Succeeded)
        {
            _rhodesApiStatus = new SukiOptionalRuntimeStatus("RHODES API", "接続失敗", fetched.Error, false, false);
            RefreshRuntimeCapabilities();
            return fetched.Error;
        }

        var choiceOptions = BuildChoicePersistenceOptions();
        var updated = RhodesStateApiClient.ApplyChoicesToStateJson(
            fetched.StateJson,
            _allOperators,
            _allRelics,
            choiceOptions);
        updated = RhodesStateApiClient.ApplyAdbSettingsToStateJson(
            updated,
            new RhodesAdbApiSettings(
                true,
                SelectedAdbPreset?.Id ?? "auto",
                AdbPath,
                AdbSerial));
        updated = RhodesStateApiClient.ApplySukiPreferencesToStateJson(
            updated,
            choiceOptions,
            new SukiOutputPreferences(
                OutputSeparateWindow,
                OutputTournamentMode,
                OutputTransparentBackground,
                OutputScrollSpeed,
                OutputParts.Select(part => new SukiOutputPartState(
                    part.Id,
                    part.Enabled,
                    part.ScrollEnabled,
                    part.HideExcluded,
                    part.Width,
                    part.Height)).ToArray()),
            SelectedOcrEngine?.Id ?? _runState.OcrEngine);
        var saved = await RhodesStateApiClient.SaveAsync(RhodesApiUrl, updated);
        if (!saved.Succeeded)
        {
            _rhodesApiStatus = new SukiOptionalRuntimeStatus("RHODES API", "接続失敗", saved.Error, false, false);
            RefreshRuntimeCapabilities();
            return saved.Error;
        }

        _rhodesApiStatus = RhodesApiStatusProbe.ParseStateJson(saved.StateJson);
        await RhodesRunStateStore.ReplaceStateJsonAsync(saved.StateJson);
        ReloadRunStateFromStore();
        RefreshRuntimeCapabilities();
        return "";
    }

    private async Task<string> SaveRunContextToApiStateAsync(string campaignId)
    {
        var fetched = await RhodesStateApiClient.FetchAsync(RhodesApiUrl);
        if (!fetched.Succeeded)
        {
            _rhodesApiStatus = new SukiOptionalRuntimeStatus("RHODES API", "接続失敗", fetched.Error, false, false);
            RefreshRuntimeCapabilities();
            return fetched.Error;
        }

        var updated = RhodesStateApiClient.ApplyRunContextToStateJson(fetched.StateJson, campaignId);
        var saved = await RhodesStateApiClient.SaveAsync(RhodesApiUrl, updated);
        if (!saved.Succeeded)
        {
            _rhodesApiStatus = new SukiOptionalRuntimeStatus("RHODES API", "接続失敗", saved.Error, false, false);
            RefreshRuntimeCapabilities();
            return saved.Error;
        }

        await RhodesRunStateStore.ReplaceStateJsonAsync(saved.StateJson);
        _rhodesApiStatus = RhodesApiStatusProbe.ParseStateJson(saved.StateJson);
        RefreshRuntimeCapabilities();
        return "";
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

    private Task OpenRecognitionProfileAsync(object? parameter)
    {
        var profileId = parameter as string;
        if (!string.IsNullOrWhiteSpace(profileId))
        {
            var profile = ResourceProfiles.FirstOrDefault(item => string.Equals(item.Id, profileId, StringComparison.Ordinal));
            if (profile is not null)
            {
                SelectedResourceProfile = profile;
            }
            else
            {
                ChoiceTab = "recognition";
                WorkspaceTab = "recognition";
                StatusMessage = $"認識プロファイルが未定義です: {profileId}";
                return Task.CompletedTask;
            }
        }

        ChoiceTab = "recognition";
        WorkspaceTab = "recognition";
        StatusMessage = $"{SelectedResourceProfile?.DisplayName ?? "認識"}を表示しています。";
        return Task.CompletedTask;
    }

    private async Task SetCurrentCampaignAsync(object? parameter)
    {
        var campaignId = parameter switch
        {
            SukiCampaignWorkspacePreview preview => preview.Id,
            SukiCampaignPreview campaign => campaign.Id,
            string id => id,
            _ => "",
        };
        if (string.IsNullOrWhiteSpace(campaignId))
            return;

        if (string.Equals(campaignId, _runState.CampaignId, StringComparison.Ordinal))
        {
            StatusMessage = "このISは既に現在ランです。";
            return;
        }

        await RunBusyAsync(async () =>
        {
            var apiError = await SaveRunContextToApiStateAsync(campaignId);
            if (!string.IsNullOrWhiteSpace(apiError))
                await RhodesRunStateStore.SaveRunContextAsync(campaignId);

            ReloadRunStateFromStore();
            var campaign = Campaigns.FirstOrDefault(item => string.Equals(item.Id, _runState.CampaignId, StringComparison.Ordinal));
            RefreshRunStatePreviews();
            StatusMessage = string.IsNullOrWhiteSpace(apiError)
                ? $"{campaign?.DisplayName ?? campaignId} を現在ランに設定し、APIへ同期しました。"
                : $"{campaign?.DisplayName ?? campaignId} を現在ランに設定しました。API同期は失敗: {apiError}";
        });
    }

    private Task ToggleChoiceSelectedAsync(object? parameter)
    {
        if (parameter is not SukiChoiceItem item)
            return Task.CompletedTask;

        item.IsSelected = !item.IsSelected;
        if (item.IsSelected)
            item.IsExcluded = false;
        RefreshChoiceAfterSelectionMutation(item.Kind);
        PersistChoiceStateInBackground();
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
        RefreshChoiceAfterExclusionMutation(item.Kind);
        PersistChoiceStateInBackground();
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

        RefreshChoiceAfterBulkMutation(ChoiceTab == "relics" ? "relic" : "operator");
        PersistChoiceStateInBackground();
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
            var apiDetection = await RhodesAdbApiClient.DetectAsync(
                RhodesApiUrl,
                new RhodesAdbApiSettings(
                    true,
                    SelectedAdbPreset?.Id ?? "auto",
                    AdbPath,
                    AdbSerial));
            if (apiDetection.Succeeded)
            {
                foreach (var device in apiDetection.Devices)
                {
                    AdbDevices.Add(device);
                }

                var nextAdbPath = new[] { apiDetection.RuntimeAdbPath, apiDetection.SelectedAdbPath }
                    .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
                if (!string.IsNullOrWhiteSpace(nextAdbPath))
                    AdbPath = nextAdbPath;
                if (!string.IsNullOrWhiteSpace(apiDetection.RuntimeSerial))
                    AdbSerial = apiDetection.RuntimeSerial;

                _rhodesApiStatus = new SukiOptionalRuntimeStatus(
                    "RHODES API",
                    "接続済み",
                    $"ADB検出API成功 / candidates={apiDetection.AdbCandidates.Count} / devices={apiDetection.Devices.Count}",
                    true,
                    false);
                StatusMessage = apiDetection.Devices.Count == 0
                    ? $"ADB検出APIは端末0件でした。候補: {apiDetection.AdbCandidates.Count}件"
                    : $"ADB検出APIで端末を取得しました: {apiDetection.Devices.Count}件";
                RefreshRuntimeCapabilities();
                RefreshInspectorRows();
                return;
            }

            var devices = await RhodesAdbDeviceProbe.ListDevicesAsync(AdbPath);
            foreach (var device in devices)
            {
                AdbDevices.Add(device);
            }

            StatusMessage = devices.Count == 0
                ? $"ADB端末は見つかりませんでした。API検出失敗: {apiDetection.Error}"
                : $"ローカルADBで端末を取得しました: {devices.Count}件 (API検出失敗: {apiDetection.Error})";
            RefreshRuntimeCapabilities();
            RefreshInspectorRows();
        });
    }

    private async Task RefreshOptionalRuntimesAsync()
    {
        await RunBusyAsync(async () =>
        {
            StatusMessage = "ランタイム状態を確認しています。";
            var apiTask = RhodesApiStatusProbe.ProbeAsync(RhodesApiUrl);
            var masterTask = RhodesApiStatusProbe.ProbeMasterAsync(RhodesApiUrl, Campaigns.Count, _allOperators.Count, _allRelics.Count);
            var optionalTask = RhodesOptionalRuntimeProbe.ProbeAsync(RhodesApiUrl);
            var hypervisorTask = RhodesHypervisorProbe.ProbeAsync(RhodesApiUrl);
            await Task.WhenAll(apiTask, masterTask, optionalTask, hypervisorTask);
            var snapshot = optionalTask.Result;
            _rhodesApiStatus = apiTask.Result;
            _masterDataStatus = masterTask.Result;
            _glmRuntimeStatus = snapshot.Glm;
            _ollamaRuntimeStatus = snapshot.Ollama;
            _hypervisorStatus = hypervisorTask.Result;
            RefreshRuntimeCapabilities();
            RefreshInspectorRows();
            StatusMessage = $"ランタイム状態: API={_rhodesApiStatus.State}, Master={_masterDataStatus.State}, GLM={snapshot.Glm.State}, Ollama={snapshot.Ollama.State}, Hyper-V={_hypervisorStatus.State}";
        });
    }

    private async Task RunAdbApiTestAsync()
    {
        await RunBusyAsync(async () =>
        {
            StatusMessage = "ADB接続テストAPIを実行しています。";
            var result = await RhodesAdbApiClient.TestAsync(
                RhodesApiUrl,
                new RhodesAdbApiSettings(
                    true,
                    SelectedAdbPreset?.Id ?? "auto",
                    AdbPath,
                    AdbSerial),
                capture: true);
            if (!result.Succeeded)
            {
                _rhodesApiStatus = new SukiOptionalRuntimeStatus("RHODES API", "接続失敗", result.Error, false, false);
                SessionState = "API接続テスト失敗";
                SessionDetail = result.Error;
                StatusMessage = $"ADB接続テストAPI失敗: {result.Error}";
                RefreshRuntimeCapabilities();
                RefreshInspectorRows();
                return;
            }

            if (!string.IsNullOrWhiteSpace(result.RuntimeAdbPath))
                AdbPath = result.RuntimeAdbPath;
            if (!string.IsNullOrWhiteSpace(result.RuntimeSerial))
                AdbSerial = result.RuntimeSerial;

            _rhodesApiStatus = new SukiOptionalRuntimeStatus("RHODES API", "接続済み", "ADB接続テストAPI成功", true, false);
            SessionState = "API接続OK";
            SessionDetail = $"{result.Width}x{result.Height} / {result.RuntimeSerial}";
            LastCapturePath = result.ScreenshotPath;
            CaptureState = result.ScreenshotBytes > 0
                ? $"API撮影: {result.ScreenshotBytes} bytes / {result.CapturedAt}"
                : $"API接続: {result.Width}x{result.Height}";
            if (!string.IsNullOrWhiteSpace(result.ScreenshotPath) && File.Exists(result.ScreenshotPath))
                LastCaptureImage = new Bitmap(result.ScreenshotPath);
            StatusMessage = $"ADB接続テストAPI成功: {result.Width}x{result.Height}";
            RefreshRuntimeCapabilities();
            RefreshInspectorRows();
        });
    }

    private async Task RunOptionalRuntimeActionAsync(
        string label,
        Func<string, HttpClient?, Task<SukiOptionalRuntimeActionResult>> action,
        Action<SukiOptionalRuntimeStatus> applyStatus)
    {
        await RunBusyAsync(async () =>
        {
            StatusMessage = $"{label}を実行しています。";
            var result = await action(RhodesApiUrl, null);
            applyStatus(result.Status);
            _rhodesApiStatus = result.Succeeded
                ? new SukiOptionalRuntimeStatus("RHODES API", "接続済み", $"{label} API実行済み", true, false)
                : new SukiOptionalRuntimeStatus("RHODES API", "接続失敗", result.Error, false, false);
            RefreshRuntimeCapabilities();
            RefreshInspectorRows();
            StatusMessage = result.Succeeded
                ? $"{label}: {result.Status.State}"
                : $"{label}失敗: {result.Error}";
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
            var path = await SaveResourceTaskResultsAsync(
                ResourceTaskResults,
                SelectedResourceProfile?.Id,
                CandidateResults);
            LastResourceTaskResultsPath = path;
            StatusMessage = $"MAA scan証跡を保存しました: {path}";
        });
    }

    private async Task ExportSelectedRoiDraftAsync()
    {
        await RunBusyAsync(async () =>
        {
            if (!SelectedRoiEditDraft.HasSelection)
            {
                StatusMessage = "ROI行を選択してください。";
                return;
            }

            LastRoiDraftPath = await RhodesMaaRoiEditDraftLog.SaveAsync(
                SelectedRoiEditDraft,
                SelectedResourceProfile?.Id,
                RhodesSukiDebugPaths.RoiDraftsDirectory);
            StatusMessage = $"ROIドラフトを保存しました: {LastRoiDraftPath}";
        });
    }

    private async Task ExportRoiAdjustmentSessionAsync()
    {
        await RunBusyAsync(async () =>
        {
            if (RoiBatchDrafts.Count == 0)
            {
                StatusMessage = "保存できるROI調整候補がありません。";
                return;
            }

            LastRoiSessionPath = await RhodesMaaRoiAdjustmentSessionLog.SaveAsync(
                RoiBatchDrafts,
                SelectedResourceProfile?.Id,
                LastResourceTaskResultsPath,
                LastCapturePath,
                RoiBatchApplyResult,
                RhodesSukiDebugPaths.RoiSessionsDirectory,
                comparisonSummary: RoiRescanComparisonSummary,
                comparisonRows: RoiRescanComparisonRows,
                comparisonBeforeLogPath: _lastRoiRescanBeforePath,
                comparisonAfterLogPath: _lastRoiRescanAfterPath);
            RefreshRoiAdjustmentSessions();
            StatusMessage = $"ROI調整セッションを保存しました: {LastRoiSessionPath}";
        });
    }

    private async Task RefreshRoiAdjustmentSessionsAsync()
    {
        await RunBusyAsync(() =>
        {
            RefreshRoiAdjustmentSessions();
            StatusMessage = $"ROI調整セッションを更新しました: {RoiAdjustmentSessions.Count}件";
            return Task.CompletedTask;
        });
    }

    private async Task LoadRoiAdjustmentSessionAsync(MaaRoiAdjustmentSessionItem? item)
    {
        if (item is null)
            return;

        await RunBusyAsync(() =>
        {
            var payload = RhodesMaaRoiAdjustmentSessionLog.Load(item.SessionPath);
            if (payload.SchemaVersion != 1 || payload.Kind != "maa-roi-adjustment-session")
            {
                StatusMessage = $"ROI調整セッションを読み込めません: {item.SessionPath}";
                return Task.CompletedTask;
            }

            if (!string.IsNullOrWhiteSpace(payload.ProfileId))
            {
                SelectedResourceProfile = ResourceProfiles.FirstOrDefault(profile => string.Equals(profile.Id, payload.ProfileId, StringComparison.Ordinal))
                    ?? SelectedResourceProfile;
            }

            LastRoiSessionPath = item.SessionPath;
            var restoredScan = false;
            if (!string.IsNullOrWhiteSpace(payload.ScanLogPath))
            {
                var scanPayload = RhodesRecognitionScanHistory.LoadPayload(payload.ScanLogPath);
                if (scanPayload.Succeeded)
                {
                    LoadRecognitionPayload(scanPayload, payload.ScanLogPath, "ROI調整セッションから読込");
                    restoredScan = true;
                    RoiSessionRestoreNotice = $"復元済み: 元スキャン候補{CandidateResults.Count}件 / task{ResourceTaskResults.Count}件 / log{RecognitionScanLogRows.Count}件";
                }
                else
                {
                    ClearRecognitionPayload(payload.ScanLogPath, "ROI調整セッションから読込");
                    RoiSessionRestoreNotice = $"元スキャンログを復元できません: {scanPayload.Error} / 認識履歴を更新するか、同じ画面を再スキャンしてセッションを保存し直してください。";
                }
            }
            else
            {
                ClearRecognitionPayload("", "ROI調整セッションから読込");
                RoiSessionRestoreNotice = "元スキャンログ未登録: 同じ画面を再スキャンしてからROI調整セッションを保存し直してください。";
            }

            if (!string.IsNullOrWhiteSpace(payload.CapturePath))
                TryLoadCapturePreviewFromPath(payload.CapturePath);
            RoiBatchApplyResult = payload.BatchResult ?? MaaRoiBatchApplyResult.Failed("未確認");
            ReplaceCollection(RoiBatchDrafts, payload.Drafts.Select(draft => draft.ToPreview()));
            ReplaceCollection(RoiRescanComparisonRows, payload.SafeComparisonRows);
            RoiRescanComparisonSummary = payload.SafeComparisonSummary;
            SetRoiRescanComparisonEvidence(payload.SafeComparisonBeforeLogPath, payload.SafeComparisonAfterLogPath);
            RefreshRoiAdjustmentSessions();
            StatusMessage = restoredScan
                ? $"ROI調整セッションを再開しました: 候補{CandidateResults.Count}件 / task{ResourceTaskResults.Count}件 / ROI候補{RoiBatchDrafts.Count}件 / 比較{RoiRescanComparisonRows.Count}件"
                : $"ROI調整セッションを再開しました: ROI候補{RoiBatchDrafts.Count}件 / 比較{RoiRescanComparisonRows.Count}件 / 元スキャン未復元";
            return Task.CompletedTask;
        });
    }

    private async Task RunRoiRescanComparisonAsync()
    {
        await RunBusyAsync(async () =>
        {
            var beforeTaskResults = ResourceTaskResults.ToArray();
            if (beforeTaskResults.Length == 0)
            {
                ClearRoiRescanComparison("比較元のResource task結果がありません。先に元スキャンまたは履歴読込を実行してください。");
                StatusMessage = RoiRescanComparisonSummary;
                return;
            }

            if (!ResourceTasks.Any())
            {
                ClearRoiRescanComparison("選択プロファイルにResource taskがありません。");
                StatusMessage = RoiRescanComparisonSummary;
                return;
            }

            var beforeCandidates = SnapshotCandidatesForComparison(beforeTaskResults, CandidateResults);
            var beforeSourceEntries = CandidateSourceEntries(CandidateApiProfileId(), beforeTaskResults);
            var beforeEvidencePath = await SaveResourceTaskResultsAsync(
                beforeTaskResults,
                SelectedResourceProfile?.Id,
                beforeCandidates);
            await RunAllResourceTasksCoreAsync();
            await ConvertResourceTaskResultsCoreAsync();

            var afterTaskResults = ResourceTaskResults.ToArray();
            var afterCandidates = CandidateResults.ToArray();
            var afterSourceEntries = CandidateSourceEntries(CandidateApiProfileId(), afterTaskResults);
            var comparisonRows = CompareRoiRescanCandidates(
                beforeCandidates,
                afterCandidates,
                beforeSourceEntries,
                afterSourceEntries);
            ReplaceCollection(RoiRescanComparisonRows, comparisonRows);
            RoiRescanComparisonSummary = BuildRoiRescanComparisonSummary(beforeCandidates.Count, afterCandidates.Length, comparisonRows);
            SetRoiRescanComparisonEvidence(beforeEvidencePath, LastResourceTaskResultsPath);
            StatusMessage = RoiRescanComparisonSummary;
            RefreshInspectorRows();
        });
    }

    private Task OpenRoiRescanEvidenceAsync(object? parameter)
    {
        var side = parameter as string;
        var path = string.Equals(side, "after", StringComparison.OrdinalIgnoreCase)
            ? _lastRoiRescanAfterPath
            : _lastRoiRescanBeforePath;
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            StatusMessage = string.Equals(side, "after", StringComparison.OrdinalIgnoreCase)
                ? "after比較証跡が見つかりません。"
                : "before比較証跡が見つかりません。";
            return Task.CompletedTask;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = path,
                UseShellExecute = true,
            });
            StatusMessage = $"比較証跡を開きました: {path}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"比較証跡を開けませんでした: {ex.Message}";
        }

        return Task.CompletedTask;
    }

    private async Task PreviewRoiRescanEvidenceAsync(object? parameter)
    {
        var side = parameter as string;
        var normalizedSide = string.Equals(side, "after", StringComparison.OrdinalIgnoreCase) ? "after" : "before";
        var path = normalizedSide == "after" ? _lastRoiRescanAfterPath : _lastRoiRescanBeforePath;
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            RoiRescanEvidencePreviewTitle = $"{normalizedSide}比較証跡なし";
            RoiRescanEvidencePreviewText = "";
            SelectedRoiRescanEvidencePreviewNode = null;
            ReplaceCollection(RoiRescanEvidencePreviewNodes, Array.Empty<MaaEvidencePreviewNode>());
            StatusMessage = $"{normalizedSide}比較証跡が見つかりません。";
            return;
        }

        var text = await File.ReadAllTextAsync(path);
        RoiRescanEvidencePreviewTitle = $"{normalizedSide}: {path}";
        RoiRescanEvidencePreviewText = BuildRoiRescanEvidencePreview(text, SelectedRoiRescanComparisonRow);
        SelectedRoiRescanEvidencePreviewNode = null;
        ReplaceCollection(RoiRescanEvidencePreviewNodes, BuildRoiRescanEvidencePreviewNodes(text, SelectedRoiRescanComparisonRow));
        StatusMessage = $"比較証跡をプレビューしました: {path}";
    }

    private static string BuildRoiRescanEvidencePreview(string json, MaaRoiRescanComparisonRow? selectedRow)
    {
        if (selectedRow is null
            || (string.IsNullOrWhiteSpace(selectedRow.CandidateKey) && string.IsNullOrWhiteSpace(selectedRow.TaskEntry)))
        {
            return TruncateEvidencePreview(json);
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var options = new JsonSerializerOptions { WriteIndented = true };
            var sections = new List<string>
            {
                $"filter: candidateKey={selectedRow.CandidateKey} / taskEntry={selectedRow.TaskEntry}",
            };

            var matchedCandidates = JsonArray(root, "candidates")
                .Where(candidate => CandidateJsonKey(candidate).Equals(selectedRow.CandidateKey, StringComparison.Ordinal))
                .ToArray();
            if (matchedCandidates.Length > 0)
            {
                sections.Add("candidates:");
                sections.Add(string.Join(
                    "\n",
                    matchedCandidates.Select(candidate => JsonSerializer.Serialize(candidate, options))));
            }

            var matchedTasks = EvidenceTaskResults(root)
                .Where(task => JsonString(task, "entry").Equals(selectedRow.TaskEntry, StringComparison.Ordinal))
                .ToArray();
            if (matchedTasks.Length > 0)
            {
                sections.Add("taskResults:");
                sections.Add(string.Join(
                    "\n",
                    matchedTasks.Select(task => JsonSerializer.Serialize(task, options))));
            }

            var matchedLogRows = JsonArray(root, "log")
                .Where(row => JsonString(row, "entry").Equals(selectedRow.TaskEntry, StringComparison.Ordinal))
                .ToArray();
            if (matchedLogRows.Length > 0)
            {
                sections.Add("log:");
                sections.Add(string.Join(
                    "\n",
                    matchedLogRows.Select(row => JsonSerializer.Serialize(row, options))));
            }

            if (sections.Count == 1)
                sections.Add("matched evidence: none");

            return TruncateEvidencePreview(string.Join("\n\n", sections));
        }
        catch (JsonException)
        {
            return TruncateEvidencePreview(json);
        }
    }

    private static IReadOnlyList<MaaEvidencePreviewNode> BuildRoiRescanEvidencePreviewNodes(
        string json,
        MaaRoiRescanComparisonRow? selectedRow)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var candidates = FilterEvidenceCandidates(JsonArray(root, "candidates"), selectedRow);
            var tasks = FilterEvidenceTasks(EvidenceTaskResults(root), selectedRow);
            var logs = FilterEvidenceTasks(JsonArray(root, "log"), selectedRow);
            return
            [
                new MaaEvidencePreviewNode("Summary", "scan metadata", EvidenceSummary(root)),
                EvidenceSection("Candidates", candidates, CandidateEvidenceTitle),
                EvidenceSection("Resource task results", tasks, TaskEvidenceTitle),
                EvidenceSection("Log", logs, LogEvidenceTitle),
            ];
        }
        catch (JsonException)
        {
            return [new MaaEvidencePreviewNode("Raw JSON", "JSON parse failed", TruncateEvidencePreview(json))];
        }
    }

    private static IReadOnlyList<JsonElement> FilterEvidenceCandidates(
        IEnumerable<JsonElement> candidates,
        MaaRoiRescanComparisonRow? selectedRow)
    {
        var items = candidates.ToArray();
        return selectedRow is null || string.IsNullOrWhiteSpace(selectedRow.CandidateKey)
            ? items
            : items.Where(candidate => CandidateJsonKey(candidate).Equals(selectedRow.CandidateKey, StringComparison.Ordinal)).ToArray();
    }

    private static IReadOnlyList<JsonElement> FilterEvidenceTasks(
        IEnumerable<JsonElement> rows,
        MaaRoiRescanComparisonRow? selectedRow)
    {
        var items = rows.ToArray();
        return selectedRow is null || string.IsNullOrWhiteSpace(selectedRow.TaskEntry)
            ? items
            : items.Where(row => JsonString(row, "entry").Equals(selectedRow.TaskEntry, StringComparison.Ordinal)).ToArray();
    }

    private static MaaEvidencePreviewNode EvidenceSection(
        string title,
        IReadOnlyList<JsonElement> items,
        Func<JsonElement, int, string> titleFactory)
    {
        const int maxChildren = 80;
        var options = new JsonSerializerOptions { WriteIndented = true };
        var children = items
            .Take(maxChildren)
            .Select((item, index) => new MaaEvidencePreviewNode(
                titleFactory(item, index),
                EvidenceNodeDetail(item),
                JsonSerializer.Serialize(item, options)))
            .ToList();
        if (items.Count > maxChildren)
        {
            children.Add(new MaaEvidencePreviewNode(
                "truncated",
                $"{items.Count - maxChildren} items hidden",
                $"The preview tree shows the first {maxChildren} of {items.Count} items."));
        }

        return new MaaEvidencePreviewNode(title, $"{items.Count} item(s)", "", children);
    }

    private static string EvidenceSummary(JsonElement root)
    {
        var summary = new[]
        {
            $"profileId: {JsonString(root, "profileId")}",
            $"status: {JsonString(root, "status")}",
            $"source: {JsonString(root, "source")}",
            $"startedAt: {JsonString(root, "startedAt")}",
            $"completedAt: {JsonString(root, "completedAt")}",
            $"counts: {EvidenceCounts(root)}",
        };
        return string.Join(Environment.NewLine, summary);
    }

    private static string EvidenceCounts(JsonElement root)
    {
        return root.ValueKind == JsonValueKind.Object
            && root.TryGetProperty("counts", out var counts)
            ? counts.GetRawText()
            : "{}";
    }

    private static string CandidateEvidenceTitle(JsonElement item, int index)
    {
        return FirstNonEmpty(JsonString(item, "label"), JsonString(item, "field"), JsonString(item, "kind"), $"candidate {index + 1}");
    }

    private static string TaskEvidenceTitle(JsonElement item, int index)
    {
        return FirstNonEmpty(JsonString(item, "entry"), $"task {index + 1}");
    }

    private static string LogEvidenceTitle(JsonElement item, int index)
    {
        return FirstNonEmpty(JsonString(item, "event"), JsonString(item, "entry"), $"log {index + 1}");
    }

    private static string EvidenceNodeDetail(JsonElement item)
    {
        var parts = new[]
        {
            JsonString(item, "kind"),
            JsonString(item, "entry"),
            JsonString(item, "status"),
            JsonString(item, "value"),
        }.Where(part => !string.IsNullOrWhiteSpace(part));
        return string.Join(" / ", parts);
    }

    private static IReadOnlyList<JsonElement> JsonArray(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.Array
            ? property.EnumerateArray().ToArray()
            : [];
    }

    private static IReadOnlyList<JsonElement> EvidenceTaskResults(JsonElement root)
    {
        return root.ValueKind == JsonValueKind.Object
            && root.TryGetProperty("evidence", out var evidence)
            ? JsonArray(evidence, "taskResults")
            : [];
    }

    private static string CandidateJsonKey(JsonElement candidate)
    {
        var field = JsonString(candidate, "field");
        if (!string.IsNullOrWhiteSpace(field))
            return $"field:{field}:{JsonString(candidate, "campaignId")}:{JsonString(candidate, "fieldId")}:{JsonString(candidate, "slotKind")}";
        var operatorId = JsonString(candidate, "operatorId");
        if (!string.IsNullOrWhiteSpace(operatorId))
            return $"operator:{operatorId}";
        var relicId = JsonString(candidate, "relicId");
        if (!string.IsNullOrWhiteSpace(relicId))
            return $"relic:{JsonString(candidate, "campaignId")}:{relicId}";
        var thoughtId = JsonString(candidate, "thoughtId");
        if (!string.IsNullOrWhiteSpace(thoughtId))
            return $"thought:{JsonString(candidate, "campaignId")}:{thoughtId}";
        var ageId = JsonString(candidate, "ageId");
        if (!string.IsNullOrWhiteSpace(ageId))
            return $"age:{JsonString(candidate, "campaignId")}:{ageId}";
        var effectId = JsonString(candidate, "effectId");
        if (!string.IsNullOrWhiteSpace(effectId))
            return $"effect:{JsonString(candidate, "campaignId")}:{effectId}:{JsonString(candidate, "slotKind")}";
        var coinId = JsonString(candidate, "coinId");
        if (!string.IsNullOrWhiteSpace(coinId))
            return $"coin:{JsonString(candidate, "campaignId")}:{coinId}";
        var statusId = JsonString(candidate, "statusId");
        if (!string.IsNullOrWhiteSpace(statusId))
            return $"status:{JsonString(candidate, "campaignId")}:{statusId}";

        return FirstNonEmpty(JsonString(candidate, "recognitionKey"), JsonString(candidate, "campaignId"));
    }

    private static string JsonString(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.String
            ? property.GetString() ?? ""
            : "";
    }

    private static string TruncateEvidencePreview(string text)
    {
        const int maxPreviewLength = 60000;
        return text.Length <= maxPreviewLength
            ? text
            : $"{text[..maxPreviewLength]}\n... truncated {text.Length - maxPreviewLength} chars ...";
    }

    private async Task PreviewSelectedRoiDraftApplyAsync()
    {
        await RunBusyAsync(async () =>
        {
            if (!SelectedRoiEditDraft.HasSelection)
            {
                RoiDraftApplyResult = MaaRoiDraftApplyResult.Failed("ROI行を選択してください。");
                StatusMessage = RoiDraftApplyResult.Message;
                return;
            }

            var sourcePath = ResolveRoiDraftSourcePath(SelectedRoiEditDraft);
            if (!File.Exists(sourcePath))
            {
                RoiDraftApplyResult = MaaRoiDraftApplyResult.Failed($"ROI生成元JSONが見つかりません: {sourcePath}");
                StatusMessage = RoiDraftApplyResult.Message;
                return;
            }

            var json = await File.ReadAllTextAsync(sourcePath);
            var result = RhodesMaaRoiDraftSourceUpdater.ApplyToSourceJson(json, SelectedRoiEditDraft, out _);
            RoiDraftApplyResult = result with { SourcePath = result.Succeeded ? sourcePath : result.SourcePath };
            StatusMessage = result.Succeeded
                ? $"ROI適用プレビュー: {result.TargetId} {result.PreviousRoi} -> {result.UpdatedRoi}"
                : $"ROI適用プレビュー失敗: {result.Message}";
        });
    }

    private async Task SelectRoiPreviewAsync(MaaRoiPreviewRow? row)
    {
        if (row is null)
            return;

        await RunBusyAsync(() =>
        {
            SelectedRoiPreviewRow = row;
            StatusMessage = $"ROIを選択しました: {row.DisplayTitle} / {row.ProjectedRoiJson}";
            return Task.CompletedTask;
        });
    }

    public void BeginRoiDrag(MaaRoiPreviewRow? row, double pointerX, double pointerY)
    {
        if (row is null)
            return;

        SelectedRoiPreviewRow = row;
        if (!TryParseDraftRoi(SelectedRoiEditDraft.RoiJson, out var roi))
            return;

        _roiDragOrigin = roi;
        _roiDragStartX = pointerX;
        _roiDragStartY = pointerY;
        StatusMessage = $"ROIドラッグ開始: {row.DisplayTitle}";
    }

    public void UpdateRoiDrag(double pointerX, double pointerY)
    {
        if (_roiDragOrigin.Length != 4 || !SelectedRoiEditDraft.HasSelection)
            return;

        var adjusted = _roiDragOrigin.ToArray();
        adjusted[0] = Math.Max(0, adjusted[0] + SnapDelta(pointerX - _roiDragStartX));
        adjusted[1] = Math.Max(0, adjusted[1] + SnapDelta(pointerY - _roiDragStartY));
        SelectedRoiEditDraft = SelectedRoiEditDraft with { RoiJson = RoiJson(adjusted) };
        UpdateSelectedRoiOverlay(adjusted);
        UpdateRoiBatchDraftForSelected();
        RoiDraftApplyResult = MaaRoiDraftApplyResult.Failed("未確認");
    }

    public void EndRoiDrag()
    {
        if (_roiDragOrigin.Length == 0)
            return;

        _roiDragOrigin = [];
        StatusMessage = $"ROIドラッグ終了: {SelectedRoiEditDraft.RoiJson}";
    }

    public void BeginRoiResize(MaaRoiPreviewRow? row, double pointerX, double pointerY, string? mode)
    {
        if (row is null)
            return;

        SelectedRoiPreviewRow = row;
        if (!TryParseDraftRoi(SelectedRoiEditDraft.RoiJson, out var roi))
            return;

        _roiResizeOrigin = roi;
        _roiResizeMode = string.IsNullOrWhiteSpace(mode) ? "bottomRight" : mode;
        _roiResizeStartX = pointerX;
        _roiResizeStartY = pointerY;
        StatusMessage = $"ROIリサイズ開始: {row.DisplayTitle} / {_roiResizeMode}";
    }

    public void UpdateRoiResize(double pointerX, double pointerY)
    {
        if (_roiResizeOrigin.Length != 4 || !SelectedRoiEditDraft.HasSelection)
            return;

        var adjusted = _roiResizeOrigin.ToArray();
        var dx = SnapDelta(pointerX - _roiResizeStartX);
        var dy = SnapDelta(pointerY - _roiResizeStartY);
        if (_roiResizeMode.Equals("topLeft", StringComparison.Ordinal) || _roiResizeMode.Equals("left", StringComparison.Ordinal))
        {
            var nextX = Math.Clamp(adjusted[0] + dx, 0, adjusted[0] + adjusted[2] - 1);
            var nextY = Math.Clamp(adjusted[1] + dy, 0, adjusted[1] + adjusted[3] - 1);
            adjusted[2] = Math.Max(1, adjusted[2] - (nextX - adjusted[0]));
            adjusted[0] = nextX;
            if (_roiResizeMode.Equals("topLeft", StringComparison.Ordinal))
            {
                adjusted[3] = Math.Max(1, adjusted[3] - (nextY - adjusted[1]));
                adjusted[1] = nextY;
            }
        }
        else if (_roiResizeMode.Equals("top", StringComparison.Ordinal))
        {
            var nextY = Math.Clamp(adjusted[1] + dy, 0, adjusted[1] + adjusted[3] - 1);
            adjusted[3] = Math.Max(1, adjusted[3] - (nextY - adjusted[1]));
            adjusted[1] = nextY;
        }
        else if (_roiResizeMode.Equals("right", StringComparison.Ordinal))
        {
            adjusted[2] = Math.Max(1, adjusted[2] + dx);
        }
        else if (_roiResizeMode.Equals("bottom", StringComparison.Ordinal))
        {
            adjusted[3] = Math.Max(1, adjusted[3] + dy);
        }
        else
        {
            adjusted[2] = Math.Max(1, adjusted[2] + dx);
            adjusted[3] = Math.Max(1, adjusted[3] + dy);
        }
        SelectedRoiEditDraft = SelectedRoiEditDraft with { RoiJson = RoiJson(adjusted) };
        UpdateSelectedRoiOverlay(adjusted);
        UpdateRoiBatchDraftForSelected();
        RoiDraftApplyResult = MaaRoiDraftApplyResult.Failed("未確認");
    }

    public void EndRoiResize()
    {
        if (_roiResizeOrigin.Length == 0)
            return;

        _roiResizeOrigin = [];
        _roiResizeMode = "";
        StatusMessage = $"ROIリサイズ終了: {SelectedRoiEditDraft.RoiJson}";
    }

    public void CancelRoiInteraction()
    {
        if (_roiDragOrigin.Length == 4)
        {
            RestoreSelectedRoi(_roiDragOrigin, "ROIドラッグをキャンセルしました。");
            _roiDragOrigin = [];
            return;
        }

        if (_roiResizeOrigin.Length == 4)
        {
            RestoreSelectedRoi(_roiResizeOrigin, "ROIリサイズをキャンセルしました。");
            _roiResizeOrigin = [];
            _roiResizeMode = "";
        }
    }

    private async Task SetRoiSnapStepAsync(string? value)
    {
        await RunBusyAsync(() =>
        {
            if (int.TryParse(value, out var step))
                RoiSnapStep = step;
            OnPropertyChanged(nameof(RoiSnapStepLabel));
            StatusMessage = $"ROI調整ステップ: {RoiSnapStep}px";
            return Task.CompletedTask;
        });
    }

    private async Task ResetSelectedRoiDraftAsync()
    {
        await RunBusyAsync(() =>
        {
            if (_selectedRoiPreviewRow is null)
            {
                RoiDraftApplyResult = MaaRoiDraftApplyResult.Failed("ROI行を選択してください。");
                StatusMessage = RoiDraftApplyResult.Message;
                return Task.CompletedTask;
            }

            if (TryParseDraftRoi(MaaRoiEditDraft.FromPreview(_selectedRoiPreviewRow).RoiJson, out var roi))
                RestoreSelectedRoi(roi, "ROIを元に戻しました。");
            return Task.CompletedTask;
        });
    }

    private async Task AdjustSelectedRoiDraftAsync(string? operation)
    {
        await RunBusyAsync(() =>
        {
            if (!SelectedRoiEditDraft.HasSelection)
            {
                RoiDraftApplyResult = MaaRoiDraftApplyResult.Failed("ROI行を選択してください。");
                StatusMessage = RoiDraftApplyResult.Message;
                return Task.CompletedTask;
            }

            if (!TryParseDraftRoi(SelectedRoiEditDraft.RoiJson, out var roi))
            {
                RoiDraftApplyResult = MaaRoiDraftApplyResult.Failed("ROI座標JSONを解析できません。");
                StatusMessage = RoiDraftApplyResult.Message;
                return Task.CompletedTask;
            }

            var adjusted = AdjustRoi(roi, operation, RoiSnapStep);
            SelectedRoiEditDraft = SelectedRoiEditDraft with { RoiJson = RoiJson(adjusted) };
            UpdateSelectedRoiOverlay(adjusted);
            UpdateRoiBatchDraftForSelected();
            RoiDraftApplyResult = MaaRoiDraftApplyResult.Failed("未確認");
            StatusMessage = $"ROIを調整しました: {SelectedRoiEditDraft.RoiJson}";
            return Task.CompletedTask;
        });
    }

    private async Task ApplySelectedRoiDraftAsync()
    {
        await RunBusyAsync(async () =>
        {
            if (!SelectedRoiEditDraft.HasSelection)
            {
                RoiDraftApplyResult = MaaRoiDraftApplyResult.Failed("ROI行を選択してください。");
                StatusMessage = RoiDraftApplyResult.Message;
                return;
            }

            var sourcePath = ResolveRoiDraftSourcePath(SelectedRoiEditDraft);
            var result = await RhodesMaaRoiDraftSourceUpdater.ApplyToSourceFileAsync(sourcePath, SelectedRoiEditDraft);
            RoiDraftApplyResult = result;
            StatusMessage = result.Succeeded
                ? $"ROIを適用しました: {result.TargetId} / backup={result.BackupPath}"
                : $"ROI適用失敗: {result.Message}";
        });
    }

    private async Task PreviewVisibleRoiDraftsApplyAsync()
    {
        await RunBusyAsync(async () =>
        {
            var drafts = VisibleResourceRoiDrafts();
            if (drafts.Count == 0)
            {
                RoiBatchApplyResult = MaaRoiBatchApplyResult.Failed("表示中のResource ROI候補がありません。");
                StatusMessage = RoiBatchApplyResult.Message;
                return;
            }

            var maaTasksPath = ResolveMaaTasksSourcePath();
            var scanProfilesPath = ResolveScanProfilesSourcePath();
            if (!File.Exists(maaTasksPath) || !File.Exists(scanProfilesPath))
            {
                RoiBatchApplyResult = MaaRoiBatchApplyResult.Failed($"ROI生成元JSONが見つかりません: maa={maaTasksPath} / scan={scanProfilesPath}");
                StatusMessage = RoiBatchApplyResult.Message;
                return;
            }

            var result = RhodesMaaRoiDraftBatchSourceUpdater.ApplyToSourceJsons(
                await File.ReadAllTextAsync(maaTasksPath),
                await File.ReadAllTextAsync(scanProfilesPath),
                drafts,
                out _,
                out _);
            RoiBatchApplyResult = result;
            UpdateRoiBatchDraftStates(result, result.Succeeded ? "確認済み" : "失敗");
            StatusMessage = result.Succeeded
                ? $"ROI一括適用プレビュー: {result.AppliedCount}件"
                : $"ROI一括適用プレビュー失敗: {result.Message}";
        });
    }

    private async Task ApplyVisibleRoiDraftsAsync()
    {
        await RunBusyAsync(async () =>
        {
            var drafts = VisibleResourceRoiDrafts();
            if (drafts.Count == 0)
            {
                RoiBatchApplyResult = MaaRoiBatchApplyResult.Failed("表示中のResource ROI候補がありません。");
                StatusMessage = RoiBatchApplyResult.Message;
                return;
            }

            var result = await RhodesMaaRoiDraftBatchSourceUpdater.ApplyToSourceFilesAsync(
                ResolveMaaTasksSourcePath(),
                ResolveScanProfilesSourcePath(),
                drafts);
            RoiBatchApplyResult = result;
            UpdateRoiBatchDraftStates(result, result.Succeeded ? "適用済み" : "失敗");
            StatusMessage = result.Succeeded
                ? $"ROIを一括適用しました: {result.AppliedCount}件 / {result.BackupSummary}"
                : $"ROI一括適用失敗: {result.Message}";
        });
    }

    private Task SetAllRoiBatchDraftsIncludedAsync(bool isIncluded)
    {
        var next = RoiBatchDrafts
            .Select(item =>
            {
                var stateLabel = isIncluded && item.StateLabel == "対象外" ? "未確認" : item.StateLabel;
                return new MaaRoiBatchDraftPreview(
                    item.Draft,
                    isIncluded,
                    isIncluded ? stateLabel : "対象外",
                    isIncluded ? item.StateDetail : "");
            })
            .ToArray();
        ReplaceCollection(RoiBatchDrafts, next);
        RoiBatchApplyResult = MaaRoiBatchApplyResult.Failed("未確認");
        StatusMessage = isIncluded
            ? $"表示中ROI候補を全選択しました: {next.Length}件"
            : $"表示中ROI候補を全解除しました: {next.Length}件";
        return Task.CompletedTask;
    }

    private void UpdateRoiBatchDraftStates(MaaRoiBatchApplyResult result, string successStateLabel)
    {
        if (result.Results.Count == 0)
            return;

        var resultIndex = 0;
        var next = RoiBatchDrafts
            .Select(item =>
            {
                if (!item.IsIncluded)
                    return new MaaRoiBatchDraftPreview(item.Draft, false, "対象外", "");

                if (resultIndex >= result.Results.Count)
                    return new MaaRoiBatchDraftPreview(item.Draft, true, "未確認", item.StateDetail);

                var itemResult = result.Results[resultIndex++];
                return itemResult.Succeeded
                    ? new MaaRoiBatchDraftPreview(item.Draft, true, successStateLabel, itemResult.DiffSummary)
                    : new MaaRoiBatchDraftPreview(item.Draft, true, "失敗", itemResult.Message);
            })
            .ToArray();
        ReplaceCollection(RoiBatchDrafts, next);
    }

    private async Task RegenerateMaaResourceAsync()
    {
        await RunBusyAsync(async () =>
        {
            MaaResourceGenerationResult = await RhodesMaaGeneratedResourceBuilder.RegenerateFileAsync(
                ResolveMaaTasksSourcePath(),
                ResolveScanProfilesSourcePath(),
                ResolveGeneratedPipelinePath());
            if (!MaaResourceGenerationResult.Succeeded)
            {
                StatusMessage = $"MAA Resource再生成失敗: {MaaResourceGenerationResult.Message}";
                return;
            }

            var message = $"{MaaResourceGenerationResult.Message} / backup={MaaResourceGenerationResult.BackupPath}";
            ReloadResourceCatalog();
            var reloadSnapshot = await ReloadMaaResourceSessionIfReadyAsync();
            StatusMessage = reloadSnapshot is null
                ? $"{message} / 未接続のため次回接続時に反映"
                : reloadSnapshot.IsReady
                    ? $"{message} / Resource再読込済み"
                    : $"{message} / Resource再読込失敗: {reloadSnapshot.Detail}";
        });
    }

    private async Task<MaaSessionSnapshot?> ReloadMaaResourceSessionIfReadyAsync()
    {
        if (!string.Equals(SessionState, "接続済み", StringComparison.Ordinal))
            return null;

        var snapshot = await _session.InitializeAdbAsync(BuildSessionOptions());
        SessionState = snapshot.State;
        SessionDetail = snapshot.IsReady
            ? $"{snapshot.Detail} / Resource再読込済み"
            : $"{snapshot.Detail} / Resource再読込失敗";
        RefreshInspectorRows();
        return snapshot;
    }

    private async Task SyncRunStateFromApiAsync()
    {
        await RunBusyAsync(async () =>
        {
            StatusMessage = "API状態を読み込んでいます。";
            var error = await SyncRunStateFromApiCoreAsync();
            StatusMessage = string.IsNullOrWhiteSpace(error)
                ? "API状態をSuki表示へ同期しました。"
                : $"API状態同期に失敗しました: {error}";
        });
    }

    private async Task ConvertResourceTaskResultsAsync()
    {
        await RunBusyAsync(ConvertResourceTaskResultsCoreAsync);
    }

    private async Task ApplyCandidateResultsAsync()
    {
        await RunBusyAsync(ApplyCandidateResultsCoreAsync);
    }

    private async Task ApplyCandidateResultsCoreAsync()
    {
        if (!CandidateResults.Any())
        {
            LastCandidateApplySummary = "反映なし: 候補0件";
            StatusMessage = "反映する候補がありません。";
            RefreshInspectorRows();
            return;
        }

        var (summary, apiError) = await SaveCandidateResultsToApiStateAsync();
        if (!string.IsNullOrWhiteSpace(apiError))
            summary = await RhodesRunStateStore.SaveCandidatesAsync(CandidateResults);

        if (summary.AppliedCount <= 0)
        {
            LastCandidateApplySummary = $"反映なし: 無視 {summary.IgnoredCount}件";
            StatusMessage = string.IsNullOrWhiteSpace(apiError)
                ? $"状態へ反映できる候補はありませんでした。無視: {summary.IgnoredCount}件"
                : $"状態へ反映できる候補はありませんでした。API同期は失敗: {apiError}";
            RefreshInspectorRows();
            return;
        }

        ReloadRunStateFromStore();
        LastCandidateApplySummary = $"{summary.AppliedCount}件: {string.Join(", ", summary.AppliedFields)}";
        StatusMessage = string.IsNullOrWhiteSpace(apiError)
            ? $"状態へ反映し、APIへ同期しました: {summary.AppliedCount}件 ({string.Join(", ", summary.AppliedFields)})"
            : $"状態へ反映しました: {summary.AppliedCount}件 ({string.Join(", ", summary.AppliedFields)}) / API同期失敗: {apiError}";
        RefreshInspectorRows();
    }

    private async Task<(SukiCandidateApplySummary Summary, string Error)> SaveCandidateResultsToApiStateAsync()
    {
        var fetched = await RhodesStateApiClient.FetchAsync(RhodesApiUrl);
        if (!fetched.Succeeded)
        {
            _rhodesApiStatus = new SukiOptionalRuntimeStatus("RHODES API", "接続失敗", fetched.Error, false, false);
            RefreshRuntimeCapabilities();
            return (SukiCandidateApplySummary.Empty, fetched.Error);
        }

        var applied = RhodesStateApiClient.ApplyCandidatesToStateJson(fetched.StateJson, CandidateResults);
        if (applied.Summary.AppliedCount <= 0)
            return (applied.Summary, "");

        var saved = await RhodesStateApiClient.SaveAsync(RhodesApiUrl, applied.StateJson);
        if (!saved.Succeeded)
        {
            _rhodesApiStatus = new SukiOptionalRuntimeStatus("RHODES API", "接続失敗", saved.Error, false, false);
            RefreshRuntimeCapabilities();
            return (SukiCandidateApplySummary.Empty, saved.Error);
        }

        await RhodesRunStateStore.ReplaceStateJsonAsync(saved.StateJson);
        _rhodesApiStatus = RhodesApiStatusProbe.ParseStateJson(saved.StateJson);
        RefreshRuntimeCapabilities();
        return (applied.Summary, "");
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

    private async Task RunSelectedProfileRecognitionAndApplyAsync()
    {
        await RunBusyAsync(async () =>
        {
            StatusMessage = "選択プロファイルの認識と反映を開始します。";
            var capture = await CaptureCoreAsync();
            if (capture?.Succeeded != true)
                return;

            await RunAllResourceTasksCoreAsync();
            await ConvertResourceTaskResultsCoreAsync();
            await ApplyCandidateResultsCoreAsync();
        });
    }

    private async Task RunSelectedProfileAdbScanAsync()
    {
        await RunBusyAsync(async () =>
        {
            var profileId = CandidateApiProfileId();
            if (string.IsNullOrWhiteSpace(profileId))
            {
                StatusMessage = "allプロファイルでは既存ADBスキャンAPIを実行できません。";
                return;
            }

            ClearRoiRescanComparison();
            CandidateResults.Clear();
            ResourceTaskResults.Clear();
            RecognitionScanLogRows.Clear();
            LastCandidateApplySummary = "既存ADBスキャンAPI実行";
            RefreshResourceTaskDiagnostics();
            RefreshInspectorRows();
            StatusMessage = $"既存ADBスキャンAPIを開始します: {profileId}";

            var result = await RhodesRecognitionScanApiClient.RunAsync(RhodesApiUrl, profileId);
            RecognitionScanStatus = await RhodesRecognitionScanStatusClient.FetchAsync(RhodesApiUrl);
            if (!result.Succeeded)
            {
                StatusMessage = $"既存ADBスキャンAPI失敗: {result.Error}";
                RefreshInspectorRows();
                return;
            }

            foreach (var candidate in result.Candidates)
            {
                CandidateResults.Add(candidate);
            }

            var syncError = await SyncRunStateFromApiCoreAsync();
            LastResourceTaskResultsPath = result.LogPath;
            var savedPayload = RhodesRecognitionScanHistory.LoadPayload(result.LogPath);
            if (savedPayload.Succeeded)
            {
                RecognitionScanLogRows.Clear();
                foreach (var logRow in savedPayload.LogRows)
                {
                    RecognitionScanLogRows.Add(logRow);
                }
                TryLoadCapturePreviewFromPath(savedPayload.FirstImagePath);
            }
            var syncSummary = string.IsNullOrWhiteSpace(syncError)
                ? "API状態同期済み"
                : $"API状態同期失敗: {syncError}";
            StatusMessage = result.HasCandidates
                ? $"既存ADBスキャンAPI完了: {result.Candidates.Count}候補 / {result.Status} / {syncSummary}"
                : $"既存ADBスキャンAPI完了: {result.Status} / {syncSummary}";
            RefreshInspectorRows();
        });
    }

    private async Task RefreshRecognitionScanStatusAsync()
    {
        await RunBusyAsync(async () =>
        {
            StatusMessage = "認識スキャン進捗を確認しています。";
            RecognitionScanStatus = await RhodesRecognitionScanStatusClient.FetchAsync(RhodesApiUrl);
            _rhodesApiStatus = RecognitionScanStatus.Succeeded
                ? new SukiOptionalRuntimeStatus("RHODES API", "接続済み", "scan status取得済み", true, false)
                : new SukiOptionalRuntimeStatus("RHODES API", "接続失敗", RecognitionScanStatus.Error, false, false);
            RefreshRuntimeCapabilities();
            if (!string.IsNullOrWhiteSpace(RecognitionScanStatus.LastLogPath))
                LastResourceTaskResultsPath = RecognitionScanStatus.LastLogPath;
            else
                RefreshRecognitionScanHistory();
            RefreshInspectorRows();
            StatusMessage = RecognitionScanStatus.Succeeded
                ? $"認識スキャン進捗: {RecognitionScanStatus.Summary}"
                : $"認識スキャン進捗取得失敗: {RecognitionScanStatus.Error}";
        });
    }

    private async Task RefreshRecognitionScanHistoryAsync()
    {
        await RunBusyAsync(() =>
        {
            RefreshRecognitionScanHistory();
            StatusMessage = $"認識履歴を更新しました: {RecognitionScanHistory.Count}件";
            return Task.CompletedTask;
        });
    }

    private void RefreshRecognitionScanHistory()
    {
        ReplaceCollection(
            RecognitionScanHistory,
            RhodesRecognitionScanHistory.LoadRecent(
                RhodesSukiDebugPaths.RecognitionScansDirectory,
                [LastResourceTaskResultsPath]));
        RefreshInspectorRows();
    }

    private void RefreshRoiAdjustmentSessions()
    {
        ReplaceCollection(
            RoiAdjustmentSessions,
            RhodesMaaRoiAdjustmentSessionLog.LoadRecent(RhodesSukiDebugPaths.RoiSessionsDirectory));
        RefreshInspectorRows();
    }

    private async Task LoadRecognitionScanHistoryAsync(RhodesRecognitionScanHistoryItem? item)
    {
        if (item is null)
            return;

        await RunBusyAsync(() =>
        {
            var payload = RhodesRecognitionScanHistory.LoadPayload(item.LogPath);
            if (!payload.Succeeded)
            {
                StatusMessage = $"認識履歴の読込に失敗しました: {payload.Error}";
                return Task.CompletedTask;
            }

            LoadRecognitionPayload(payload, item.LogPath, "履歴から読込");
            StatusMessage = $"認識履歴を読み込みました: 候補{CandidateResults.Count}件 / task{ResourceTaskResults.Count}件 / log{RecognitionScanLogRows.Count}件";
            return Task.CompletedTask;
        });
    }

    private void LoadRecognitionPayload(
        RhodesRecognitionScanHistoryPayload payload,
        string logPath,
        string candidateApplySummary)
    {
        ClearRoiRescanComparison();
        CandidateResults.Clear();
        foreach (var candidate in payload.Candidates)
        {
            CandidateResults.Add(candidate);
        }

        ResourceTaskResults.Clear();
        RecognitionScanLogRows.Clear();
        foreach (var taskResult in payload.TaskResults)
        {
            ResourceTaskResults.Add(taskResult);
        }

        foreach (var logRow in payload.LogRows)
        {
            RecognitionScanLogRows.Add(logRow);
        }
        TryLoadCapturePreviewFromPath(payload.FirstImagePath);

        LastResourceTaskResultsPath = logPath;
        LastCandidateApplySummary = candidateApplySummary;
        RefreshResourceTaskDiagnostics();
        RefreshInspectorRows();
    }

    private void ClearRecognitionPayload(string logPath, string candidateApplySummary)
    {
        ClearRoiRescanComparison();
        CandidateResults.Clear();
        ResourceTaskResults.Clear();
        RecognitionScanLogRows.Clear();
        LastResourceTaskResultsPath = logPath;
        LastCandidateApplySummary = candidateApplySummary;
        RefreshResourceTaskDiagnostics();
        RefreshInspectorRows();
    }

    private Task OpenPreviewUrlAsync(object? parameter)
    {
        var path = parameter as string;
        var url = RhodesPreviewUrlBuilder.Build(RhodesApiUrl, path ?? "/control-v2");
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true,
            });
            StatusMessage = $"プレビューを開きました: {url}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"プレビューを開けませんでした: {ex.Message}";
        }

        return Task.CompletedTask;
    }

    private async Task<string> SyncRunStateFromApiCoreAsync()
    {
        var result = await RhodesStateApiClient.FetchAsync(RhodesApiUrl);
        if (!result.Succeeded)
        {
            _rhodesApiStatus = new SukiOptionalRuntimeStatus("RHODES API", "接続失敗", result.Error, false, false);
            RefreshRuntimeCapabilities();
            return result.Error;
        }

        await RhodesRunStateStore.ReplaceStateJsonAsync(result.StateJson);
        _rhodesApiStatus = RhodesApiStatusProbe.ParseStateJson(result.StateJson);
        RefreshRuntimeCapabilities();
        ReloadRunStateFromStore();
        return "";
    }

    private async Task RunAllResourceTasksCoreAsync()
    {
        ClearRoiRescanComparison();
        ResourceTaskResults.Clear();
        CandidateResults.Clear();
        RecognitionScanLogRows.Clear();
        LastCandidateApplySummary = "候補未反映";
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
        if (ResourceTaskResults.Any())
        {
            var localCandidates = RhodesMaaLocalCandidateConverter.FromTaskResults(
                CandidateApiProfileId(),
                ResourceTaskResults);
            LastResourceTaskResultsPath = await SaveResourceTaskResultsAsync(
                ResourceTaskResults,
                SelectedResourceProfile?.Id,
                localCandidates);
            StatusMessage = $"MAA scan証跡を保存しました: {LastResourceTaskResultsPath}";
        }
    }

    private async Task ConvertResourceTaskResultsCoreAsync()
    {
        if (!ResourceTaskResults.Any())
        {
            StatusMessage = "先にResource taskを実行してください。";
            return;
        }

        CandidateResults.Clear();
        var apiResult = await RhodesMaaCandidateApiClient.ConvertAsync(
            RhodesApiUrl,
            CandidateApiProfileId(),
            ResourceTaskResults);
        var localCandidates = RhodesMaaLocalCandidateConverter.FromTaskResults(
            CandidateApiProfileId(),
            ResourceTaskResults);

        if (apiResult.HasCandidates)
        {
            var mergedCandidates = RhodesMaaCandidateMerger.Merge(apiResult.Candidates, localCandidates);
            foreach (var candidate in mergedCandidates)
            {
                CandidateResults.Add(candidate);
            }
            RefreshInspectorRows();
            LastResourceTaskResultsPath = await SaveResourceTaskResultsAsync(
                ResourceTaskResults,
                SelectedResourceProfile?.Id,
                CandidateResults);
            var supplementalCount = CandidateResults.Count - apiResult.Candidates.Count;
            StatusMessage = supplementalCount > 0
                ? $"候補化しました: {CandidateResults.Count}件 (ローカル補完 +{supplementalCount})"
                : $"候補化しました: {CandidateResults.Count}件";
            return;
        }
        if (localCandidates.Count > 0)
        {
            foreach (var candidate in localCandidates)
            {
                CandidateResults.Add(candidate);
            }

            RefreshInspectorRows();
            LastResourceTaskResultsPath = await SaveResourceTaskResultsAsync(
                ResourceTaskResults,
                SelectedResourceProfile?.Id,
                CandidateResults);
            StatusMessage = string.IsNullOrWhiteSpace(apiResult.Error)
                ? $"ローカル候補化しました: {CandidateResults.Count}件"
                : $"候補化APIに接続できないためローカル候補化しました: {CandidateResults.Count}件";
            return;
        }

        foreach (var candidate in RhodesMaaResultPreview.FromTaskResults(ResourceTaskResults))
        {
            CandidateResults.Add(candidate);
        }

        if (CandidateResults.Count > 0)
        {
            RefreshInspectorRows();
            LastResourceTaskResultsPath = await SaveResourceTaskResultsAsync(
                ResourceTaskResults,
                SelectedResourceProfile?.Id,
                CandidateResults);
            StatusMessage = string.IsNullOrWhiteSpace(apiResult.Error)
                ? $"候補化APIは0件だったためローカルMAAプレビューを表示しました: {CandidateResults.Count}件"
                : $"候補化APIに接続できないためローカルMAAプレビューを表示しました: {CandidateResults.Count}件";
            return;
        }

        RefreshInspectorRows();
        LastResourceTaskResultsPath = await SaveResourceTaskResultsAsync(
            ResourceTaskResults,
            SelectedResourceProfile?.Id,
            CandidateResults);
        StatusMessage = string.IsNullOrWhiteSpace(apiResult.Error)
            ? "候補は0件です。"
            : $"候補化API失敗: {apiResult.Error}";
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
            ClearRoiRescanComparison();
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
        ReplaceCollection(OcrDetailRows, RhodesMaaOcrDetailRows.FromTaskResults(ResourceTaskResults));
        ReplaceCollection(RoiDetailRows, RhodesMaaRoiDetailRows.FromTaskResults(ResourceTaskResults));
        RefreshRoiPreviewRows();
    }

    private void RefreshRoiPreviewRows()
    {
        ReplaceCollection(
            RoiPreviewRows,
            RhodesMaaRoiPreviewProjector.Project(
                RoiDetailRows,
                BaseResolution,
                _capturePixelWidth,
                _capturePixelHeight));
        var selected = string.IsNullOrWhiteSpace(_selectedRoiPreviewKey)
            ? null
            : RoiPreviewRows.FirstOrDefault(row => row.Key == _selectedRoiPreviewKey);
        if (!Equals(_selectedRoiPreviewRow, selected))
        {
            _selectedRoiPreviewRow = selected;
            OnPropertyChanged(nameof(SelectedRoiPreviewRow));
        }
        RefreshSelectedRoiPreviewRows();
        RefreshRoiBatchDrafts();
        OnPropertyChanged(nameof(RoiProjectionLabel));
    }

    private void RefreshRoiBatchDrafts()
    {
        var previous = RoiBatchDrafts.ToDictionary(item => item.Key, StringComparer.Ordinal);
        var drafts = RoiPreviewRows
            .Where(row => row.IsResourceRoiCandidate)
            .Select(row => MaaRoiEditDraft.FromPreview(row))
            .Where(draft => draft.HasSelection && draft.IsResourceRoiCandidate)
            .Select(draft =>
            {
                var key = $"{draft.Entry}|{draft.Source}|{draft.RoiJson}";
                return previous.TryGetValue(key, out var item)
                    ? new MaaRoiBatchDraftPreview(draft, item.IsIncluded, item.StateLabel, item.StateDetail)
                    : new MaaRoiBatchDraftPreview(draft);
            })
            .ToArray();
        ReplaceCollection(RoiBatchDrafts, drafts);
    }

    private void RefreshSelectedRoiPreviewRows()
    {
        ReplaceCollection(
            SelectedRoiPreviewRows,
            _selectedRoiPreviewRow is null ? [] : [_selectedRoiPreviewRow]);
        SelectedRoiEditDraft = MaaRoiEditDraft.FromPreview(_selectedRoiPreviewRow);
        RoiDraftApplyResult = MaaRoiDraftApplyResult.Failed("未確認");
    }

    private void UpdateSelectedRoiOverlay(int[] roi)
    {
        var source = _selectedRoiPreviewRow;
        if (source is null)
            return;

        ReplaceCollection(
            SelectedRoiPreviewRows,
            [source with
            {
                X = roi[0],
                Y = roi[1],
                Width = roi[2],
                Height = roi[3],
                Raw = SelectedRoiEditDraft.RoiJson,
            }]);
    }

    private void RestoreSelectedRoi(int[] roi, string message)
    {
        SelectedRoiEditDraft = SelectedRoiEditDraft with { RoiJson = RoiJson(roi) };
        UpdateSelectedRoiOverlay(roi);
        UpdateRoiBatchDraftForSelected("未確認", message);
        RoiDraftApplyResult = MaaRoiDraftApplyResult.Failed("未確認");
        StatusMessage = $"{message}: {SelectedRoiEditDraft.RoiJson}";
    }

    private void UpdateRoiBatchDraftForSelected(string stateLabel = "調整済み", string? stateDetail = null)
    {
        if (!SelectedRoiEditDraft.HasSelection || RoiBatchDrafts.Count == 0)
            return;

        var updated = RoiBatchDrafts
            .Select(item => item.Entry.Equals(SelectedRoiEditDraft.Entry, StringComparison.Ordinal)
                && item.Draft.Source.Equals(SelectedRoiEditDraft.Source, StringComparison.Ordinal)
                    ? new MaaRoiBatchDraftPreview(SelectedRoiEditDraft, item.IsIncluded, stateLabel, stateDetail ?? item.StateDetail)
                    : item)
            .ToArray();
        ReplaceCollection(RoiBatchDrafts, updated);
    }

    private void SelectRoiForOcrDetail(MaaOcrDetailRow? row)
    {
        var selected = RhodesMaaRoiSelectionMatcher.MatchForOcrDetail(RoiPreviewRows, row);
        if (selected is not null)
            SelectedRoiPreviewRow = selected;
    }

    private void SelectRoiForTaskResult(MaaTaskRunResult? result)
    {
        var selected = RhodesMaaRoiSelectionMatcher.MatchForTaskResult(RoiPreviewRows, result);
        if (selected is not null)
            SelectedRoiPreviewRow = selected;
    }

    private void SelectRoiForLogRow(RhodesRecognitionScanLogRow? row)
    {
        var selected = RhodesMaaRoiSelectionMatcher.MatchForLogRow(RoiPreviewRows, row);
        if (selected is not null)
            SelectedRoiPreviewRow = selected;
    }

    private static bool TryParseDraftRoi(string value, out int[] roi)
    {
        roi = [];
        try
        {
            using var document = JsonDocument.Parse(value);
            if (document.RootElement.ValueKind != JsonValueKind.Array || document.RootElement.GetArrayLength() != 4)
                return false;

            roi = document.RootElement
                .EnumerateArray()
                .Select(item => item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var number) ? number : (int?)null)
                .Where(item => item.HasValue)
                .Select(item => item!.Value)
                .ToArray();
            return roi.Length == 4 && roi[2] > 0 && roi[3] > 0;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private int SnapDelta(double value)
    {
        var rounded = (int)Math.Round(value, MidpointRounding.AwayFromZero);
        return RoiSnapStep <= 1
            ? rounded
            : (int)Math.Round(rounded / (double)RoiSnapStep, MidpointRounding.AwayFromZero) * RoiSnapStep;
    }

    private static int[] AdjustRoi(int[] roi, string? operation, int step)
    {
        var result = roi.ToArray();
        step = Math.Clamp(step, 1, 32);
        switch (operation)
        {
            case "left":
                result[0] = Math.Max(0, result[0] - step);
                break;
            case "right":
                result[0] += step;
                break;
            case "up":
                result[1] = Math.Max(0, result[1] - step);
                break;
            case "down":
                result[1] += step;
                break;
            case "wider":
                result[2] += step;
                break;
            case "narrower":
                result[2] = Math.Max(1, result[2] - step);
                break;
            case "taller":
                result[3] += step;
                break;
            case "shorter":
                result[3] = Math.Max(1, result[3] - step);
                break;
        }

        return result;
    }

    private static string RoiJson(int[] roi)
    {
        return $"[{roi[0]},{roi[1]},{roi[2]},{roi[3]}]";
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

    private void ReloadResourceCatalog()
    {
        var selectedProfileId = SelectedResourceProfile?.Id;
        _allResourceTasks = RhodesMaaResourceCatalog.DefaultTasks();
        ReplaceCollection(ResourceProfiles, RhodesMaaResourceCatalog.ProfileGroups(_allResourceTasks));
        SelectedResourceProfile = ResourceProfiles.FirstOrDefault(profile => string.Equals(profile.Id, selectedProfileId, StringComparison.Ordinal))
            ?? ResourceProfiles.FirstOrDefault(profile => profile.Id == "runStatusFull")
            ?? ResourceProfiles.FirstOrDefault();
        RefreshResourceTasks();
        RefreshInspectorRows();
        OnPropertyChanged(nameof(MaaOcrStatusState));
        OnPropertyChanged(nameof(MaaOcrStatusDetail));
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

    private void RefreshChoiceAfterSelectionMutation(string kind)
    {
        if (kind == "relic")
        {
            var options = new SukiChoiceFilterOptions(
                ShowSelectedFirst: RelicShowSelectedFirst,
                HideExcluded: RelicHideExcluded,
                SelectedOnly: RelicSelectedOnly);
            if (RhodesChoiceFilter.RequiresFullRefreshAfterSelectionMutation(options))
                RefreshRelicChoices();
            else
                RefreshRelicSummaries();
            return;
        }

        var operatorOptions = new SukiChoiceFilterOptions(
            ShowSelectedFirst: OperatorShowSelectedFirst,
            HideExcluded: OperatorHideExcluded,
            SelectedOnly: OperatorSelectedOnly);
        if (RhodesChoiceFilter.RequiresFullRefreshAfterSelectionMutation(operatorOptions))
            RefreshOperatorChoices();
        else
            RefreshOperatorSummaries();
    }

    private void RefreshChoiceAfterExclusionMutation(string kind)
    {
        if (kind == "relic")
        {
            var options = new SukiChoiceFilterOptions(
                ShowSelectedFirst: RelicShowSelectedFirst,
                HideExcluded: RelicHideExcluded,
                SelectedOnly: RelicSelectedOnly);
            if (RhodesChoiceFilter.RequiresFullRefreshAfterExclusionMutation(options))
                RefreshRelicChoices();
            else
                RefreshRelicSummaries();
            return;
        }

        var operatorOptions = new SukiChoiceFilterOptions(
            ShowSelectedFirst: OperatorShowSelectedFirst,
            HideExcluded: OperatorHideExcluded,
            SelectedOnly: OperatorSelectedOnly);
        if (RhodesChoiceFilter.RequiresFullRefreshAfterExclusionMutation(operatorOptions))
            RefreshOperatorChoices();
        else
            RefreshOperatorSummaries();
    }

    private void RefreshChoiceAfterBulkMutation(string kind)
    {
        if (kind == "relic")
        {
            if (RelicShowSelectedFirst || RelicSelectedOnly)
                RefreshRelicChoices();
            else
                RefreshRelicSummaries();
            return;
        }

        if (OperatorShowSelectedFirst || OperatorSelectedOnly)
            RefreshOperatorChoices();
        else
            RefreshOperatorSummaries();
    }

    private void PersistChoiceStateInBackground()
    {
        _ = PersistChoiceStateAsync();
    }

    private async Task<bool> PersistChoiceStateAsync()
    {
        try
        {
            await RhodesRunStateStore.SaveChoicesAsync(_allOperators, _allRelics, BuildChoicePersistenceOptions());
            return true;
        }
        catch (Exception ex)
        {
            StatusMessage = $"状態保存に失敗しました: {ex.Message}";
            return false;
        }
    }

    private SukiChoicePersistenceOptions BuildChoicePersistenceOptions()
    {
        return new SukiChoicePersistenceOptions(
            OperatorShowSelectedFirst,
            OperatorHideExcluded,
            OperatorSelectedOnly,
            RelicShowSelectedFirst,
            RelicHideExcluded,
            RelicSelectedOnly,
            OperatorPaneColumns,
            RelicPaneColumns);
    }

    private void RefreshOperatorSummaries()
    {
        OnPropertyChanged(nameof(OperatorListSummary));
        OnPropertyChanged(nameof(RunContextSummary));
        OnPropertyChanged(nameof(CampaignHeaderDetail));
        RefreshInspectorRows();
    }

    private void RefreshRelicSummaries()
    {
        OnPropertyChanged(nameof(RelicListSummary));
        OnPropertyChanged(nameof(RunContextSummary));
        OnPropertyChanged(nameof(CampaignHeaderDetail));
        RefreshCampaignPreviews();
        RefreshInspectorRows();
    }

    private void RefreshOperatorChoices()
    {
        var filtered = RhodesChoiceFilter.Apply(
            _allOperators,
            new SukiChoiceFilterOptions(
                SearchText: OperatorSearch,
                OperatorClass: OperatorClassFilter,
                OperatorBranch: OperatorBranchFilter,
                Rarity: OperatorRarityFilter,
                ShowSelectedFirst: OperatorShowSelectedFirst,
                HideExcluded: OperatorHideExcluded,
                SelectedOnly: OperatorSelectedOnly));
        ReplaceCollection(FilteredOperators, filtered);
        RefreshOperatorRows();
        OnPropertyChanged(nameof(OperatorListSummary));
        OnPropertyChanged(nameof(RunContextSummary));
        OnPropertyChanged(nameof(CampaignHeaderDetail));
        RefreshInspectorRows();
    }

    private void RefreshRelicChoices()
    {
        var filtered = RhodesChoiceFilter.Apply(
            _allRelics,
            new SukiChoiceFilterOptions(
                SearchText: RelicSearch,
                Category: RelicCategoryFilter,
                CampaignId: SelectedCampaign?.Id ?? "",
                ShowSelectedFirst: RelicShowSelectedFirst,
                HideExcluded: RelicHideExcluded,
                SelectedOnly: RelicSelectedOnly));
        ReplaceCollection(FilteredRelics, filtered);
        RefreshRelicRows();
        OnPropertyChanged(nameof(RelicListSummary));
        OnPropertyChanged(nameof(RunContextSummary));
        OnPropertyChanged(nameof(CampaignHeaderDetail));
        RefreshCampaignPreviews();
        RefreshInspectorRows();
    }

    private void RefreshOperatorRows()
    {
        ReplaceCollection(FilteredOperatorRows, RhodesChoiceRows.Build(FilteredOperators, OperatorPaneColumns));
    }

    private void RefreshRelicRows()
    {
        ReplaceCollection(FilteredRelicRows, RhodesChoiceRows.Build(FilteredRelics, RelicPaneColumns));
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
            RhodesOperatorTaxonomy.SortClasses(classBase.Select(item => item.OperatorClass))));
        EnsureFilterValue(ref _operatorClassFilter, OperatorClassOptions, nameof(OperatorClassFilter));

        var branchBase = classBase.Where(item => OperatorClassFilter == "すべて" || item.OperatorClass == OperatorClassFilter);
        ReplaceCollection(OperatorBranchOptions, new[] { "すべて" }.Concat(
            RhodesOperatorTaxonomy.SortBranches(branchBase.Select(item => (item.OperatorBranch, item.OperatorClass)))));
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

    private static int ClampPaneColumns(int value)
    {
        return Math.Clamp(value, 1, 4);
    }

    private IReadOnlyList<MaaCandidatePreview> SnapshotCandidatesForComparison(
        IReadOnlyList<MaaTaskRunResult> taskResults,
        IEnumerable<MaaCandidatePreview> candidates)
    {
        var currentCandidates = candidates.ToArray();
        if (currentCandidates.Length > 0)
            return currentCandidates;

        return RhodesMaaLocalCandidateConverter.FromTaskResults(CandidateApiProfileId(), taskResults);
    }

    private static IReadOnlyDictionary<string, string> CandidateSourceEntries(
        string? profileId,
        IEnumerable<MaaTaskRunResult> taskResults)
    {
        var entries = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var taskResult in taskResults)
        {
            var candidates = RhodesMaaLocalCandidateConverter.FromTaskResults(profileId, [taskResult]);
            foreach (var candidate in candidates)
            {
                var key = CandidateComparisonKey(candidate);
                if (!string.IsNullOrWhiteSpace(key) && !entries.ContainsKey(key))
                    entries[key] = taskResult.Entry;
            }
        }

        return entries;
    }

    private void ClearRoiRescanComparison(string summary = "再スキャン比較未実行")
    {
        SelectedRoiRescanComparisonRow = null;
        ReplaceCollection(RoiRescanComparisonRows, Array.Empty<MaaRoiRescanComparisonRow>());
        RoiRescanComparisonSummary = summary;
        SetRoiRescanComparisonEvidence("", "");
        RoiRescanEvidencePreviewTitle = "比較証跡未表示";
        RoiRescanEvidencePreviewText = "";
        SelectedRoiRescanEvidencePreviewNode = null;
        ReplaceCollection(RoiRescanEvidencePreviewNodes, Array.Empty<MaaEvidencePreviewNode>());
    }

    private void SetRoiRescanComparisonEvidence(string beforePath, string afterPath)
    {
        _lastRoiRescanBeforePath = beforePath ?? "";
        _lastRoiRescanAfterPath = afterPath ?? "";
        RoiRescanComparisonEvidenceSummary =
            string.IsNullOrWhiteSpace(_lastRoiRescanBeforePath) && string.IsNullOrWhiteSpace(_lastRoiRescanAfterPath)
                ? "比較証跡未保存"
                : $"before={_lastRoiRescanBeforePath} / after={_lastRoiRescanAfterPath}";
    }

    private static IReadOnlyList<MaaRoiRescanComparisonRow> CompareRoiRescanCandidates(
        IEnumerable<MaaCandidatePreview> beforeCandidates,
        IEnumerable<MaaCandidatePreview> afterCandidates,
        IReadOnlyDictionary<string, string>? beforeSourceEntries = null,
        IReadOnlyDictionary<string, string>? afterSourceEntries = null)
    {
        var before = CandidateComparisonMap(beforeCandidates);
        var after = CandidateComparisonMap(afterCandidates);
        var orderedKeys = before.Values
            .OrderBy(item => item.Order)
            .Select(item => item.Key)
            .Concat(after.Values.OrderBy(item => item.Order).Select(item => item.Key))
            .Distinct(StringComparer.Ordinal);
        var rows = new List<MaaRoiRescanComparisonRow>();
        foreach (var key in orderedKeys)
        {
            var hasBefore = before.TryGetValue(key, out var beforeItem);
            var hasAfter = after.TryGetValue(key, out var afterItem);
            if (!hasBefore && hasAfter && afterItem is not null)
            {
                rows.Add(new MaaRoiRescanComparisonRow(
                    "added",
                    afterItem.Label,
                    "-",
                    afterItem.DisplayValue,
                    afterItem.Detail,
                    key,
                    CandidateSourceEntry(key, beforeSourceEntries, afterSourceEntries)));
                continue;
            }

            if (hasBefore && !hasAfter && beforeItem is not null)
            {
                rows.Add(new MaaRoiRescanComparisonRow(
                    "removed",
                    beforeItem.Label,
                    beforeItem.DisplayValue,
                    "-",
                    beforeItem.Detail,
                    key,
                    CandidateSourceEntry(key, beforeSourceEntries, afterSourceEntries)));
                continue;
            }

            if (beforeItem is null || afterItem is null || beforeItem.Signature == afterItem.Signature)
                continue;

            rows.Add(new MaaRoiRescanComparisonRow(
                "changed",
                afterItem.Label,
                beforeItem.DisplayValue,
                afterItem.DisplayValue,
                $"{beforeItem.Detail} / after: {afterItem.Detail}",
                key,
                CandidateSourceEntry(key, beforeSourceEntries, afterSourceEntries)));
        }

        return rows;
    }

    private static string CandidateSourceEntry(
        string key,
        IReadOnlyDictionary<string, string>? beforeSourceEntries,
        IReadOnlyDictionary<string, string>? afterSourceEntries)
    {
        if (afterSourceEntries is not null && afterSourceEntries.TryGetValue(key, out var afterEntry))
            return afterEntry;
        return beforeSourceEntries is not null && beforeSourceEntries.TryGetValue(key, out var beforeEntry)
            ? beforeEntry
            : "";
    }

    private void SelectCandidateForComparison(MaaRoiRescanComparisonRow? row)
    {
        if (row is null)
            return;

        if (!string.IsNullOrWhiteSpace(row.TaskEntry))
        {
            var task = ResourceTaskResults.FirstOrDefault(result => result.Entry.Equals(row.TaskEntry, StringComparison.Ordinal));
            if (task is not null)
                SelectedResourceTaskResult = task;
        }

        if (string.IsNullOrWhiteSpace(row.CandidateKey))
        {
            StatusMessage = string.IsNullOrWhiteSpace(row.TaskEntry)
                ? $"比較差分を選択しました: {row.Label}"
                : $"比較差分のtaskを選択しました: {row.TaskEntry}";
            return;
        }

        var selected = CandidateResults.FirstOrDefault(candidate =>
            CandidateComparisonKey(candidate).Equals(row.CandidateKey, StringComparison.Ordinal));
        if (selected is null)
        {
            StatusMessage = string.IsNullOrWhiteSpace(row.TaskEntry)
                ? $"比較差分に対応する候補は現在の候補一覧にありません: {row.Label}"
                : $"比較差分のtaskを選択しました: {row.TaskEntry} / 候補は現在の一覧にありません";
            return;
        }

        SelectedCandidateResult = selected;
        StatusMessage = string.IsNullOrWhiteSpace(row.TaskEntry)
            ? $"比較差分の候補を選択しました: {selected.Label}"
            : $"比較差分の候補とtaskを選択しました: {selected.Label} / {row.TaskEntry}";
    }

    private static string BuildRoiRescanComparisonSummary(
        int beforeCount,
        int afterCount,
        IReadOnlyList<MaaRoiRescanComparisonRow> rows)
    {
        var added = rows.Count(row => row.State == "added");
        var removed = rows.Count(row => row.State == "removed");
        var changed = rows.Count(row => row.State == "changed");
        return rows.Count == 0
            ? $"再スキャン比較: 差分なし (before {beforeCount}件 / after {afterCount}件)"
            : $"再スキャン比較: 追加{added} / 変化{changed} / 消失{removed} (before {beforeCount}件 / after {afterCount}件)";
    }

    private static IReadOnlyDictionary<string, CandidateComparisonItem> CandidateComparisonMap(
        IEnumerable<MaaCandidatePreview> candidates)
    {
        var map = new Dictionary<string, CandidateComparisonItem>(StringComparer.Ordinal);
        var order = 0;
        foreach (var candidate in candidates)
        {
            var key = CandidateComparisonKey(candidate);
            if (string.IsNullOrWhiteSpace(key))
                key = $"candidate:{order}:{candidate.Kind}:{candidate.Label}:{candidate.Value}";

            var item = new CandidateComparisonItem(
                key,
                order,
                CandidateComparisonLabel(candidate),
                CandidateComparisonSignature(candidate),
                CandidateComparisonDisplayValue(candidate),
                CandidateComparisonDetail(candidate),
                candidate.Confidence);
            if (!map.TryGetValue(key, out var existing) || (item.Confidence ?? 0) > (existing.Confidence ?? 0))
            {
                map[key] = item with { Order = existing?.Order ?? item.Order };
            }
            order++;
        }

        return map;
    }

    private static string CandidateComparisonKey(MaaCandidatePreview candidate)
    {
        if (!string.IsNullOrWhiteSpace(candidate.Field))
            return $"field:{candidate.Field}:{candidate.CampaignId}:{candidate.FieldId}:{candidate.SlotKind}";
        if (!string.IsNullOrWhiteSpace(candidate.OperatorId))
            return $"operator:{candidate.OperatorId}";
        if (!string.IsNullOrWhiteSpace(candidate.RelicId))
            return $"relic:{candidate.CampaignId}:{candidate.RelicId}";
        if (!string.IsNullOrWhiteSpace(candidate.ThoughtId))
            return $"thought:{candidate.CampaignId}:{candidate.ThoughtId}";
        if (!string.IsNullOrWhiteSpace(candidate.AgeId))
            return $"age:{candidate.CampaignId}:{candidate.AgeId}";
        if (!string.IsNullOrWhiteSpace(candidate.EffectId))
            return $"effect:{candidate.CampaignId}:{candidate.EffectId}:{candidate.SlotKind}";
        if (!string.IsNullOrWhiteSpace(candidate.CoinId))
            return $"coin:{candidate.CampaignId}:{candidate.CoinId}";
        if (!string.IsNullOrWhiteSpace(candidate.StatusId))
            return $"status:{candidate.CampaignId}:{candidate.StatusId}";

        return FirstNonEmpty(candidate.RecognitionKey, candidate.Identity, candidate.CampaignId);
    }

    private static string CandidateComparisonSignature(MaaCandidatePreview candidate)
    {
        return string.Join(
            "|",
            candidate.Kind,
            candidate.Field,
            candidate.OperatorId,
            candidate.RelicId,
            candidate.ThoughtId,
            candidate.AgeId,
            candidate.EffectId,
            candidate.CoinId,
            candidate.StatusId,
            candidate.Value,
            candidate.Count,
            candidate.Face,
            candidate.CampaignId);
    }

    private static string CandidateComparisonLabel(MaaCandidatePreview candidate)
    {
        return FirstNonEmpty(candidate.Label, candidate.Field, candidate.Kind, candidate.Value, candidate.Identity);
    }

    private static string CandidateComparisonDisplayValue(MaaCandidatePreview candidate)
    {
        var label = CandidateComparisonLabel(candidate);
        if (candidate.Count > 0)
            return $"{label} x{candidate.Count}";
        if (!string.IsNullOrWhiteSpace(candidate.Field))
            return $"{label}={FirstNonEmpty(candidate.Value, candidate.RawText, "-")}";

        var id = FirstNonEmpty(
            candidate.OperatorId,
            candidate.RelicId,
            candidate.ThoughtId,
            candidate.AgeId,
            candidate.EffectId,
            candidate.CoinId,
            candidate.StatusId,
            candidate.Value);
        return string.IsNullOrWhiteSpace(id) || id == label
            ? label
            : $"{label} ({id})";
    }

    private static string CandidateComparisonDetail(MaaCandidatePreview candidate)
    {
        var parts = new[]
        {
            candidate.DebugDetail,
            string.IsNullOrWhiteSpace(candidate.RawText) ? "" : $"raw:{candidate.RawText}",
            candidate.Confidence.HasValue ? $"conf:{candidate.Confidence.Value:0.###}" : "",
        };
        return string.Join(" / ", parts.Where(part => !string.IsNullOrWhiteSpace(part)));
    }

    private static string FirstNonEmpty(params string[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
                return value.Trim();
        }
        return "";
    }

    private static void ReplaceCollection<T>(ObservableCollection<T> target, IEnumerable<T> source)
    {
        var items = source as IReadOnlyList<T> ?? source.ToArray();
        if (target.Count == items.Count && target.SequenceEqual(items))
            return;

        target.Clear();
        foreach (var item in items)
        {
            target.Add(item);
        }
    }

    private sealed record CandidateComparisonItem(
        string Key,
        int Order,
        string Label,
        string Signature,
        string DisplayValue,
        string Detail,
        double? Confidence);

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

    private void TryLoadCapturePreviewFromPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            return;

        try
        {
            var bytes = File.ReadAllBytes(path);
            _lastCapture = bytes;
            LastCaptureImage = CreateCaptureBitmap(bytes);
            LastCapturePath = path;
            CaptureState = $"履歴から読込: {path}";
        }
        catch
        {
            // 履歴の画像が消えていても、候補・ログの復元は継続する。
        }
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

    private static async Task<string> SaveResourceTaskResultsAsync(
        IEnumerable<MaaTaskRunResult> taskResults,
        string? profileId,
        IEnumerable<MaaCandidatePreview>? candidates = null)
    {
        return await RhodesMaaRecognitionEvidenceLog.SaveAsync(
            taskResults,
            candidates ?? [],
            profileId,
            RhodesSukiDebugPaths.RecognitionScansDirectory);
    }

    private static string ResolveMaaTasksSourcePath()
    {
        foreach (var origin in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() }.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var candidate = Path.Combine(origin, RhodesMaaRoiDraftSourceUpdater.MaaTasksSourcePath);
            if (File.Exists(candidate))
                return candidate;
        }

        return Path.Combine(AppContext.BaseDirectory, RhodesMaaRoiDraftSourceUpdater.MaaTasksSourcePath);
    }

    private static string ResolveScanProfilesSourcePath()
    {
        foreach (var origin in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() }.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var candidate = Path.Combine(origin, RhodesMaaGeneratedResourceBuilder.ScanProfilesSourcePath);
            if (File.Exists(candidate))
                return candidate;
        }

        return Path.Combine(AppContext.BaseDirectory, RhodesMaaGeneratedResourceBuilder.ScanProfilesSourcePath);
    }

    private static string ResolveRoiDraftSourcePath(MaaRoiEditDraft draft)
    {
        return RhodesMaaRoiDraftSourceUpdater.UsesScanProfilesSource(draft)
            ? ResolveScanProfilesSourcePath()
            : ResolveMaaTasksSourcePath();
    }

    private IReadOnlyList<MaaRoiEditDraft> VisibleResourceRoiDrafts()
    {
        return RoiBatchDrafts
            .Where(item => item.IsIncluded)
            .Select(item => item.Draft)
            .ToArray();
    }

    private static string ResolveGeneratedPipelinePath()
    {
        return Path.Combine(AppContext.BaseDirectory, RhodesMaaGeneratedResourceBuilder.GeneratedPipelinePath);
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
        _capturePixelWidth = value?.PixelSize.Width ?? 0;
        _capturePixelHeight = value?.PixelSize.Height ?? 0;
        OnPropertyChanged(nameof(LastCaptureImage));
        OnPropertyChanged(nameof(CapturePixelSizeLabel));
        RefreshRoiPreviewRows();
        previous?.Dispose();
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}
