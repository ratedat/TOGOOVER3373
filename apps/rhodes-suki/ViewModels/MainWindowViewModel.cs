using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Windows.Input;
using RhodesSuki.Models;
using RhodesSuki.Services;

namespace RhodesSuki.ViewModels;

public sealed class MainWindowViewModel : INotifyPropertyChanged, IDisposable
{
    private readonly RhodesMaaSession _session;
    private byte[] _lastCapture = [];
    private string _adbPath = "adb";
    private string _adbSerial = "";
    private string _adbConfigJson = "{}";
    private string _sessionState;
    private string _sessionDetail;
    private string _captureState = "未取得";
    private string _lastCapturePath = "";
    private string _statusMessage = "MAAFramework の検証準備ができています。";
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
        ResourceTasks = new ObservableCollection<MaaResourceTaskPreview>(RhodesMaaResourceCatalog.DefaultTasks());
        ResourceTaskResults = [];
        BaseResolution = Services.RhodesMaaPaths.BaseResolution;
        ResourceRoot = sessionSnapshot.ResourceRoot;
        AgentBinaryRoot = sessionSnapshot.AgentBinaryRoot;

        ConnectCommand = new AsyncRelayCommand(ConnectAsync);
        CaptureCommand = new AsyncRelayCommand(CaptureAsync);
        RunAllProbesCommand = new AsyncRelayCommand(RunAllProbesAsync);
        RunAllResourceTasksCommand = new AsyncRelayCommand(RunAllResourceTasksAsync);
        ExportResourceTaskResultsCommand = new AsyncRelayCommand(ExportResourceTaskResultsAsync);
        RunProbeCommand = new AsyncRelayCommand(parameter => RunProbeAsync(parameter as MaaProbePayloadPreview));
        RunResourceTaskCommand = new AsyncRelayCommand(parameter => RunResourceTaskAsync(parameter as MaaResourceTaskPreview));
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string Title { get; } = "RHODES OBS COMMANDER3373";

    public string Subtitle { get; } = "MAAFramework family desktop shell";

    public ObservableCollection<IntegrationStatus> RuntimeStatuses { get; }

    public ObservableCollection<string> MigrationSteps { get; }

    public ObservableCollection<MaaProbePayloadPreview> ProbePayloads { get; }

    public ObservableCollection<MaaProbeResult> ProbeResults { get; }

    public ObservableCollection<MaaResourceTaskPreview> ResourceTasks { get; }

    public ObservableCollection<MaaTaskRunResult> ResourceTaskResults { get; }

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

    public string StatusMessage
    {
        get => _statusMessage;
        private set => SetProperty(ref _statusMessage, value);
    }

    public bool IsBusy
    {
        get => _isBusy;
        private set => SetProperty(ref _isBusy, value);
    }

    public ICommand ConnectCommand { get; }

    public ICommand CaptureCommand { get; }

    public ICommand RunAllProbesCommand { get; }

    public ICommand RunAllResourceTasksCommand { get; }

    public ICommand ExportResourceTaskResultsCommand { get; }

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
        await RunBusyAsync(async () =>
        {
            ResourceTaskResults.Clear();
            foreach (var task in ResourceTasks)
            {
                var result = await _session.RunResourceTaskAsync(task.Entry);
                ResourceTaskResults.Add(result);
                StatusMessage = $"{task.Entry}: {result.Status}";
            }
        });
    }

    private async Task ExportResourceTaskResultsAsync()
    {
        await RunBusyAsync(async () =>
        {
            var path = await SaveResourceTaskResultsAsync(ResourceTaskResults);
            StatusMessage = $"MAA task結果を保存しました: {path}";
        });
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

    private static async Task<string> SaveResourceTaskResultsAsync(IEnumerable<MaaTaskRunResult> taskResults)
    {
        var directory = Path.Combine(AppContext.BaseDirectory, "RHODES OBS COMMANDER3373 Debug Logs", "maa-resource-results");
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, $"suki-maa-resource-results-{DateTimeOffset.Now:yyyyMMdd-HHmmss-fff}.json");
        var payload = new
        {
            schemaVersion = 1,
            createdAt = DateTimeOffset.Now,
            taskResults = taskResults.ToArray(),
        };
        var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(path, $"{json}{Environment.NewLine}");
        return path;
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
