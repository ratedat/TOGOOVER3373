import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("Suki shell references SukiUI and Maa.Framework as the replacement desktop stack", async () => {
  const csproj = await fs.readFile("apps/rhodes-suki/RhodesSuki.csproj", "utf8");
  const packageJson = await fs.readFile("package.json", "utf8");

  assert.match(csproj, /PackageReference Include="SukiUI" Version="7\.0\.1"/);
  assert.match(csproj, /PackageReference Include="Maa\.Framework" Version="5\.8\.0"/);
  assert.match(csproj, /resource\\base\\pipeline\\rhodes\.json/);
  assert.match(csproj, /resource\\base\\pipeline\\rhodes-generated\.json/);
  assert.match(csproj, /interface\.json/);
  assert.match(csproj, /assets\\recognition\\templates\\run\\\*\.png/);
  assert.match(packageJson, /"maa:resource:generate": "node tools\/generate-maa-resource\.mjs"/);
  assert.match(packageJson, /suki:publish:portable.*--self-contained true/);
});

test("Suki shell keeps MAA session and probe code in thin RHODES-owned services", async () => {
  const session = await fs.readFile("apps/rhodes-suki/Services/RhodesMaaSession.cs", "utf8");
  const probe = await fs.readFile("apps/rhodes-suki/Services/RhodesRecognitionProbe.cs", "utf8");
  const catalog = await fs.readFile("apps/rhodes-suki/Services/RhodesMaaResourceCatalog.cs", "utf8");
  const models = await fs.readFile("apps/rhodes-suki/Models/MaaSessionModels.cs", "utf8");
  const viewModel = await fs.readFile("apps/rhodes-suki/ViewModels/MainWindowViewModel.cs", "utf8");
  const resource = await fs.readFile("apps/rhodes-suki/resource/base/pipeline/rhodes.json", "utf8");
  const generatedResource = await fs.readFile("apps/rhodes-suki/resource/base/pipeline/rhodes-generated.json", "utf8");
  const projectInterface = await fs.readFile("apps/rhodes-suki/interface.json", "utf8");

  assert.match(session, /new MaaAdbController/);
  assert.match(session, /new MaaTasker/);
  assert.match(session, /GetCachedImage/);
  assert.match(session, /AppendTask/);
  assert.match(session, /GetRecognitionDetail/);
  assert.match(session, /RecognitionDetailJson/);
  assert.match(probe, /AppendRecognition/);
  assert.match(probe, /TemplateMatch/);
  assert.match(probe, /RecognitionDetailJson/);
  assert.match(catalog, /rhodes-generated\.json/);
  assert.match(catalog, /JsonDocument\.Parse/);
  assert.match(catalog, /GeneratedTasks/);
  assert.match(models, /MaaTaskDetailSnapshot/);
  assert.match(models, /RecognitionDetailJson/);
  assert.match(viewModel, /ConnectCommand/);
  assert.match(viewModel, /CaptureCommand/);
  assert.match(viewModel, /RunAllProbesCommand/);
  assert.match(viewModel, /RunAllResourceTasksCommand/);
  assert.match(viewModel, /RunResourceTaskCommand/);
  assert.match(resource, /RhodesRunStatusTopBarOcr/);
  assert.match(resource, /RhodesOperatorCodenameFlag/);
  assert.match(resource, /OperatorCardCodeNameFlag\.png/);
  assert.match(generatedResource, /RhodesOcrRegion_run_hope_current/);
  assert.match(generatedResource, /RhodesTemplate_runStatusFull_run_ingot/);
  assert.match(generatedResource, /scan-profiles\.templateOcrRegions/);
  assert.match(projectInterface, /"interface_version": 2/);
  assert.match(projectInterface, /"entry": "RhodesOperatorNameOcr"/);
  assert.match(resource, /RhodesProbe/);
});

test("MAA resource generator converts RHODES recognition definitions into pipeline nodes", async () => {
  const generator = await fs.readFile("tools/generate-maa-resource.mjs", "utf8");
  const generated = JSON.parse(
    await fs.readFile("apps/rhodes-suki/resource/base/pipeline/rhodes-generated.json", "utf8"),
  );

  assert.match(generator, /data.*recognition.*maa-tasks\.json/s);
  assert.match(generator, /scan-profiles\.json/);
  assert.equal(generated.RhodesOcrRegion_run_hope_current.recognition, "OCR");
  assert.deepEqual(generated.RhodesOcrRegion_run_hope_current.roi, [941, 17, 32, 35]);
  assert.equal(generated.RhodesTemplate_runStatusFull_run_ingot.recognition, "TemplateMatch");
  assert.equal(generated.RhodesTemplate_runStatusFull_run_ingot.template, "run/IngotIcon.png");
});

test("Suki shell exposes manual MAA ADB and probe controls", async () => {
  const xaml = await fs.readFile("apps/rhodes-suki/Views/MainWindow.axaml", "utf8");

  assert.match(xaml, /MAA ADB接続/);
  assert.match(xaml, /AdbPath/);
  assert.match(xaml, /AdbSerial/);
  assert.match(xaml, /ConnectCommand/);
  assert.match(xaml, /CaptureCommand/);
  assert.match(xaml, /RunResourceTaskCommand/);
  assert.match(xaml, /RunAllResourceTasksCommand/);
  assert.match(xaml, /RunProbeCommand/);
  assert.match(xaml, /ResourceTaskResults/);
  assert.match(xaml, /ProbeResults/);
  assert.match(xaml, /RecognitionDetailJson/);
});

test("MAAFramework roadmap records 1280x720 as a 16:9 base coordinate system", async () => {
  const roadmap = await fs.readFile("docs/maaframework-family-roadmap.md", "utf8");
  const notice = await fs.readFile("THIRD_PARTY_NOTICES.md", "utf8");

  assert.match(roadmap, /1280x720/);
  assert.match(roadmap, /16:9/);
  assert.match(roadmap, /maa-resource-scan-runner\.js/);
  assert.match(roadmap, /MFAToolsPlus/);
  assert.match(notice, /SweetSmellFox\/MFAToolsPlus/);
});
