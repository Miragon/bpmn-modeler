import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../__fixtures__/vscodeCompositionFake"));

import { ExtensionContext, Uri } from "vscode";

import {
    ScriptEditorFeature,
    ScriptFileStore,
    ScriptVariableStore,
} from "@miragon/bpmn-modeler-core";
import {
    HANDLED,
    HostSurfaceCoverage,
    ignored,
    RecordingScriptEditor,
    servedSurfaceCoverage,
} from "@miragon/bpmn-modeler-core/testing";

import { InMemoryMemento } from "../__fixtures__/vscodeStorage";
import { setContext } from "../shared/adapter/out/extensionContext";
import * as addOnsFeature from "./addOnsFeature";
import * as bpmnEditorFeature from "./bpmnEditorFeature";
import * as deploymentFeature from "./deploymentFeature";
import * as diffFeature from "./diffFeature";
import * as editorFeature from "./editorFeature";
import * as elementTemplateFeature from "./elementTemplateFeature";
import { buildSharedDeps } from "./sharedDeps";
import * as templateMarketplaceFeature from "./templateMarketplaceFeature";

/** How VS Code serves each command of each webview surface. */
const VSCODE_SURFACES: HostSurfaceCoverage = {
    bpmnEditor: {
        SyncDocumentCommand: HANDLED,
        DocumentFlushedCommand: HANDLED,
        LogDebugCommand: HANDLED,
        LogInfoCommand: HANDLED,
        LogWarningCommand: HANDLED,
        LogErrorCommand: HANDLED,
        ShowInfoCommand: HANDLED,
        RequestFocusCommand: HANDLED,
        GetBpmnFileCommand: HANDLED,
        GetDiagramAsSVGCommand: ignored("the SVG export awaits this reply outside the router"),
        GetElementTemplatesCommand: HANDLED,
        GetBpmnPluginsCommand: HANDLED,
        GetBpmnlintConfigCommand: HANDLED,
        GetBpmnModelerSettingCommand: HANDLED,
        GetPropertiesPanelStateCommand: HANDLED,
        SetPropertiesPanelStateCommand: HANDLED,
        SetLintingEnabledCommand: HANDLED,
        UpdateLintResultsCommand: HANDLED,
        GetClipboardCommand: HANDLED,
        SetClipboardCommand: HANDLED,
        GetTextClipboardCommand: HANDLED,
        SetTextClipboardCommand: HANDLED,
        NavigateToReferencedModelCommand: HANDLED,
        NavigateToImplementationCommand: HANDLED,
        SyncActivitiesCommand: HANDLED,
        GetFormReferenceStatusCommand: HANDLED,
        GetFormPreviewCommand: HANDLED,
        SearchWorkspaceDefinitionsCommand: HANDLED,
        OpenScriptEditorCommand: HANDLED,
        OpenScriptEditorsCommand: HANDLED,
        UpdateScriptSourceCommand: HANDLED,
        UpdateScriptVariablesCommand: HANDLED,
        DiagramFormattedCommand: HANDLED,
        CleanupReportCommand: HANDLED,
    },
    bpmnDiffPane: {
        GetBpmnFileCommand: HANDLED,
        GetBpmnModelerSettingCommand: ignored("a read-only diff pane applies no modeler settings"),
        GetPropertiesPanelStateCommand: ignored("a diff pane shows no properties panel"),
        DiffReadyCommand: HANDLED,
        ViewportChangedCommand: HANDLED,
        CursorChangedCommand: HANDLED,
        SwapCompareSidesCommand: HANDLED,
        LogErrorCommand: HANDLED,
    },
    dmnEditor: {
        SyncDocumentCommand: HANDLED,
        DocumentFlushedCommand: HANDLED,
        LogWarningCommand: HANDLED,
        LogErrorCommand: HANDLED,
        RequestFocusCommand: HANDLED,
        GetDmnFileCommand: HANDLED,
        GetDmnModelerSettingCommand: HANDLED,
        GetPropertiesPanelStateCommand: HANDLED,
        SetPropertiesPanelStateCommand: HANDLED,
    },
    formEditor: {
        SyncDocumentCommand: HANDLED,
        DocumentFlushedCommand: HANDLED,
        LogWarningCommand: HANDLED,
        LogErrorCommand: HANDLED,
        GetFormFileCommand: HANDLED,
        GetFormInputValuesCommand: HANDLED,
        UpdateFormOutputValuesCommand: HANDLED,
    },
    templateEditor: {
        GetElementTemplateFileCommand: HANDLED,
        SyncDocumentCommand: HANDLED,
        DocumentFlushedCommand: HANDLED,
        LogDebugCommand: HANDLED,
        LogInfoCommand: HANDLED,
        LogWarningCommand: HANDLED,
        LogErrorCommand: HANDLED,
    },
    deploymentSidebar: {
        LogInfoCommand: HANDLED,
        LogErrorCommand: HANDLED,
        RequestFormDefaultsCommand: HANDLED,
        DeployCommand: HANDLED,
        RequestAdditionalFilesCommand: HANDLED,
        RequestStoredCredentialsCommand: HANDLED,
        SelectTargetCommand: HANDLED,
        SaveTargetCommand: HANDLED,
        CreateTargetCommand: HANDLED,
        DeleteTargetCommand: HANDLED,
        OpenTargetsFileCommand: HANDLED,
        StartInstanceCommand: HANDLED,
        RequestPayloadFilesCommand: HANDLED,
    },
    addOnsView: {
        LogInfoCommand: HANDLED,
        LogErrorCommand: HANDLED,
        GetAddOnCatalogCommand: HANDLED,
        AddOnRequestCommand: HANDLED,
    },
};

