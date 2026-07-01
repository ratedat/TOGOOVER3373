using System.Text.Json;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesMaaResourceCatalog
{
    private static readonly IReadOnlyDictionary<string, string> ProfileLabels = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["all"] = "すべて",
        ["runStatusFull"] = "基礎情報",
        ["operatorsFull"] = "オペレーター",
        ["relicsFull"] = "秘宝",
        ["is4RevelationFull"] = "啓示",
        ["is5ThoughtFull"] = "思案",
        ["is5AgeFull"] = "時代",
        ["is6CoinsFull"] = "通宝",
    };

    private static readonly IReadOnlyDictionary<string, int> ProfileOrder = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["runStatusFull"] = 10,
        ["operatorsFull"] = 20,
        ["relicsFull"] = 30,
        ["is4RevelationFull"] = 40,
        ["is5ThoughtFull"] = 50,
        ["is5AgeFull"] = 60,
        ["is6CoinsFull"] = 70,
    };

    public static IReadOnlyList<MaaResourceTaskPreview> DefaultTasks()
    {
        var tasks = new Dictionary<string, MaaResourceTaskPreview>(StringComparer.Ordinal);
        foreach (var task in ManualTasks().Concat(GeneratedTasks()))
        {
            tasks.TryAdd(task.Entry, task);
        }

        return tasks.Values.ToList();
    }

    public static IReadOnlyList<MaaResourceProfilePreview> ProfileGroups(IReadOnlyList<MaaResourceTaskPreview> tasks)
    {
        var groups = tasks
            .SelectMany(task => task.ProfileIds ?? [])
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.Ordinal)
            .Select(id => new MaaResourceProfilePreview(
                id,
                ProfileLabels.TryGetValue(id, out var label) ? label : id,
                tasks.Count(task => TaskAppliesToProfile(task, id))))
            .OrderBy(group => ProfileOrder.TryGetValue(group.Id, out var order) ? order : int.MaxValue)
            .ThenBy(group => group.Label, StringComparer.Ordinal)
            .ToList();

        groups.Insert(0, new MaaResourceProfilePreview("all", ProfileLabels["all"], tasks.Count));
        return groups;
    }

    public static bool TaskAppliesToProfile(MaaResourceTaskPreview task, string? profileId)
    {
        if (string.IsNullOrWhiteSpace(profileId) || profileId == "all")
            return true;
        return task.ProfileIds?.Contains(profileId, StringComparer.Ordinal) == true;
    }

    private static IReadOnlyList<MaaResourceTaskPreview> ManualTasks()
    {
        return
        [
            new MaaResourceTaskPreview(
                "RhodesRunStatusTopBarOcr",
                "基本情報: 上部OCR",
                "希望、源石錐、階層タイトル周辺をMAA-OCRで確認します。",
                ["runStatusFull"]),
            new MaaResourceTaskPreview(
                "RhodesRunStatusHopeIcon",
                "基本情報: 希望アイコン",
                "1280x720基準の希望アイコンTemplateMatchをMAAで実行します。",
                ["runStatusFull"]),
            new MaaResourceTaskPreview(
                "RhodesRunStatusIdeaIcon",
                "基本情報: 構想アイコン",
                "構想値の基準点になるアイコンTemplateMatchをMAAで実行します。",
                ["runStatusFull"]),
            new MaaResourceTaskPreview(
                "RhodesRunStatusIngotIcon",
                "基本情報: 源石錐アイコン",
                "源石錐の基準点になるアイコンTemplateMatchをMAAで実行します。",
                ["runStatusFull"]),
            new MaaResourceTaskPreview(
                "RhodesRunStatusLifeIcon",
                "基本情報: 耐久値アイコン",
                "耐久値の基準点になるアイコンTemplateMatchをMAAで実行します。",
                ["runStatusFull"]),
            new MaaResourceTaskPreview(
                "RhodesRunStatusShieldIcon",
                "基本情報: シールドアイコン",
                "シールドの基準点になるアイコンTemplateMatchをMAAで実行します。",
                ["runStatusFull"]),
            new MaaResourceTaskPreview(
                "RhodesOperatorCodenameFlag",
                "オペレーター: CODENAME",
                "招集カード内のCODENAME目印をMAA TemplateMatchで検出します。",
                ["operatorsFull"]),
            new MaaResourceTaskPreview(
                "RhodesOperatorNameOcr",
                "オペレーター: 名前OCR",
                "招集カード領域をMAA-OCRで読ませます。",
                ["operatorsFull"]),
            new MaaResourceTaskPreview(
                "RhodesRelicButton",
                "画面判定: 秘宝ボタン",
                "マップ下部の秘宝ボタンをMAA TemplateMatchで検出します。",
                ["relicsFull"]),
            new MaaResourceTaskPreview(
                "RhodesOperatorButton",
                "画面判定: 隊員ボタン",
                "マップ下部の隊員ボタンをMAA TemplateMatchで検出します。",
                ["operatorsFull"]),
            new MaaResourceTaskPreview(
                "RhodesThoughtButton",
                "画面判定: 思案ボタン",
                "マップ下部の思案ボタンをMAA TemplateMatchで検出します。",
                ["is5ThoughtFull"]),
            new MaaResourceTaskPreview(
                "RhodesScreen_run_map_footer",
                "生成: マップ下部OCR",
                "data/recognition/maa-tasks.json から生成したマップフッター判定です。",
                ["runStatusFull", "operatorsFull", "relicsFull", "is4RevelationFull", "is5ThoughtFull", "is5AgeFull", "is6CoinsFull"]),
            new MaaResourceTaskPreview(
                "RhodesOcrRegion_run_hope_current",
                "生成: 現在希望OCR",
                "既存ROI定義から生成した現在希望OCRです。",
                ["runStatusFull"]),
            new MaaResourceTaskPreview(
                "RhodesOcrRegion_run_hope_max",
                "生成: 最大希望OCR",
                "既存ROI定義から生成した最大希望OCRです。",
                ["runStatusFull"]),
            new MaaResourceTaskPreview(
                "RhodesTemplate_runStatusFull_run_hope_current",
                "生成: 希望アイコン基準点",
                "scan-profiles.json の templateOcrRegions から生成したTemplateMatchです。",
                ["runStatusFull"]),
            new MaaResourceTaskPreview(
                "RhodesTemplate_runStatusFull_run_ingot",
                "生成: 源石錐基準点",
                "scan-profiles.json の templateOcrRegions から生成したTemplateMatchです。",
                ["runStatusFull"]),
            new MaaResourceTaskPreview(
                "RhodesTemplate_operatorsFull_operator_recruit_name",
                "生成: 招集名基準点",
                "CODENAME目印から招集カード名ROIを作るためのTemplateMatchです。",
                ["operatorsFull"]),
        ];
    }

    private static IReadOnlyList<MaaResourceTaskPreview> GeneratedTasks()
    {
        var path = Path.Combine(
            AppContext.BaseDirectory,
            "resource",
            "base",
            "pipeline",
            "rhodes-generated.json");
        if (!File.Exists(path))
            return [];

        var tasks = new List<MaaResourceTaskPreview>();
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            foreach (var node in document.RootElement.EnumerateObject())
            {
                if (node.NameEquals("RhodesGeneratedEmpty"))
                    continue;

                var attach = node.Value.TryGetProperty("attach", out var attachValue) ? attachValue : default;
                var label = JsonString(attach, "label");
                var source = JsonString(attach, "source");
                var id = JsonString(attach, "id");
                var recognition = JsonString(node.Value, "recognition");
                var profileIds = JsonStrings(attach, "profileIds");
                var profileId = JsonString(attach, "profileId");
                if (!string.IsNullOrWhiteSpace(profileId) && !profileIds.Contains(profileId, StringComparer.Ordinal))
                    profileIds = [.. profileIds, profileId];
                var generatedLabel = string.IsNullOrWhiteSpace(label) ? node.Name : label;
                var generatedPurpose = string.Join(
                    " / ",
                    new[] { recognition, source, id }.Where(part => !string.IsNullOrWhiteSpace(part)));

                tasks.Add(new MaaResourceTaskPreview(
                    node.Name,
                    $"生成: {generatedLabel}",
                    string.IsNullOrWhiteSpace(generatedPurpose) ? "生成済みMAA Resourceノードです。" : generatedPurpose,
                    profileIds,
                    source));
            }
        }
        catch
        {
            return [];
        }

        return tasks;
    }

    private static string JsonString(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.String
            ? property.GetString() ?? ""
            : "";
    }

    private static IReadOnlyList<string> JsonStrings(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property))
            return [];
        if (property.ValueKind == JsonValueKind.String)
            return [property.GetString() ?? ""];
        if (property.ValueKind != JsonValueKind.Array)
            return [];
        return property.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString() ?? "")
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
    }
}
