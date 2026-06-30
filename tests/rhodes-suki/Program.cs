using RhodesSuki.Models;
using RhodesSuki.Services;

var tests = new (string Name, Action Run)[]
{
    ("MAA OCR best_result becomes an OCR candidate", OcrBestResult),
    ("MAA OCR filtered_results are preferred over all_results", OcrFilteredResults),
    ("MAA TemplateMatch count becomes a template candidate", TemplateCount),
    ("MAA hit without detail falls back to a simple candidate", HitFallback),
    ("ADB presets include MuMu and Google Play Games developer defaults", AdbPresets),
    ("ADB device output parses serials and usable state", AdbDeviceParsing),
    ("Suki settings store round-trips ADB and profile values", SukiSettingsStore),
    ("MAA task diagnostics summarize counts and OCR previews", TaskDiagnostics),
    ("Resource task preview exposes source and profile summaries", ResourceTaskSummary),
    ("Run catalog loads campaigns, operators, relics, and current selections", RunCatalogLoadsChoices),
    ("Choice filters support selected-first, hidden exclusions, and selected-only", ChoiceFilters),
};

var failures = new List<string>();
foreach (var test in tests)
{
    try
    {
        test.Run();
        Console.WriteLine($"ok - {test.Name}");
    }
    catch (Exception ex)
    {
        failures.Add($"{test.Name}: {ex.Message}");
        Console.Error.WriteLine($"not ok - {test.Name}: {ex.Message}");
    }
}

if (failures.Count > 0)
{
    Console.Error.WriteLine();
    Console.Error.WriteLine($"{failures.Count} failure(s)");
    Environment.Exit(1);
}

Console.WriteLine($"{tests.Length} Suki service tests passed.");

static void OcrBestResult()
{
    var previews = RhodesMaaResultPreview.FromTaskResults(
    [
        new MaaTaskRunResult(
            "RhodesOcrRegion_operator_name",
            "Succeeded",
            true,
            "ocr detail",
            """prefix {"best_result":{"text":"テンニンカ","score":0.91}}""",
            "OCR",
            true),
    ]);

    Equal(1, previews.Count, "preview count");
    Equal("ocr", previews[0].Kind, "kind");
    Equal("テンニンカ", previews[0].Value, "value");
    Equal(0.91, previews[0].Confidence, "confidence");
}

static void OcrFilteredResults()
{
    var previews = RhodesMaaResultPreview.FromTaskResults(
    [
        new MaaTaskRunResult(
            "RhodesOcrRegion_operator_name",
            "Succeeded",
            true,
            "ocr detail",
            """{"all_results":[{"text":"ノイズ","score":0.4}],"filtered_results":[{"text":"グム","score":0.88}]}""",
            "OCR",
            true),
    ]);

    Equal(1, previews.Count, "preview count");
    Equal("グム", previews[0].Value, "value");
    Equal(0.88, previews[0].Confidence, "confidence");
}

static void TemplateCount()
{
    var previews = RhodesMaaResultPreview.FromTaskResults(
    [
        new MaaTaskRunResult(
            "RhodesTemplate_thought_branch",
            "Succeeded",
            true,
            "template detail",
            """{"filtered_results":[{"score":0.87,"count":2}]}""",
            "TemplateMatch",
            true),
    ]);

    Equal(1, previews.Count, "preview count");
    Equal("template", previews[0].Kind, "kind");
    Equal("2", previews[0].Value, "value");
    Equal(0.87, previews[0].Confidence, "confidence");
}

static void HitFallback()
{
    var previews = RhodesMaaResultPreview.FromTaskResults(
    [
        new MaaTaskRunResult(
            "RhodesTemplate_run_status_ingot",
            "Succeeded",
            true,
            "template hit",
            "",
            "TemplateMatch",
            true),
    ]);

    Equal(1, previews.Count, "preview count");
    Equal("maa", previews[0].Kind, "kind");
    Equal("hit", previews[0].Value, "value");
}

static void AdbPresets()
{
    var presets = RhodesAdbPresetCatalog.DefaultPresets();
    var mumu = presets.Single(preset => preset.Id == "mumu");
    var googlePlay = presets.Single(preset => preset.Id == "google-play-games-dev");

    Equal("127.0.0.1:16384", mumu.Serial, "MuMu serial");
    Equal("127.0.0.1:6520", googlePlay.Serial, "Google Play Games developer serial");
}

static void AdbDeviceParsing()
{
    var devices = RhodesAdbDeviceProbe.ParseDevices(
        """
        List of devices attached
        127.0.0.1:16384 device product:MuMu model:MuMu_Player transport_id:1
        emulator-5554 offline transport_id:2
        """);

    Equal(2, devices.Count, "device count");
    Equal("127.0.0.1:16384", devices[0].Serial, "first serial");
    Equal(true, devices[0].IsUsable, "first usable");
    Equal("offline", devices[1].State, "second state");
    Equal(false, devices[1].IsUsable, "second usable");
}

