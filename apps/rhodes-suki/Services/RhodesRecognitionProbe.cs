using System.Text.Json;
using System.Text.Json.Serialization;
using MaaFramework.Binding;
using MaaFramework.Binding.Buffers;
using RhodesSuki.Models;

namespace RhodesSuki.Services;

public static class RhodesRecognitionProbe
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static IReadOnlyList<MaaProbePayloadPreview> DefaultPayloads()
    {
        var fullFrameRoi = new MaaRoi(0, 0, RhodesMaaPaths.BaseResolution.Width, RhodesMaaPaths.BaseResolution.Height);
        var ingotNumberRoi = new MaaRoi(1160, 0, 90, 56);
        var ideaNumberRoi = new MaaRoi(818, 655, 44, 34);
        var operatorNameRoi = new MaaRoi(900, 260, 260, 56);

        return
        [
            new MaaProbePayloadPreview("FullFrame OCR", "スクショ全体のMAA-OCR疎通確認", BuildOcrPayload(fullFrameRoi, onlyRecognition: true)),
            new MaaProbePayloadPreview("Ingot OCR", "源石錐の数値ROI確認", BuildOcrPayload(ingotNumberRoi, onlyRecognition: true)),
            new MaaProbePayloadPreview("IS#5 Idea OCR", "構想アイコン直下の数値ROI確認", BuildOcrPayload(ideaNumberRoi, onlyRecognition: true)),
            new MaaProbePayloadPreview("Operator Name OCR", "招集カード名のROI確認", BuildOcrPayload(operatorNameRoi, onlyRecognition: true)),
            new MaaProbePayloadPreview("TemplateMatch", "ユーザー切り出し基準点の検出確認", BuildTemplateMatchPayload(new MaaRoi(0, 0, 1280, 720), "template.png")),
        ];
    }

    public static string BuildOcrPayload(
        MaaRoi roi,
        string? expected = null,
        double? threshold = null,
        bool onlyRecognition = true)
    {
        var payload = new Dictionary<string, object?>
        {
            ["recognition"] = "OCR",
            ["roi"] = roi.ToArray(),
            ["expected"] = string.IsNullOrWhiteSpace(expected) ? null : expected,
            ["threshold"] = threshold,
            ["only_rec"] = onlyRecognition,
        };
        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    public static string BuildTemplateMatchPayload(
        MaaRoi roi,
        string template,
        double threshold = 0.7,
        bool greenMask = false,
        int method = 5)
    {
        var payload = new Dictionary<string, object?>
        {
            ["recognition"] = "TemplateMatch",
            ["roi"] = roi.ToArray(),
            ["template"] = template,
            ["threshold"] = threshold,
            ["green_mask"] = greenMask,
            ["method"] = method,
        };
        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    public static string BuildClickPayload(MaaRoi target)
    {
        var payload = new Dictionary<string, object?>
        {
            ["action"] = "Click",
            ["target"] = target.ToArray(),
        };
        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    public static async Task<MaaProbeResult> RunRecognitionAsync(
        MaaTasker tasker,
        string name,
        string payload,
        byte[] encodedImage,
        CancellationToken cancellationToken = default)
    {
        return await Task.Run(() =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            using var image = new MaaImageBuffer();
            image.TrySetEncodedData(encodedImage);
            var job = tasker.AppendRecognition(name, payload, image);
            var status = job.Wait();
            var detail = RhodesMaaSession.BuildTaskDetail(tasker, job.Id, payload);
            return new MaaProbeResult(
                name,
                status.ToString(),
                status == MaaJobStatus.Succeeded,
                detail.Summary,
                detail.RecognitionDetailJson,
                detail.Algorithm,
                detail.Hit);
        }, cancellationToken);
    }
}
