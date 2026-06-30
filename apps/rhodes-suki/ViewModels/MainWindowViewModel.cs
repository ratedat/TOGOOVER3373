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
    private byte[] _lastCapture = [];
    private string _adbPath = "adb";
    private string _adbSerial = "";
    private string _adbConfigJson = "{}";
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
        SetChoiceTabCommand = new AsyncRelayCommand(SetChoiceTabAsync);
        ToggleChoiceSelectedCommand = new AsyncRelayCommand(ToggleChoiceSelectedAsync);
        ToggleChoiceExcludedCommand = new AsyncRelayCommand(ToggleChoiceExcludedAsync);
        ClearVisibleChoicesCommand = new AsyncRelayCommand(ClearVisibleChoicesAsync);
        SelectedResourceProfile = ResourceProfiles.FirstOrDefault(profile => profile.Id == "runStatusFull") ?? ResourceProfiles.FirstOrDefault();
        RefreshOperatorFilterOptions();
        RefreshRelicFilterOptions();
        RefreshChoiceLists();
        LoadSettings();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string Title { get; } = "RHODES OBS COMMANDER3373";

    public string Subtitle { get; } = "MAAFramework family desktop shell";

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
        private set => SetProperty(ref _resourceTaskDiagnostics, value);
    }

    public MaaBaseResolution BaseResolution { get; }

    public string ResourceRoot { get; }

    public string AgentBinaryRoot { get; }

    public string AdbPath
    {
        get => _adbPath;
        set => SetProperty(ref _adbPath, value);
    }

    public string AdbSerial
    {
        get => _adbSerial;
        set => SetProperty(ref _adbSerial, value);
    }

    public string AdbConfigJson
    {
        get => _adbConfigJson;
        set => SetProperty(ref _adbConfigJson, string.IsNullOrWhiteSpace(value) ? "{}" : value);
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
            OnPropertyChanged(nameof(RunContextSummary));
        }
    }

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

    public string SessionState
    {
        get => _sessionState;
        private set => SetProperty(ref _sessionState, value);
    }

    public string SessionDetail
    {
        get => _sessionDetail;
        private set => SetProperty(ref _sessionDetail, value);
    }

    public string CaptureState
    {
        get => _captureState;
        private set => SetProperty(ref _captureState, value);
    }

    public string LastCapturePath
    {
        get => _lastCapturePath;
        private set => SetProperty(ref _lastCapturePath, value);
    }

    public Bitmap? LastCaptureImage
    {
        get => _lastCaptureImage;
        private set => SetCaptureImage(value);
    }

    public string RhodesApiUrl
    {
        get => _rhodesApiUrl;
        set => SetProperty(ref _rhodesApiUrl, string.IsNullOrWhiteSpace(value) ? "http://127.0.0.1:5173" : value.TrimEnd('/'));
    }

    public string StatusMessage
    {
        get => _statusMessage;
        private set => SetProperty(ref _statusMessage, value);
    }

    public MaaAdbPresetPreview? SelectedAdbPreset
    {
        get => _selectedAdbPreset;
        set => SetProperty(ref _selectedAdbPreset, value);
    }

    public MaaResourceProfilePreview? SelectedResourceProfile
    {
        get => _selectedResourceProfile;
        set
        {
            if (!SetProperty(ref _selectedResourceProfile, value))
                return;
            RefreshResourceTasks();
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

    public ICommand SetChoiceTabCommand { get; }

    public ICommand ToggleChoiceSelectedCommand { get; }

    public ICommand ToggleChoiceExcludedCommand { get; }

    public ICommand ClearVisibleChoicesCommand { get; }

    public void Dispose()
    {
        _lastCaptureImage?.Dispose();
        _session.Dispose();
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

    private Task SetChoiceTabAsync(object? parameter)
    {
        var tab = parameter as string;
        ChoiceTab = tab is "operators" or "relics" or "recognition" ? tab : "operators";
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
            StatusMessage = $"候補化しました: {CandidateResults.Count}件";
            return;
        }

        foreach (var candidate in RhodesMaaResultPreview.FromTaskResults(ResourceTaskResults))
        {
            CandidateResults.Add(candidate);
        }

        if (CandidateResults.Count > 0)
        {
            StatusMessage = string.IsNullOrWhiteSpace(apiError)
                ? $"候補化APIは0件だったためローカルMAAプレビューを表示しました: {CandidateResults.Count}件"
                : $"候補化APIに接続できないためローカルMAAプレビューを表示しました: {CandidateResults.Count}件";
            return;
        }

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
    }

    private void RefreshChoiceLists()
    {
        RefreshOperatorChoices();
        RefreshRelicChoices();
        OnPropertyChanged(nameof(RunContextSummary));
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
