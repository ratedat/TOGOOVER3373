import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  assert.match(csproj, /data\\campaigns\.json/);
  assert.match(csproj, /data\\operators\.json/);
  assert.match(csproj, /data\\relics\.json/);
  assert.match(csproj, /data\\current-state\.json/);
  assert.match(packageJson, /"maa:resource:generate": "node tools\/generate-maa-resource\.mjs"/);
  assert.match(packageJson, /"maa:resource:check": "node tools\/generate-maa-resource\.mjs --check"/);
  assert.match(packageJson, /"suki:test": "dotnet run --project tests\/rhodes-suki\/RhodesSuki\.ServiceTests\.csproj"/);
  assert.match(packageJson, /suki:publish:portable.*--self-contained true/);
});

test("Suki service tests cover MAA Resource detail conversion behavior", async () => {
  const testProject = await fs.readFile("tests/rhodes-suki/RhodesSuki.ServiceTests.csproj", "utf8");
  const program = await fs.readFile("tests/rhodes-suki/Program.cs", "utf8");

  assert.match(testProject, /ProjectReference Include="..\\..\\apps\\rhodes-suki\\RhodesSuki\.csproj"/);
  assert.match(program, /RhodesMaaResultPreview\.FromTaskResults/);
  assert.match(program, /best_result/);
  assert.match(program, /filtered_results/);
  assert.match(program, /TemplateMatch/);
  assert.match(program, /HitFallback/);
  assert.match(program, /RhodesAdbPresetCatalog\.DefaultPresets/);
  assert.match(program, /RhodesAdbDeviceProbe\.ParseDevices/);
  assert.match(program, /RhodesSukiSettingsStore\.Save/);
  assert.match(program, /google-play-games-dev/);
});

