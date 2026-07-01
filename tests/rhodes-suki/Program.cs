using System.Text.Json.Nodes;
using RhodesSuki.Models;
using RhodesSuki.Services;

var tests = new (string Name, Action Run)[]
{
    ("MAA OCR best_result becomes an OCR candidate", OcrBestResult),
    ("MAA OCR filtered_results are preferred over all_results", OcrFilteredResults),
    ("MAA TemplateMatch count becomes a template candidate", TemplateCount),
    ("MAA hit without detail falls back to a simple candidate", HitFallback),
    ("Candidate preview exposes stable debugger identity", CandidatePreviewIdentity),
    ("MAA candidate API extraction preserves structured ids", CandidateApiExtraction),
    ("MAA candidate merger supplements missing local candidates safely", CandidateMergerSupplementsLocalCandidates),
    ("Local MAA candidate converter extracts run status candidates", LocalCandidateConverterRunStatus),
    ("Local MAA candidate converter extracts exact operator name candidates", LocalCandidateConverterOperators),
    ("Local MAA candidate converter extracts current campaign relic candidates", LocalCandidateConverterRelics),
    ("Local MAA candidate converter preserves duplicate IS5 thought candidates", LocalCandidateConverterThoughts),
    ("Local MAA candidate converter extracts IS5 age candidates", LocalCandidateConverterAge),
    ("Local MAA candidate converter dispatches all profile task results", LocalCandidateConverterAllProfiles),
    ("ADB presets include MuMu and Google Play Games developer defaults", AdbPresets),
    ("ADB device output parses serials and usable state", AdbDeviceParsing),
    ("Suki settings store round-trips ADB and profile values", SukiSettingsStore),
    ("MAA task diagnostics summarize counts and OCR previews", TaskDiagnostics),
    ("Resource task preview exposes source and profile summaries", ResourceTaskSummary),
    ("Resource profile groups keep operational recognition order", ResourceProfileOrder),
    ("Run catalog loads campaigns, operators, relics, and current selections", RunCatalogLoadsChoices),
    ("Choice filters support selected-first, hidden exclusions, and selected-only", ChoiceFilters),
    ("Operator taxonomy keeps Integrated Strategies class and branch order", OperatorTaxonomyOrder),
    ("Run state store persists selected choices and display preferences", ChoicePersistence),
    ("Run state store switches current campaign without stale run values", RunContextPersistence),
    ("Recognition candidate applier persists safe run status fields", CandidateRunStatusApply),
    ("Recognition candidate applier can select operator and relic candidates", CandidateChoiceApply),
    ("Recognition candidate applier can apply IS5 thought and age candidates", CandidateIs5SpecialApply),
    ("Choice rows group filtered items into up to four panes", ChoiceRows),
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

static void CandidatePreviewIdentity()
{
    var runStatus = new MaaCandidatePreview("runStatus", "希望", "3", "3", 0.9, Field: "hope");
    var thought = new MaaCandidatePreview(
        "thought",
        "枯れ木と若枝",
        "thought_a",
        "枯れ木と若枝",
        0.8,
        CampaignId: "is5_sarkaz",
        RecognitionKey: "thought:is5_sarkaz:thought_a",
        ThoughtId: "thought_a");

    Equal("hope", runStatus.Identity, "run status identity");
    Equal("thought_a", thought.Identity, "thought identity");
    Equal("thought:thought_a", thought.DebugDetail.Split(" · ").First(part => part.StartsWith("thought:", StringComparison.Ordinal)), "thought debug detail");
    Equal(true, thought.DebugDetail.Contains("campaign:is5_sarkaz", StringComparison.Ordinal), "campaign debug detail");
}

static void CandidateApiExtraction()
{
    var candidates = RhodesMaaCandidateApiClient.ExtractCandidatePreviews(
        """
        {
          "result": {
            "candidates": [
              {
                "kind": "runStatus",
                "field": "hope",
                "value": 3,
                "rawText": "3",
                "confidence": 0.94
              },
              {
                "kind": "thought",
                "name": "枯れ木と若枝",
                "value": "fallback",
                "rawText": "枯れ木と若枝",
                "confidence": 0.91,
                "campaignId": "is5_sarkaz",
                "recognitionKey": "thought:is5_sarkaz:thought_a",
                "thoughtId": "thought_a"
              },
              {
                "kind": "age",
                "label": "時代",
                "value": "age_prime",
                "rawText": "全盛期",
                "confidence": 0.88,
                "ageId": "age_prime"
              }
            ]
          }
        }
        """);

    Equal(3, candidates.Count, "api candidate count");
    Equal("hope", candidates[0].Label, "field fallback label");
    Equal("3", candidates[0].Value, "numeric value text");
    Equal("thought_a", candidates[1].ThoughtId, "thought id");
    Equal("thought_a", candidates[1].Identity, "thought identity");
    Equal("age_prime", candidates[2].AgeId, "age id");
}

static void CandidateMergerSupplementsLocalCandidates()
{
    var merged = RhodesMaaCandidateMerger.Merge(
        [
            new MaaCandidatePreview("runStatus", "希望", "3", "3", 0.94, Field: "hope"),
            new MaaCandidatePreview("operator", "グム", "gummy", "グム", 0.91, OperatorId: "gummy"),
            new MaaCandidatePreview("thought", "枯れ木と若枝", "fallback", "枯れ木と若枝", 0.91, CampaignId: "is5_sarkaz", ThoughtId: "thought_a"),
        ],
        [
            new MaaCandidatePreview("runStatus", "希望", "3", "3", 0.99, Field: "hope"),
            new MaaCandidatePreview("runStatus", "希望上限", "8", "8", 0.92, Field: "maxHope"),
            new MaaCandidatePreview("operator", "グム", "gummy", "グム", 0.99, OperatorId: "gummy"),
            new MaaCandidatePreview("operator", "セイリュウ", "purestream", "セイリュウ", 0.88, OperatorId: "purestream"),
            new MaaCandidatePreview("thought", "枯れ木と若枝", "fallback", "枯れ木と若枝", 0.88, CampaignId: "is5_sarkaz", ThoughtId: "thought_a"),
            new MaaCandidatePreview("thought", "走る都市", "fallback", "走る都市", 0.87, CampaignId: "is5_sarkaz", ThoughtId: "thought_b"),
            new MaaCandidatePreview("age", "天災の時代（全盛期）", "age_prime", "天災の時代（全盛期）", 0.9, CampaignId: "is5_sarkaz", AgeId: "age_prime"),
        ]);

    Equal("hope|maxHope", string.Join("|", merged.Where(item => item.Kind == "runStatus").Select(item => item.Field)), "merged run status fields");
    Equal("gummy|purestream", string.Join("|", merged.Where(item => item.Kind == "operator").Select(item => item.OperatorId)), "merged operators");
    Equal("thought_a", string.Join("|", merged.Where(item => item.Kind == "thought").Select(item => item.ThoughtId)), "primary thought preserved without local duplicates");
    Equal("age_prime", string.Join("|", merged.Where(item => item.Kind == "age").Select(item => item.AgeId)), "local age supplemented");
}

static void LocalCandidateConverterRunStatus()
{
    var candidates = RhodesMaaLocalCandidateConverter.FromTaskResults(
        "runStatusFull",
        [
            M("RhodesOcrRegion_run_hope_current", "3", 0.94),
            M("RhodesOcrRegion_run_hope_max", "8", 0.95),
            M("RhodesTemplate_runStatusFull_run_ingot", "2O", 0.96),
            M("RhodesOcrRegion_run_life_points", "4", 0.91),
            M("RhodesOcrRegion_run_shield", "図", 0.89),
            M("RhodesOcrRegion_run_command_level", "I", 0.88),
            M("RhodesTemplate_runStatusFull_run_idea_current", "7", 0.90),
            M("RhodesOcrRegion_operator_name", "グム", 0.99),
        ]);

    Equal("hope|maxHope|ingot|lifePoints|shield|commandLevel|idea", string.Join("|", candidates.Select(item => item.Field)), "local run fields");
    Equal("3|8|20|4|2|1|7", string.Join("|", candidates.Select(item => item.Value)), "local run values");
    Equal("is5_sarkaz", candidates.Single(item => item.Field == "idea").CampaignId, "idea campaign id");
    Equal("maa-local:ingot:run.ingot", candidates.Single(item => item.Field == "ingot").RecognitionKey, "local recognition key");

    static MaaTaskRunResult M(string entry, string text, double score)
    {
        return new MaaTaskRunResult(
            entry,
            "Succeeded",
            true,
            "detail",
            $"TaskId=1; detail={{\"best\":{{\"text\":\"{text}\",\"score\":{score.ToString(System.Globalization.CultureInfo.InvariantCulture)}}}}}",
            "OCR",
            true);
    }
}

static void LocalCandidateConverterOperators()
{
    var candidates = RhodesMaaLocalCandidateConverter.FromTaskResults(
        "operatorsFull",
        [
            M("RhodesRunStatusTopBarOcr", "メイ", 0.99),
            M("RhodesOcrRegion_operator_name_left_1", "グム", 0.91),
            M("RhodesOcrRegion_operator_name_center_1", "セイリュウ", 0.92),
            M("RhodesOcrRegion_operator_name_right_1", "テンニンカ", 0.93),
            M("RhodesOcrRegion_operator_name_left_2", "ワイルド メイン", 0.94),
        ]);

    Equal("gummy|purestream|myrtle|wildmane", string.Join("|", candidates.Select(item => item.OperatorId)), "operator ids");
    Equal("operator|operator|operator|operator", string.Join("|", candidates.Select(item => item.Kind)), "operator kinds");
    Equal(false, candidates.Any(item => item.OperatorId == "may"), "operator substring false positive");
    Equal("maa-local:operator:gummy", candidates[0].RecognitionKey, "operator recognition key");

    static MaaTaskRunResult M(string entry, string text, double score)
    {
        var encodedText = System.Text.Json.JsonSerializer.Serialize(text);
        return new MaaTaskRunResult(
            entry,
            "Succeeded",
            true,
            "detail",
            $"{{\"filtered_results\":[{{\"text\":{encodedText},\"score\":{score.ToString(System.Globalization.CultureInfo.InvariantCulture)}}}]}}",
            "OCR",
            true);
    }
}

static void LocalCandidateConverterRelics()
{
    var catalog = RhodesRunCatalog.LoadDefault();
    var relics = catalog.Relics
        .Where(item => item.CampaignId == catalog.Current.CampaignId)
        .Take(2)
        .ToArray();
    Equal(true, relics.Length >= 2, "current campaign relic fixtures");

    var candidates = RhodesMaaLocalCandidateConverter.FromTaskResults(
        "relicsFull",
        [
            M("RhodesRunStatusTopBarOcr", relics[0].Name, 0.99),
            M("RhodesOcrRegion_relic_list_text", $"No.001 {relics[0].Name}\n{relics[1].Name}", 0.88),
        ]);

    Equal($"{relics[0].Id}|{relics[1].Id}", string.Join("|", candidates.Select(item => item.RelicId)), "relic ids");
    Equal("relic|relic", string.Join("|", candidates.Select(item => item.Kind)), "relic kinds");
    Equal(catalog.Current.CampaignId, candidates[0].CampaignId, "relic campaign id");
    Equal($"maa-local:relic:{relics[0].Id}", candidates[0].RecognitionKey, "relic recognition key");

    static MaaTaskRunResult M(string entry, string text, double score)
    {
        var encodedText = System.Text.Json.JsonSerializer.Serialize(text);
        return new MaaTaskRunResult(
            entry,
            "Succeeded",
            true,
            "detail",
            $"{{\"filtered_results\":[{{\"text\":{encodedText},\"score\":{score.ToString(System.Globalization.CultureInfo.InvariantCulture)}}}]}}",
            "OCR",
            true);
    }
}

static void LocalCandidateConverterThoughts()
{
    var candidates = RhodesMaaLocalCandidateConverter.FromTaskResults(
        "is5ThoughtFull",
        [
            M(
                "RhodesOcrRegion_is5_thought_list_text",
                [
                    ("枯れ木と若枝", 0.91),
                    ("枯れ木と若枝", 0.88),
                    ("走る都市", 0.86),
                ]),
        ]);

    Equal(
        "is5_sarkaz_selectable_thought_legacy_08|is5_sarkaz_selectable_thought_legacy_08|is5_sarkaz_selectable_thought_insp_20",
        string.Join("|", candidates.Select(item => item.ThoughtId)),
        "thought ids");
    Equal("thought|thought|thought", string.Join("|", candidates.Select(item => item.Kind)), "thought kinds");
    Equal("is5_sarkaz", candidates[0].CampaignId, "thought campaign id");
    Equal("maa-local:thought:is5_sarkaz_selectable_thought_legacy_08:0", candidates[0].RecognitionKey, "thought recognition key");

    static MaaTaskRunResult M(string entry, IReadOnlyList<(string Text, double Score)> rows)
    {
        var resultRows = rows.Select(row =>
            $"{{\"text\":{System.Text.Json.JsonSerializer.Serialize(row.Text)},\"score\":{row.Score.ToString(System.Globalization.CultureInfo.InvariantCulture)}}}");
        return new MaaTaskRunResult(
            entry,
            "Succeeded",
            true,
            "detail",
            $"{{\"filtered_results\":[{string.Join(",", resultRows)}]}}",
            "OCR",
            true);
    }
}

static void LocalCandidateConverterAge()
{
    var candidates = RhodesMaaLocalCandidateConverter.FromTaskResults(
        "is5AgeFull",
        [
            M("RhodesRunStatusTopBarOcr", "魔王の時代（形成期）", 0.99),
            M("RhodesOcrRegion_is5_age_detail_text", "天 災 の 時 代（全 盛 期）\n最大HP+200%", 0.91),
        ]);

    Equal(1, candidates.Count, "age candidate count");
    Equal("age", candidates[0].Kind, "age kind");
    Equal("is5_sarkaz_selectable_age_is5_age_01_prime", candidates[0].AgeId, "age id");
    Equal("is5_sarkaz", candidates[0].CampaignId, "age campaign id");
    Equal("maa-local:age:is5_sarkaz_selectable_age_is5_age_01_prime", candidates[0].RecognitionKey, "age recognition key");

    static MaaTaskRunResult M(string entry, string text, double score)
    {
        var encodedText = System.Text.Json.JsonSerializer.Serialize(text);
        return new MaaTaskRunResult(
            entry,
            "Succeeded",
            true,
            "detail",
            $"{{\"filtered_results\":[{{\"text\":{encodedText},\"score\":{score.ToString(System.Globalization.CultureInfo.InvariantCulture)}}}]}}",
            "OCR",
            true);
    }
}

static void LocalCandidateConverterAllProfiles()
{
    var catalog = RhodesRunCatalog.LoadDefault();
    var relic = catalog.Relics.First(item => item.CampaignId == catalog.Current.CampaignId);
    var candidates = RhodesMaaLocalCandidateConverter.FromTaskResults(
        null,
        [
            M("RhodesOcrRegion_run_hope_current", "3", 0.94),
            M("RhodesOcrRegion_run_hope_max", "8", 0.92),
            M("RhodesOcrRegion_operator_name_left_1", "グム", 0.91),
            M("RhodesOcrRegion_relic_list_text", relic.Name, 0.90),
            M("RhodesOcrRegion_is5_thought_list_text", "走る都市", 0.89),
            M("RhodesOcrRegion_is5_age_detail_text", "天災の時代（全盛期）", 0.88),
        ]);

    Equal("hope|maxHope", string.Join("|", candidates.Where(item => item.Kind == "runStatus").Select(item => item.Field)), "all profile run fields");
    Equal("gummy", string.Join("|", candidates.Where(item => item.Kind == "operator").Select(item => item.OperatorId)), "all profile operator");
    Equal(relic.Id, string.Join("|", candidates.Where(item => item.Kind == "relic").Select(item => item.RelicId)), "all profile relic");
    Equal("is5_sarkaz_selectable_thought_insp_20", string.Join("|", candidates.Where(item => item.Kind == "thought").Select(item => item.ThoughtId)), "all profile thought");
    Equal("is5_sarkaz_selectable_age_is5_age_01_prime", string.Join("|", candidates.Where(item => item.Kind == "age").Select(item => item.AgeId)), "all profile age");

    static MaaTaskRunResult M(string entry, string text, double score)
    {
        var encodedText = System.Text.Json.JsonSerializer.Serialize(text);
        return new MaaTaskRunResult(
            entry,
            "Succeeded",
            true,
            "detail",
            $"{{\"filtered_results\":[{{\"text\":{encodedText},\"score\":{score.ToString(System.Globalization.CultureInfo.InvariantCulture)}}}]}}",
            "OCR",
            true);
    }
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

static void ResourceProfileOrder()
{
    var tasks = new[]
    {
        new MaaResourceTaskPreview("relic", "秘宝", "", ["relicsFull"]),
        new MaaResourceTaskPreview("age", "時代", "", ["is5AgeFull"]),
        new MaaResourceTaskPreview("operator", "オペレーター", "", ["operatorsFull"]),
        new MaaResourceTaskPreview("unknown", "将来追加", "", ["futureProfile"]),
        new MaaResourceTaskPreview("run", "基礎情報", "", ["runStatusFull"]),
        new MaaResourceTaskPreview("thought", "思案", "", ["is5ThoughtFull"]),
    };

    var profiles = RhodesMaaResourceCatalog.ProfileGroups(tasks).Select(profile => profile.Id).ToArray();
    Equal("all|runStatusFull|operatorsFull|relicsFull|is5ThoughtFull|is5AgeFull|futureProfile", string.Join("|", profiles), "profile order");
}

static void RunCatalogLoadsChoices()
{
    var catalog = RhodesRunCatalog.LoadDefault();
    var is5 = catalog.Campaigns.Single(campaign => campaign.Id == "is5_sarkaz");
    var is5Relics = catalog.Relics.Where(relic => relic.CampaignId == is5.Id).ToArray();

    Equal(5, catalog.Campaigns.Count, "campaign count");
    Equal("IS#5 サルカズの炉辺奇談", is5.DisplayName, "campaign label");
    var gummy = catalog.Operators.Single(item => item.Name == "グム" && item.OperatorClass == "重装");
    Equal(true, catalog.Operators.Any(item => item.Name == "グム" && item.OperatorClass == "重装"), "operator data");
    Equal(true, File.Exists(gummy.ImagePath), "operator image path");
    Equal(false, gummy.Detail.Contains("入手", StringComparison.Ordinal), "operator obtain method hidden");
    Equal(false, gummy.Detail.Contains("タグ", StringComparison.Ordinal), "operator tags hidden");
    Equal(false, gummy.SearchText.Contains("公開求人", StringComparison.Ordinal), "operator obtain method search hidden");
    Equal(false, gummy.SearchText.Contains("タグ", StringComparison.Ordinal), "operator tag search hidden");
    Equal(296, is5Relics.Length, "is5 relic count");
    Equal(true, File.Exists(is5Relics.First(item => item.Name == "特選獣肉缶詰").ImagePath), "relic image path");
    Equal(true, catalog.Current.SelectedRelicIds.Contains("is5_sarkaz_relic_254"), "current relic selection");
    Equal("is5_sarkaz", catalog.Current.CampaignId, "current campaign");
    Equal(0, catalog.Current.Idea, "current idea");

    var is5SpecialFields = (catalog.Current.SpecialFields ?? []).Where(field => field.CampaignId == "is5_sarkaz").ToArray();
    Equal(3, is5SpecialFields.Length, "is5 special field count");
    Equal("構想", is5SpecialFields.Single(field => field.FieldId == "idea").Label, "idea label");
    Equal("0", is5SpecialFields.Single(field => field.FieldId == "idea").Value, "idea value");
    Equal("思案", is5SpecialFields.Single(field => field.FieldId == "thought").Label, "thought label");
    Equal("0個", is5SpecialFields.Single(field => field.FieldId == "thought").Value, "thought value");
    Equal("時代", is5SpecialFields.Single(field => field.FieldId == "age").Label, "age label");
    Equal("未選択", is5SpecialFields.Single(field => field.FieldId == "age").Value, "age value");
    Equal(false, is5SpecialFields.Any(field => field.Label == "想念"), "obsolete idea label");
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

    var vanguards = RhodesChoiceFilter.Apply(items, new SukiChoiceFilterOptions(OperatorClass: "先鋒")).ToArray();
    Equal(1, vanguards.Length, "class filter excludes hidden by default");
    Equal("テンニンカ", vanguards[0].Name, "class filter item");

    var rarity4 = RhodesChoiceFilter.Apply(items, new SukiChoiceFilterOptions(Rarity: "★4")).ToArray();
    Equal(2, rarity4.Length, "rarity filter count");

    var relics = new[]
    {
        new SukiChoiceItem("relic", "r1", "特選獣肉缶詰", "No.001 食品", "", "", "is5_sarkaz", "食品", 0, 1, false),
        new SukiChoiceItem("relic", "r2", "古城の手記", "No.002 書物", "", "", "is5_sarkaz", "書物", 0, 2, false),
        new SukiChoiceItem("relic", "r3", "別IS", "No.001 食品", "", "", "is4_sami", "食品", 0, 1, false),
    };
    var foodRelics = RhodesChoiceFilter.Apply(relics, new SukiChoiceFilterOptions(CampaignId: "is5_sarkaz", Category: "食品")).ToArray();
    Equal(1, foodRelics.Length, "relic category filter count");
    Equal("特選獣肉缶詰", foodRelics[0].Name, "relic category filter item");
}

static void ChoiceRows()
{
    var items = Enumerable.Range(0, 5)
        .Select(index => new SukiChoiceItem("operator", $"op{index}", $"op{index}", "★4 先鋒 / 旗手", "先鋒", "旗手", "", "", 4, index, false))
        .ToArray();

    var rows = RhodesChoiceRows.Build(items, 4).ToArray();
    Equal(2, rows.Length, "four pane row count");
    Equal(4, rows[0].Columns, "four pane column count");
    Equal(4, rows[0].Items.Count, "first row item count");
    Equal(1, rows[1].Items.Count, "last row item count");

    var lowClampRows = RhodesChoiceRows.Build(items, 0).ToArray();
    Equal(1, lowClampRows[0].Columns, "low column clamp");
    Equal(5, lowClampRows.Length, "one pane row count");

    var highClampRows = RhodesChoiceRows.Build(items, 9).ToArray();
    Equal(4, highClampRows[0].Columns, "high column clamp");
    Equal(2, highClampRows.Length, "high clamp row count");
}

static void OperatorTaxonomyOrder()
{
    var classes = RhodesOperatorTaxonomy.SortClasses(
    [
        "医療",
        "先鋒",
        "特殊",
        "術師",
        "前衛",
        "重装",
        "補助",
        "狙撃",
    ]);
    Equal("先鋒|前衛|重装|狙撃|術師|医療|補助|特殊", string.Join("|", classes), "class order");

    var specialBranches = RhodesOperatorTaxonomy.SortBranches(
    [
        ("行商人", "特殊"),
        ("罠師", "特殊"),
        ("執行者", "特殊"),
        ("潜伏者", "特殊"),
        ("鬼才", "特殊"),
        ("傀儡師", "特殊"),
        ("推撃手", "特殊"),
        ("鉤縄師", "特殊"),
        ("錬金士", "特殊"),
        ("巡空者", "特殊"),
    ]);
    Equal("執行者|推撃手|潜伏者|鉤縄師|鬼才|行商人|罠師|傀儡師|錬金士|巡空者", string.Join("|", specialBranches), "specialist branch order");

    var mixedBranches = RhodesOperatorTaxonomy.SortBranches(
    [
        ("巡空者", "特殊"),
        ("医師", "医療"),
        ("先駆兵", "先鋒"),
        ("行商人", "特殊"),
        ("闘士", "前衛"),
        ("重盾衛士", "重装"),
        ("守望者", "医療"),
        ("速射手", "狙撃"),
        ("拡散術師", "術師"),
        ("緩速師", "補助"),
    ]);
    Equal("先駆兵|闘士|重盾衛士|速射手|拡散術師|医師|守望者|緩速師|行商人|巡空者", string.Join("|", mixedBranches), "mixed branch order");
}

static void ChoicePersistence()
{
    var operators = new[]
    {
        new SukiChoiceItem("operator", "gummy", "グム", "★4 重装 / 庇護衛士", "重装", "庇護衛士", "", "", 4, 1, false),
        new SukiChoiceItem("operator", "rain", "レイン", "★5 狙撃 / 速射手", "狙撃", "速射手", "", "", 5, 2, false),
    };
    operators[0].IsSelected = true;
    operators[1].IsExcluded = true;

    var relics = new[]
    {
        new SukiChoiceItem("relic", "is5_sarkaz_relic_001", "秘宝A", "No.001", "", "", "is5_sarkaz", "食品", 0, 1, false),
        new SukiChoiceItem("relic", "is5_sarkaz_relic_002", "秘宝B", "No.002", "", "", "is5_sarkaz", "食品", 0, 2, false),
    };
    relics[0].IsSelected = true;
    relics[1].IsExcluded = true;

    var state = JsonNode.Parse(
        """
        {
          "version": 1,
          "run": { "campaignId": "is5_sarkaz", "hope": 3 },
          "operators": ["old"],
          "relics": [],
          "preferences": { "ocrEngine": "profile" }
        }
        """)!.AsObject();
    var updated = RhodesRunStateStore.ApplyChoices(
        state,
        operators,
        relics,
        new SukiChoicePersistenceOptions(true, true, false, false, true, true, 4, 3),
        DateTimeOffset.Parse("2026-07-01T00:00:00Z"));

    Equal("gummy", updated["operators"]!.AsArray()[0]!.GetValue<string>(), "selected operator");
    Equal("is5_sarkaz_relic_001", updated["relics"]!.AsArray()[0]!.GetValue<string>(), "selected relic");
    var preferences = updated["preferences"]!.AsObject();
    Equal("rain", preferences["operatorExcludedIds"]!.AsArray()[0]!.GetValue<string>(), "operator exclusion");
    Equal("is5_sarkaz_relic_002", preferences["relicExcludedIds"]!.AsArray()[0]!.GetValue<string>(), "relic exclusion");
    Equal(true, preferences["operatorShowSelectedFirst"]!.GetValue<bool>(), "operator selected first preference");
    Equal(true, preferences["operatorHideExcluded"]!.GetValue<bool>(), "operator hide excluded preference");
    Equal(false, preferences["operatorSelectedOnly"]!.GetValue<bool>(), "operator selected only preference");
    Equal(false, preferences["relicShowSelectedFirst"]!.GetValue<bool>(), "relic selected first preference");
    Equal(true, preferences["relicHideExcluded"]!.GetValue<bool>(), "relic hide excluded preference");
    Equal(true, preferences["relicSelectedOnly"]!.GetValue<bool>(), "relic selected only preference");
    Equal(4, preferences["operatorGridColumns"]!.GetValue<int>(), "operator grid columns");
    Equal(3, preferences["relicGridColumns"]!.GetValue<int>(), "relic grid columns");
    Equal("2026-07-01T00:00:00.0000000Z", updated["updatedAt"]!.GetValue<string>(), "updatedAt");
    Equal(3, updated["run"]!.AsObject()["hope"]!.GetValue<int>(), "existing run state preserved");
}

static void RunContextPersistence()
{
    var state = JsonNode.Parse(
        """
        {
          "version": 1,
          "run": {
            "campaignId": "is3_mizuki",
            "squad": "分隊A",
            "difficulty": "等級12",
            "hope": 5,
            "maxHope": 8,
            "ingot": 21,
            "lifePoints": 4,
            "shield": 2,
            "commandLevel": 6,
            "idea": 3,
            "special": { "is3_mizuki": { "light": 20 } }
          },
          "operators": ["gummy"],
          "relics": ["is3_relic_001"],
          "preferences": { "operatorGridColumns": 4 }
        }
        """)!.AsObject();
    var updated = RhodesRunStateStore.ApplyRunContext(
        state,
        "is5_sarkaz",
        DateTimeOffset.Parse("2026-07-01T00:00:00Z"));
    var run = updated["run"]!.AsObject();
    Equal("is5_sarkaz", run["campaignId"]!.GetValue<string>(), "campaign id");
    Equal(false, run.ContainsKey("hope"), "stale hope removed");
    Equal(false, run.ContainsKey("maxHope"), "stale max hope removed");
    Equal(false, run.ContainsKey("squad"), "stale squad removed");
    Equal(false, run.ContainsKey("special"), "stale special values removed");
    Equal(1, run["commandLevel"]!.GetValue<int>(), "command level reset");
    Equal("gummy", updated["operators"]!.AsArray()[0]!.GetValue<string>(), "operators preserved");
    Equal("is3_relic_001", updated["relics"]!.AsArray()[0]!.GetValue<string>(), "relics preserved");
    Equal(4, updated["preferences"]!.AsObject()["operatorGridColumns"]!.GetValue<int>(), "preferences preserved");
    Equal("2026-07-01T00:00:00.0000000Z", updated["updatedAt"]!.GetValue<string>(), "updatedAt");

    var sameCampaign = JsonNode.Parse("""{ "run": { "campaignId": "is5_sarkaz", "hope": 3 } }""")!.AsObject();
    RhodesRunStateStore.ApplyRunContext(sameCampaign, "is5_sarkaz", DateTimeOffset.Parse("2026-07-01T00:00:00Z"));
    Equal(3, sameCampaign["run"]!.AsObject()["hope"]!.GetValue<int>(), "same campaign keeps run values");
}

static void CandidateRunStatusApply()
{
    var state = JsonNode.Parse(
        """
        {
          "run": {
            "campaignId": "is5_sarkaz",
            "hope": 0,
            "special": { "is5_sarkaz": { "idea": 0 } }
          },
          "operators": ["gummy"]
        }
        """)!.AsObject();
    var candidates = new[]
    {
        new MaaCandidatePreview("runStatus", "希望", "3", "3", 0.94, Field: "hope"),
        new MaaCandidatePreview("runStatus", "希望上限", "8", "8", 0.95, Field: "maxHope"),
        new MaaCandidatePreview("runStatus", "源石錐", "20", "20", 0.96, Field: "ingot"),
        new MaaCandidatePreview("runStatus", "指揮Lv", "0", "0", 0.80, Field: "commandLevel"),
        new MaaCandidatePreview("runStatus", "等級", "18", "18", 0.88, Field: "difficulty"),
        new MaaCandidatePreview("runStatus", "構想", "7", "7", 0.86, Field: "idea", CampaignId: "is5_sarkaz"),
        new MaaCandidatePreview("operator", "グム", "gummy", "グム", 0.91, OperatorId: "gummy"),
        new MaaCandidatePreview("runStatus", "壊れた値", "abc", "abc", 0.20, Field: "shield"),
    };

    var summary = RhodesRecognitionCandidateApplier.ApplyRunStatus(
        state,
        candidates,
        DateTimeOffset.Parse("2026-07-01T00:00:00Z"));

    Equal(6, summary.AppliedCount, "applied count");
    Equal(2, summary.IgnoredCount, "ignored count");
    Equal("hope|maxHope|ingot|commandLevel|difficulty|idea", string.Join("|", summary.AppliedFields), "applied fields");
    var run = state["run"]!.AsObject();
    Equal(3, run["hope"]!.GetValue<int>(), "hope");
    Equal(8, run["maxHope"]!.GetValue<int>(), "max hope");
    Equal(20, run["ingot"]!.GetValue<int>(), "ingot");
    Equal(1, run["commandLevel"]!.GetValue<int>(), "command clamped");
    Equal(18, run["difficulty"]!.GetValue<int>(), "difficulty");
    Equal(7, run["special"]!.AsObject()["is5_sarkaz"]!.AsObject()["idea"]!.GetValue<int>(), "idea");
    Equal("gummy", state["operators"]!.AsArray()[0]!.GetValue<string>(), "unrelated selections preserved");
    Equal("2026-07-01T00:00:00.0000000Z", state["updatedAt"]!.GetValue<string>(), "updatedAt");
}

static void CandidateChoiceApply()
{
    var state = JsonNode.Parse(
        """
        {
          "run": { "campaignId": "is5_sarkaz" },
          "operators": ["gummy"],
          "relics": ["is5_sarkaz_relic_001"]
        }
        """)!.AsObject();
    var candidates = new[]
    {
        new MaaCandidatePreview("operator", "レイン", "rain", "レイン", 0.92, OperatorId: "rain"),
        new MaaCandidatePreview("operator", "重複", "gummy", "グム", 0.91, OperatorId: "gummy"),
        new MaaCandidatePreview("relic", "秘宝B", "is5_sarkaz_relic_002", "秘宝B", 0.86, RelicId: "is5_sarkaz_relic_002", CampaignId: "is5_sarkaz"),
        new MaaCandidatePreview("relic", "別IS秘宝", "is3_relic_001", "別IS秘宝", 0.86, RelicId: "is3_relic_001", CampaignId: "is3_mizuki"),
        new MaaCandidatePreview("thought", "別IS思案", "thought_001", "思案", 0.86, CampaignId: "is4_sami", ThoughtId: "thought_001"),
    };

    var summary = RhodesRecognitionCandidateApplier.Apply(
        state,
        candidates,
        DateTimeOffset.Parse("2026-07-01T00:00:00Z"));

    Equal(2, summary.AppliedCount, "applied choice count");
    Equal(3, summary.IgnoredCount, "ignored choice count");
    Equal("operator:rain|relic:is5_sarkaz_relic_002", string.Join("|", summary.AppliedFields), "applied choices");
    Equal("gummy|rain", string.Join("|", state["operators"]!.AsArray().Select(item => item!.GetValue<string>())), "operators");
    Equal("is5_sarkaz_relic_001|is5_sarkaz_relic_002", string.Join("|", state["relics"]!.AsArray().Select(item => item!.GetValue<string>())), "relics");
    Equal("2026-07-01T00:00:00.0000000Z", state["updatedAt"]!.GetValue<string>(), "choice updatedAt");
}

static void CandidateIs5SpecialApply()
{
    var state = JsonNode.Parse(
        """
        {
          "run": {
            "campaignId": "is5_sarkaz",
            "special": { "is5_sarkaz": { "idea": 21 } }
          }
        }
        """)!.AsObject();
    var candidates = new[]
    {
        new MaaCandidatePreview("thought", "枯れ木と若枝", "fallback_a", "枯れ木と若枝", 0.91, CampaignId: "is5_sarkaz", ThoughtId: "thought_a"),
        new MaaCandidatePreview("thought", "枯れ木と若枝", "fallback_a", "枯れ木と若枝", 0.88, CampaignId: "is5_sarkaz", ThoughtId: "thought_a"),
        new MaaCandidatePreview("thought", "走る都市", "thought_b", "走る都市", 0.86, CampaignId: "is5_sarkaz"),
        new MaaCandidatePreview("age", "形成期", "age_formation", "形成期", 0.65, CampaignId: "is5_sarkaz", AgeId: "age_formation"),
        new MaaCandidatePreview("age", "全盛期", "age_prime", "全盛期", 0.95, CampaignId: "is5_sarkaz", AgeId: "age_prime"),
        new MaaCandidatePreview("age", "別IS時代", "age_other", "別IS時代", 0.99, CampaignId: "is4_sami", AgeId: "age_other"),
    };

    var summary = RhodesRecognitionCandidateApplier.Apply(
        state,
        candidates,
        DateTimeOffset.Parse("2026-07-01T00:00:00Z"));

    Equal(5, summary.AppliedCount, "applied is5 special count");
    Equal(1, summary.IgnoredCount, "ignored is5 special count");
    Equal("thought:thought_a|thought:thought_a|thought:thought_b|age:age_formation|age:age_prime", string.Join("|", summary.AppliedFields), "applied is5 special fields");
    var special = state["run"]!.AsObject()["special"]!.AsObject()["is5_sarkaz"]!.AsObject();
    var thought = special["thought"]!.AsArray();
    Equal(2, thought.Count, "thought item count");
    Equal("thought_a", thought[0]!.AsObject()["effectId"]!.GetValue<string>(), "first thought id");
    Equal(2, thought[0]!.AsObject()["count"]!.GetValue<int>(), "first thought count");
    Equal("thought_b", thought[1]!.AsObject()["effectId"]!.GetValue<string>(), "second thought id");
    Equal(1, thought[1]!.AsObject()["count"]!.GetValue<int>(), "second thought count");
    Equal("age_prime", special["age"]!.GetValue<string>(), "best age");
    Equal(21, special["idea"]!.GetValue<int>(), "existing idea preserved");
    Equal("2026-07-01T00:00:00.0000000Z", state["updatedAt"]!.GetValue<string>(), "is5 special updatedAt");
}

static void Equal<T>(T expected, T actual, string label)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
        throw new InvalidOperationException($"{label}: expected {expected}, got {actual}");
}