/** The webview surfaces as VS Code's activation registers them. */
function registerVsCodeSurfaces() {
    const context = {
        subscriptions: [],
        globalState: new InMemoryMemento(),
        workspaceState: new InMemoryMemento(),
        secrets: {},
        globalStorageUri: Uri.file("/global-storage"),
        extensionUri: Uri.file("/extension"),
    } as unknown as ExtensionContext;
    setContext(context);
    const deps = buildSharedDeps(context);
    const { diffController } = diffFeature.register(context, deps);
    const { marketplaceSvc, templateSources } = templateMarketplaceFeature.register(context, deps);
    const { deploymentStatusParticipant, deploymentSidebarRoutes } = deploymentFeature.register(
        context,
        deps,
    );
    const scriptFiles = new ScriptFileStore(
        deps.editorStore,
        deps.vsWorkspace,
        deps.vsSettings,
        deps.artifactSvc,
        deps.notifier,
        "/tmp",
        (path) => path,
    );
    const bpmnEditor = bpmnEditorFeature.register(context, deps, {
        diffController,
        templateSources,
        deploymentStatusParticipant,
        scriptEditor: new ScriptEditorFeature({
            scriptEditor: new RecordingScriptEditor(deps.editorStore, scriptFiles, deps.picker),
            variables: new ScriptVariableStore(),
            scriptFiles,
            notifier: deps.notifier,
        }).editorContribution,
    });
    const { dmnEditorRoutes, formEditorRoutes } = editorFeature.register(context, deps);
    const { marketplaces } = templateMarketplaceFeature.registerCommands(context, deps, {
        marketplaceSvc,
        templatesSvc: bpmnEditor.editor.templates,
    });
    const { addOnsViewRoutes } = addOnsFeature.register(context, deps, {
        ...bpmnEditor,
        marketplaces,
    });
    const { templateEditorRoutes } = elementTemplateFeature.register(context, deps);
    return {
        bpmnEditor: bpmnEditor.editor.router,
        bpmnDiffPane: diffController.paneRoutes,
        dmnEditor: dmnEditorRoutes,
        formEditor: formEditorRoutes,
        templateEditor: templateEditorRoutes,
        deploymentSidebar: deploymentSidebarRoutes,
        addOnsView: addOnsViewRoutes,
    };
}

describe("VS Code's webview surfaces", () => {
    it("route every command as the host's coverage table says", () => {
        expect(servedSurfaceCoverage(registerVsCodeSurfaces(), VSCODE_SURFACES)).toEqual(
            VSCODE_SURFACES,
        );
    });
});