test("Suki shell keeps MAA session and probe code in thin RHODES-owned services", async () => {
  const session = await fs.readFile("apps/rhodes-suki/Services/RhodesMaaSession.cs", "utf8");
  const probe = await fs.readFile("apps/rhodes-suki/Services/RhodesRecognitionProbe.cs", "utf8");
  const catalog = await fs.readFile("apps/rhodes-suki/Services/RhodesMaaResourceCatalog.cs", "utf8");
  const adbPresets = await fs.readFile("apps/rhodes-suki/Services/RhodesAdbPresetCatalog.cs", "utf8");
  const adbDeviceProbe = await fs.readFile("apps/rhodes-suki/Services/RhodesAdbDeviceProbe.cs", "utf8");
  const settingsStore = await fs.readFile("apps/rhodes-suki/Services/RhodesSukiSettingsStore.cs", "utf8");
  const diagnostics = await fs.readFile("apps/rhodes-suki/Services/RhodesMaaTaskDiagnostics.cs", "utf8");
  const resultPreview = await fs.readFile("apps/rhodes-suki/Services/RhodesMaaResultPreview.cs", "utf8");
  const runCatalog = await fs.readFile("apps/rhodes-suki/Services/RhodesRunCatalog.cs", "utf8");
  const choiceFilter = await fs.readFile("apps/rhodes-suki/Services/RhodesChoiceFilter.cs", "utf8");
  const models = await fs.readFile("apps/rhodes-suki/Models/MaaSessionModels.cs", "utf8");
  const runModels = await fs.readFile("apps/rhodes-suki/Models/RunCatalogModels.cs", "utf8");
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
  assert.match(catalog, /ProfileGroups/);
  assert.match(catalog, /profileIds/);
  assert.match(adbPresets, /google-play-games-dev/);
  assert.match(adbPresets, /127\.0\.0\.1:6520/);
  assert.match(adbPresets, /127\.0\.0\.1:16384/);
  assert.match(adbDeviceProbe, /devices/);
  assert.match(adbDeviceProbe, /ParseDevices/);
  assert.match(settingsStore, /suki-settings\.json/);
  assert.match(settingsStore, /RhodesSukiSettings/);
  assert.match(diagnostics, /RhodesMaaTaskDiagnostics/);
  assert.match(diagnostics, /RhodesMaaResultPreview\.FromTaskResults/);
  assert.match(resultPreview, /FromTaskResults/);
  assert.match(resultPreview, /best_result/);
  assert.match(resultPreview, /filtered_results/);
  assert.match(resultPreview, /MaaCandidatePreview/);
  assert.match(runCatalog, /campaigns\.json/);
  assert.match(runCatalog, /operators\.json/);
  assert.match(runCatalog, /relics\.json/);
  assert.match(runCatalog, /current-state\.json/);
  assert.match(runCatalog, /SukiRunStateSnapshot/);
  assert.match(choiceFilter, /ShowSelectedFirst/);
  assert.match(choiceFilter, /HideExcluded/);
  assert.match(choiceFilter, /SelectedOnly/);
  assert.match(models, /MaaTaskDetailSnapshot/);
  assert.match(models, /MaaResourceProfilePreview/);
  assert.match(models, /MaaCandidatePreview/);
  assert.match(models, /ProfileIds/);
  assert.match(models, /SourceSummary/);
  assert.match(models, /RecognitionDetailJson/);
  assert.match(runModels, /SukiCampaignPreview/);
  assert.match(runModels, /SukiChoiceItem/);
  assert.match(runModels, /SelectionButtonLabel/);
  assert.match(runModels, /ExclusionButtonLabel/);
  assert.match(viewModel, /ConnectCommand/);
  assert.match(viewModel, /CaptureCommand/);
  assert.match(viewModel, /Bitmap/);
  assert.match(viewModel, /LastCaptureImage/);
  assert.match(viewModel, /AdbPresets/);
  assert.match(viewModel, /AdbDevices/);
  assert.match(viewModel, /ApplyAdbPresetCommand/);
  assert.match(viewModel, /RefreshAdbDevicesCommand/);
  assert.match(viewModel, /ApplyAdbDeviceCommand/);
  assert.match(viewModel, /SaveSettingsCommand/);
  assert.match(viewModel, /LoadSettings/);
  assert.match(viewModel, /ResourceTaskDiagnostics/);
  assert.match(viewModel, /RunAllProbesCommand/);
  assert.match(viewModel, /RunSelectedProfileRecognitionCommand/);
  assert.match(viewModel, /RunAllResourceTasksCommand/);
  assert.match(viewModel, /ExportResourceTaskResultsCommand/);
  assert.match(viewModel, /SelectedResourceProfile/);
  assert.match(viewModel, /RefreshResourceTasks/);
  assert.match(viewModel, /ConvertResourceTaskResultsCommand/);
  assert.match(viewModel, /api\/recognition\/maa-resource/);
  assert.match(viewModel, /CandidateApiProfileId/);
  assert.doesNotMatch(viewModel, /SelectedResourceProfile\?\.Id == "all" \? "runStatusFull"/);
  assert.match(viewModel, /RhodesMaaResultPreview\.FromTaskResults/);
  assert.match(viewModel, /CandidateResults/);
  assert.match(viewModel, /RunResourceTaskCommand/);
  assert.match(viewModel, /maa-resource-results/);
  assert.match(viewModel, /JsonSerializer\.Serialize/);
  assert.match(viewModel, /Campaigns/);
  assert.match(viewModel, /SelectedCampaign/);
  assert.match(viewModel, /FilteredOperators/);
  assert.match(viewModel, /FilteredRelics/);
  assert.match(viewModel, /ToggleChoiceSelectedCommand/);
  assert.match(viewModel, /ToggleChoiceExcludedCommand/);
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

test("MAA resource generator output is checked into the Suki shell", () => {
  execFileSync(process.execPath, ["tools/generate-maa-resource.mjs", "--check"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
});

test("Suki shell exposes manual MAA ADB and probe controls", async () => {
  const xaml = await fs.readFile("apps/rhodes-suki/Views/MainWindow.axaml", "utf8");

  assert.match(xaml, /MAA ADB接続/);
  assert.match(xaml, /AdbPath/);
  assert.match(xaml, /AdbSerial/);
  assert.match(xaml, /AdbPresets/);
  assert.match(xaml, /AdbDevices/);
  assert.match(xaml, /ApplyAdbPresetCommand/);
  assert.match(xaml, /RefreshAdbDevicesCommand/);
  assert.match(xaml, /ApplyAdbDeviceCommand/);
  assert.match(xaml, /SaveSettingsCommand/);
  assert.match(xaml, /ConnectCommand/);
  assert.match(xaml, /CaptureCommand/);
  assert.match(xaml, /Image Source="\{Binding LastCaptureImage\}"/);
  assert.match(xaml, /RunResourceTaskCommand/);
  assert.match(xaml, /RunSelectedProfileRecognitionCommand/);
  assert.match(xaml, /RunAllResourceTasksCommand/);
  assert.match(xaml, /ExportResourceTaskResultsCommand/);
  assert.match(xaml, /SelectedResourceProfile/);
  assert.match(xaml, /ResourceProfiles/);
  assert.match(xaml, /ProfileSummary/);
  assert.match(xaml, /SourceSummary/);
  assert.match(xaml, /ConvertResourceTaskResultsCommand/);
  assert.match(xaml, /CandidateResults/);
  assert.match(xaml, /ResourceTaskDiagnostics/);
  assert.match(xaml, /RhodesApiUrl/);
  assert.match(xaml, /RunProbeCommand/);
  assert.match(xaml, /ResourceTaskResults/);
  assert.match(xaml, /ProbeResults/);
  assert.match(xaml, /RecognitionDetailJson/);
  assert.match(xaml, /Campaigns/);
  assert.match(xaml, /SelectedCampaign/);
  assert.match(xaml, /WORKSPACE/);
  assert.match(xaml, /WorkspaceNav/);
  assert.match(xaml, /SetWorkspaceCommand/);
  assert.match(xaml, /CampaignHeaderTitle/);
  assert.match(xaml, /CampaignHeaderDetail/);
  assert.match(xaml, /HeaderStatusChips/);
  assert.match(xaml, /RunFieldPreviews/);
  assert.match(xaml, /CampaignPreviews/);
  assert.match(xaml, /SpecialValuePreviews/);
  assert.match(xaml, /IS固有値/);
  assert.match(xaml, /IS切替/);
  assert.match(xaml, /選択カタログ/);
  assert.match(xaml, /オペレーター/);
  assert.match(xaml, /秘宝/);
  assert.match(xaml, /認識ワークフロー/);
  assert.match(xaml, /出力 \/ OBS/);
  assert.match(xaml, /OutputParts/);
  assert.match(xaml, /OutputSeparateWindow/);
  assert.match(xaml, /OutputTournamentMode/);
  assert.match(xaml, /OutputTransparentBackground/);
  assert.match(xaml, /OutputScrollSpeed/);
  assert.match(xaml, /ScrollEnabled/);
  assert.match(xaml, /HideExcluded/);
  assert.match(xaml, /BindingPath/);
  assert.match(xaml, /ランタイム/);
  assert.match(xaml, /RuntimeCapabilities/);
  assert.match(xaml, /InstallLabel/);
  assert.match(xaml, /インスペクタ/);
  assert.match(xaml, /InspectorRows/);
  assert.match(xaml, /FilteredOperators/);
  assert.match(xaml, /FilteredRelics/);
  assert.match(xaml, /OperatorSearch/);
  assert.match(xaml, /RelicSearch/);
  assert.match(xaml, /OperatorShowSelectedFirst/);
  assert.match(xaml, /RelicShowSelectedFirst/);
  assert.match(xaml, /ToggleChoiceSelectedCommand/);
  assert.match(xaml, /ToggleChoiceExcludedCommand/);
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

test("Suki design docs require operational operator and relic UI", async () => {
  const principles = await fs.readFile("docs/suki-workbench-design-principles.md", "utf8");
  const stitch = await fs.readFile("docs/stitch-suki-workbench-brief.md", "utf8");

  assert.match(principles, /Operational selection first/);
  assert.match(principles, /Stable workspaces over tab sprawl/);
  assert.match(principles, /operator and relic catalogs/);
  assert.match(principles, /Output part enabled/);
  assert.match(principles, /Runtime required vs optional capabilities/);
  assert.match(principles, /RhodesRunCatalog/);
  assert.match(stitch, /Run workspace/);
  assert.match(stitch, /Choices workspace/);
  assert.match(stitch, /Output workspace/);
  assert.match(stitch, /Runtime workspace/);
  assert.match(stitch, /IS campaign selected and switchable/);
});
