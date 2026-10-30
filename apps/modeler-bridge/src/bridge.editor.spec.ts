import { describe, expect, it } from "vitest";

import { DOCUMENT_SYNC_COMMAND_TYPES } from "@miragon/bpmn-modeler-core";
import { BPMN_EDITOR_COMMAND_TYPES, BpmnEditorCommandType } from "@miragon/bpmn-modeler-shared";

import { createBridge } from "./bridge";

/** How the IntelliJ host serves each command its BPMN editor webview posts. */
const INTELLIJ_COVERAGE: Record<BpmnEditorCommandType, "handled" | "ignored"> = {
    SyncDocumentCommand: "handled",
    DocumentFlushedCommand: "handled",
    LogDebugCommand: "handled",
    LogInfoCommand: "handled",
    LogWarningCommand: "handled",
    LogErrorCommand: "handled",
    ShowInfoCommand: "handled",
    RequestFocusCommand: "handled",
    GetBpmnFileCommand: "handled",
    // IntelliJ has no SVG export, so the webview never sends this reply.
    GetDiagramAsSVGCommand: "ignored",
    GetElementTemplatesCommand: "handled",
    GetBpmnlintConfigCommand: "handled",
    GetBpmnModelerSettingCommand: "handled",
    GetPropertiesPanelStateCommand: "handled",
    SetPropertiesPanelStateCommand: "ignored",
    SetLintingEnabledCommand: "handled",
    UpdateLintResultsCommand: "handled",
    GetClipboardCommand: "handled",
    SetClipboardCommand: "handled",
    GetTextClipboardCommand: "handled",
    SetTextClipboardCommand: "handled",
    NavigateToReferencedModelCommand: "handled",
    NavigateToImplementationCommand: "handled",
    SyncActivitiesCommand: "handled",
    GetFormReferenceStatusCommand: "handled",
    SearchWorkspaceDefinitionsCommand: "handled",
    OpenScriptEditorCommand: "handled",
    OpenScriptEditorsCommand: "handled",
    UpdateScriptSourceCommand: "handled",
    UpdateScriptVariablesCommand: "handled",
    DiagramFormattedCommand: "handled",
    CleanupReportCommand: "handled",
};

describe("the bridge's BPMN editor", () => {
    it("routes match the host's coverage table", () => {
        const { editorRoutes } = createBridge(() => {});

        const coverage = Object.fromEntries(
            BPMN_EDITOR_COMMAND_TYPES.map((type) => [type, editorRoutes.routeOf(type).kind]),
        );

        expect(coverage).toEqual(INTELLIJ_COVERAGE);
    });

    it("routes the whole document group to the core's document services", () => {
        const { editorRoutes } = createBridge(() => {});

        expect(DOCUMENT_SYNC_COMMAND_TYPES.map((type) => editorRoutes.routeOf(type))).toEqual([
            { kind: "handled" },
            { kind: "handled" },
            { kind: "handled" },
        ]);
    });
});
