import { describe, expect, it } from "vitest";

import {
    absent,
    HANDLED,
    HostSurfaceCoverage,
    ignored,
    servedSurfaceCoverage,
} from "@miragon/bpmn-modeler-core/testing";

import { createBridge } from "./composition/bridge";

/** How the IntelliJ host serves each command of each webview surface. */
const INTELLIJ_SURFACES: HostSurfaceCoverage = {
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
        SetPropertiesPanelStateCommand: ignored("the host does not keep the panel visibility"),
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
        DiffPlaneChangedCommand: HANDLED,
        // IntelliJ's diff viewer swaps the sides itself and never forwards the command.
        SwapCompareSidesCommand: ignored("the host does not swap diff sides through the core"),
        LogErrorCommand: HANDLED,
    },
    dmnEditor: absent("IntelliJ has no DMN editor"),
    dmnDiffPane: absent("IntelliJ has no DMN editor"),
    formEditor: absent("IntelliJ has no Form editor"),
    templateEditor: absent("IntelliJ answers the template preview page itself"),
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
        OpenAddOnDetailCommand: HANDLED,
        GetAddOnReadmeCommand: HANDLED,
    },
};

describe("the bridge's webview surfaces", () => {
    it("route every command as the host's coverage table says, and only the surfaces it offers", () => {
        const { surfaceRoutes } = createBridge(() => {});

        expect(servedSurfaceCoverage(surfaceRoutes, INTELLIJ_SURFACES)).toEqual(INTELLIJ_SURFACES);
    });
});
