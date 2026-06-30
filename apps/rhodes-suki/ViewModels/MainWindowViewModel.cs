using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Windows.Input;
using RhodesSuki.Models;
using RhodesSuki.Services;

namespace RhodesSuki.ViewModels;

public sealed class MainWindowViewModel : INotifyPropertyChanged, IDisposable
{
    private readonly RhodesMaaSession _session;
    private readonly IReadOnlyList<MaaResourceTaskPreview> _allResourceTasks;
    private byte[] _lastCapture = [];
    private string _adbPath = "adb";
    private string _adbSerial = "";
    private string _adbConfigJson = "{}";
    private string _sessionState;
    private string _sessionDetail;
    private string _captureState = "未取得";
    private string _lastCapturePath = "";
    private string _rhodesApiUrl = "http://127.0.0.1:5173";
    private string _statusMessage = "MAAFramework の検証準備ができています。";
    private MaaResourceProfilePreview? _selectedResourceProfile;
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

        ProbePayloads = new ObservableCollection<MaaProbePayloadPreview>(Services.RhodesRecognitionProbe.DefaultPayloads());
        ProbeResults = [];
        _allResourceTasks = RhodesMaaResourceCatalog.DefaultTasks();
        ResourceProfiles = new ObservableCollection<MaaResourceProfilePreview>(RhodesMaaResourceCatalog.ProfileGroups(_allResourceTasks));
        ResourceTasks = [];
        ResourceTaskResults = [];
        CandidateResults = [];
        BaseResolution = Services.RhodesMaaPaths.BaseResolution;
        ResourceRoot = sessionSnapshot.ResourceRoot;
        AgentBinaryRoot = sessionSnapshot.AgentBinaryRoot;

        ConnectCommand = new AsyncRelayCommand(ConnectAsync);
        CaptureCommand = new AsyncRelayCommand(CaptureAsync);
        RunAllProbesCommand = new AsyncRelayCommand(RunAllProbesAsync);
        RunSelectedProfileRecognitionCommand = new AsyncRelayCommand(RunSelectedProfileRecognitionAsync);
        RunAllResourceTasksCommand = new AsyncRelayCommand(RunAllResourceTasksAsync);
        ExportResourceTaskResultsCommand = new AsyncRelayCommand(ExportResourceTaskResultsAsync);
        ConvertResourceTaskResultsCommand = new AsyncRelayCommand(ConvertResourceTaskResultsAsync);
        RunProbeCommand = new AsyncRelayCommand(parameter => RunProbeAsync(parameter as MaaProbePayloadPreview));
        RunResourceTaskCommand = new AsyncRelayCommand(parameter => RunResourceTaskAsync(parameter as MaaResourceTaskPreview));
        SelectedResourceProfile = ResourceProfiles.FirstOrDefault(profile => profile.Id == "runStatusFull") ?? ResourceProfiles.FirstOrDefault();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string Title { get; } = "RHODES OBS COMMANDER3373";

    public string Subtitle { get; } = "MAAFramework family desktop shell";

    public ObservableCollection<IntegrationStatus> RuntimeStatuses { get; }

    public ObservableCollection<string> MigrationSteps { get; }

    public ObservableCollection<MaaProbePayloadPreview> ProbePayloads { get; }

    public ObservableCollection<MaaProbeResult> ProbeResults { get; }

    public ObservableCollection<MaaResourceProfilePreview> ResourceProfiles { get; }

    public ObservableCollection<MaaResourceTaskPreview> ResourceTasks { get; }

    public ObservableCollection<MaaTaskRunResult> ResourceTaskResults { get; }

    public ObservableCollection<MaaCandidatePreview> CandidateResults { get; }

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

    public ICommand CaptureCommand { get; }

    public ICommand RunAllProbesCommand { get; }

    public ICommand RunSelectedProfileRecognitionCommand { get; }

    public ICommand RunAllResourceTasksCommand { get; }

    public ICommand ExportResourceTaskResultsCommand { get; }

    public ICommand ConvertResourceTaskResultsCommand { get; }

    public ICommand RunProbeCommand { get; }

    public ICommand RunResourceTaskCommand { get; }

    public void Dispose()
    {
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
        if (!ResourceTasks.Any())
        {
            StatusMessage = "選択プロファイルにResource taskがありません。";
            return;
        }

        foreach (var task in ResourceTasks)
        {
            var result = await _session.RunResourceTaskAsync(task.Entry);
            ResourceTaskResults.Add(result);
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
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var response = await client.PostAsJsonAsync(
                $"{RhodesApiUrl}/api/recognition/maa-resource",
                new
                {
                    profile = SelectedResourceProfile?.Id == "all" ? "runStatusFull" : SelectedResourceProfile?.Id,
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
            StatusMessage = $"{task.Entry}: {result.Status}";
        });
    }

    private void RefreshResourceTasks()
    {
        ResourceTasks.Clear();
        foreach (var task in _allResourceTasks.Where(task => RhodesMaaResourceCatalog.TaskAppliesToProfile(task, SelectedResourceProfile?.Id)))
        {
            ResourceTasks.Add(task);
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
        LastCapturePath = await SaveCaptureAsync(capture.EncodedImage);
        CaptureState = $"{capture.Detail} / {LastCapturePath}";
        return capture;
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

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}