static void SukiSettingsStore()
{
    var directory = Path.Combine(Path.GetTempPath(), "rhodes-suki-tests", Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(directory);
    var path = Path.Combine(directory, "settings.json");
    try
    {
        RhodesSukiSettingsStore.Save(
            new RhodesSukiSettings(
                "C:/Tools/adb.exe",
                "127.0.0.1:16384",
                """{"touch":"adb"}""",
                "http://127.0.0.1:5173",
                "mumu",
                "operatorsFull"),
            path);

        var loaded = RhodesSukiSettingsStore.Load(path);
        Equal("C:/Tools/adb.exe", loaded.AdbPath, "adb path");
        Equal("127.0.0.1:16384", loaded.AdbSerial, "adb serial");
        Equal("mumu", loaded.SelectedAdbPresetId, "preset");
        Equal("operatorsFull", loaded.SelectedResourceProfileId, "profile");
    }
    finally
    {
        Directory.Delete(directory, true);
    }
}

static void TaskDiagnostics()
{
    var diagnostics = RhodesMaaTaskDiagnostics.Summarize(
    [
        new MaaTaskRunResult(
            "RhodesOcrRegion_operator_name",
            "Succeeded",
            true,
            "ocr detail",
            """{"filtered_results":[{"text":"グム","score":0.88}]}""",
            "OCR",
            true),
        new MaaTaskRunResult(
            "RhodesTemplate_run_status_ingot",
            "Succeeded",
            true,
            "template detail",
            """{"filtered_results":[{"score":0.91}]}""",
            "TemplateMatch",
            true),
        new MaaTaskRunResult(
            "RhodesBrokenTask",
            "Failed",
            false,
            "missing task",
            "",
            "",
            false),
    ]);

    Equal(3, diagnostics.Total, "total");
    Equal(2, diagnostics.Succeeded, "succeeded");
    Equal(2, diagnostics.Hit, "hit");
    Equal(1, diagnostics.Failed, "failed");
    Equal(1, diagnostics.OcrCandidateCount, "ocr candidates");
    Equal(1, diagnostics.TemplateCandidateCount, "template candidates");
    Equal(true, diagnostics.Lines.Any(line => line.Contains("グム", StringComparison.Ordinal)), "ocr line");
    Equal(true, diagnostics.Lines.Any(line => line.Contains("RhodesBrokenTask", StringComparison.Ordinal)), "failed line");
}

static void ResourceTaskSummary()
{
    var manual = new MaaResourceTaskPreview("ManualTask", "Manual", "manual purpose");
    var generated = new MaaResourceTaskPreview(
        "GeneratedTask",
        "Generated",
        "generated purpose",
        ["runStatusFull", "operatorsFull"],
        "maa-tasks.ocrRegions");

    Equal("source: manual", manual.SourceSummary, "manual source");
    Equal("profiles: manual", manual.ProfileSummary, "manual profiles");
    Equal("source: maa-tasks.ocrRegions", generated.SourceSummary, "generated source");
    Equal("profiles: runStatusFull, operatorsFull", generated.ProfileSummary, "generated profiles");
}

static void RunCatalogLoadsChoices()
{
    var catalog = RhodesRunCatalog.LoadDefault();
    var is5 = catalog.Campaigns.Single(campaign => campaign.Id == "is5_sarkaz");
    var is5Relics = catalog.Relics.Where(relic => relic.CampaignId == is5.Id).ToArray();

    Equal(5, catalog.Campaigns.Count, "campaign count");
    Equal("IS#5 サルカズの炉辺奇談", is5.DisplayName, "campaign label");
    Equal(true, catalog.Operators.Any(item => item.Name == "グム" && item.OperatorClass == "重装"), "operator data");
    Equal(296, is5Relics.Length, "is5 relic count");
    Equal(true, catalog.Current.SelectedRelicIds.Contains("is5_sarkaz_relic_254"), "current relic selection");
    Equal("is5_sarkaz", catalog.Current.CampaignId, "current campaign");
}

static void ChoiceFilters()
{
    var items = new[]
    {
        new SukiChoiceItem("operator", "a", "テンニンカ", "★4 先鋒 / 旗手", "先鋒", "", "", "", 4, 0, false),
        new SukiChoiceItem("operator", "b", "グム", "★4 重装 / 庇護衛士", "重装", "", "", "", 4, 1, false),
        new SukiChoiceItem("operator", "c", "チューリップ", "★5 先鋒 / 先駆兵", "先鋒", "", "", "", 5, 2, true),
    };
    items[1].IsSelected = true;
    items[2].IsExcluded = true;

    var selectedFirst = RhodesChoiceFilter.Apply(items, new SukiChoiceFilterOptions(ShowSelectedFirst: true)).ToArray();
    Equal("グム", selectedFirst[0].Name, "selected first");

    var hiddenExcluded = RhodesChoiceFilter.Apply(items, new SukiChoiceFilterOptions(HideExcluded: true)).ToArray();
    Equal(false, hiddenExcluded.Any(item => item.Name == "チューリップ"), "hide excluded");

    var selectedOnly = RhodesChoiceFilter.Apply(items, new SukiChoiceFilterOptions(SelectedOnly: true)).ToArray();
    Equal(1, selectedOnly.Length, "selected only count");
    Equal("グム", selectedOnly[0].Name, "selected only item");

    var searched = RhodesChoiceFilter.Apply(items, new SukiChoiceFilterOptions(SearchText: "旗手")).ToArray();
    Equal("テンニンカ", searched.Single().Name, "search by detail");
}

static void Equal<T>(T expected, T actual, string label)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
        throw new InvalidOperationException($"{label}: expected {expected}, got {actual}");
}
