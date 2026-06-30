using System.Text.Json;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesMaaResourceCatalog
{
    public static IReadOnlyList<MaaResourceTaskPreview> DefaultTasks()
    {
        var tasks = new Dictionary<string, MaaResourceTaskPreview>(StringComparer.Ordinal);
        foreach (var task in ManualTasks().Concat(GeneratedTasks()))
        {
            tasks.TryAdd(task.Entry, task);
        }

        return tasks.Values.ToList();
    }

    private static IReadOnlyList<MaaResourceTaskPreview> ManualTasks()
    {
        return
        [
            new MaaResourceTaskPreview(
                "RhodesRunStatusTopBarOcr",
                "基本情報: 上部OCR",
                "希望、源石錐、階層タイトル周辺をMAA-OCRで確認します。"),
            new MaaResourceTaskPreview(
                "RhodesRunStatusHopeIcon",
                "基本情報: 希望アイコン",
                "1280x720基準の希望アイコンTemplateMatchをMAAで実行します。"),
            new MaaResourceTaskPreview(
                "RhodesRunStatusIdeaIcon",
                "基本情報: 構想アイコン",
                "構想値の基準点になるアイコンTemplateMatchをMAAで実行します。"),
            new MaaResourceTaskPreview(
                "RhodesRunStatusIngotIcon",
                "基本情報: 源石錐アイコン",
                "源石錐の基準点になるアイコンTemplateMatchをMAAで実行します。"),
            new MaaResourceTaskPreview(
                "RhodesRunStatusLifeIcon",
                "基本情報: 耐久値アイコン",
                "耐久値の基準点になるアイコンTemplateMatchをMAAで実行します。"),
            new MaaResourceTaskPreview(
                "RhodesRunStatusShieldIcon",
                "基本情報: シールドアイコン",
                "シールドの基準点になるアイコンTemplateMatchをMAAで実行します。"),
            new MaaResourceTaskPreview(
                "RhodesOperatorCodenameFlag",
                "オペレーター: CODENAME",
                "招集カード内のCODENAME目印をMAA TemplateMatchで検出します。"),
            new MaaResourceTaskPreview(
                "RhodesOperatorNameOcr",
                "オペレーター: 名前OCR",
                "招集カード領域をMAA-OCRで読ませます。"),
            new MaaResourceTaskPreview(
                "RhodesRelicButton",
                "画面判定: 秘宝ボタン",
                "マップ下部の秘宝ボタンをMAA TemplateMatchで検出します。"),
            new MaaResourceTaskPreview(
                "RhodesOperatorButton",
                "画面判定: 隊員ボタン",
                "マップ下部の隊員ボタンをMAA TemplateMatchで検出します。"),
            new MaaResourceTaskPreview(
                "RhodesThoughtButton",
                "画面判定: 思案ボタン",
                "マップ下部の思案ボタンをMAA TemplateMatchで検出します。"),
            new MaaResourceTaskPreview(
                "RhodesScreen_run_map_footer",
                "生成: マップ下部OCR",
                "data/recognition/maa-tasks.json から生成したマップフッター判定です。"),
            new MaaResourceTaskPreview(
                "RhodesOcrRegion_run_hope_current",
                "生成: 現在希望OCR",
                "既存ROI定義から生成した現在希望OCRです。"),
            new MaaResourceTaskPreview(
                "RhodesOcrRegion_run_hope_max",
                "生成: 最大希望OCR",
                "既存ROI定義から生成した最大希望OCRです。"),
            new MaaResourceTaskPreview(
                "RhodesTemplate_runStatusFull_run_hope_current",
                "生成: 希望アイコン基準点",
                "scan-profiles.json の templateOcrRegions から生成したTemplateMatchです。"),
            new MaaResourceTaskPreview(
                "RhodesTemplate_runStatusFull_run_ingot",
                "生成: 源石錐基準点",
                "scan-profiles.json の templateOcrRegions から生成したTemplateMatchです。"),
            new MaaResourceTaskPreview(
                "RhodesTemplate_operatorsFull_operator_recruit_name",
                "生成: 招集名基準点",
                "CODENAME目印から招集カード名ROIを作るためのTemplateMatchです。"),
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
                var generatedLabel = string.IsNullOrWhiteSpace(label) ? node.Name : label;
                var generatedPurpose = string.Join(
                    " / ",
                    new[] { recognition, source, id }.Where(part => !string.IsNullOrWhiteSpace(part)));

                tasks.Add(new MaaResourceTaskPreview(
                    node.Name,
                    $"生成: {generatedLabel}",
                    string.IsNullOrWhiteSpace(generatedPurpose) ? "生成済みMAA Resourceノードです。" : generatedPurpose));
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
}
