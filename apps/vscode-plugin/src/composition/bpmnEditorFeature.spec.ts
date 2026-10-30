import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", async () => {
    const windowFake = await import("../__fixtures__/vscodeWindowFake");
    const disposable = { dispose: () => undefined };
    return {
        ...windowFake,
        ViewColumn: { Beside: -2 },
        ConfigurationTarget: { Global: 1 },
        workspace: {
            fs: {},
            workspaceFolders: [],
            getConfiguration: () => ({ get: () => undefined, update: () => Promise.resolve() }),
            onDidChangeConfiguration: () => disposable,
            createFileSystemWatcher: () => ({
                onDidCreate: () => disposable,
                onDidChange: () => disposable,
                onDidDelete: () => disposable,
                dispose: () => undefined,
            }),
        },
        window: {
            ...windowFake.window,
            tabGroups: { onDidChangeTabs: () => disposable },
            registerCustomEditorProvider: () => disposable,
        },
        commands: { ...windowFake.commands, registerCommand: () => disposable },
        languages: {
            createDiagnosticCollection: () => ({
                set: () => undefined,
                delete: () => undefined,
                dispose: () => undefined,
            }),
        },
    };
});

import { ExtensionContext } from "vscode";

import {
    DiffPaneStore,
    DOCUMENT_SYNC_COMMAND_TYPES,
    EditorSessionParticipant,
    ScriptFileStore,
    ScriptVariableStore,
    ScriptXmlService,
} from "@miragon/bpmn-modeler-core";
import { BpmnDiffService } from "@miragon/bpmn-modeler-core";
import { BPMN_EDITOR_COMMAND_TYPES, BpmnEditorCommandType } from "@miragon/bpmn-modeler-shared";

import { InMemoryMemento } from "../__fixtures__/vscodeStorage";
import { BpmnDiffController } from "../diff/controller/BpmnDiffController";
import { ScriptTaskService } from "../scriptTask/infrastructure/ScriptTaskService";
import { setContext } from "../shared/infrastructure/extensionContext";
import * as bpmnEditorFeature from "./bpmnEditorFeature";
import * as codeLinkFeature from "./codeLinkFeature";
import { buildSharedDeps } from "./sharedDeps";

/** How VS Code serves each command its BPMN editor webview posts. */
const VSCODE_COVERAGE: Record<BpmnEditorCommandType, "handled" | "ignored"> = {
    SyncDocumentCommand: "handled",
    DocumentFlushedCommand: "handled",
    LogDebugCommand: "handled",
    LogInfoCommand: "handled",
    LogWarningCommand: "handled",
    LogErrorCommand: "handled",
    ShowInfoCommand: "handled",
    RequestFocusCommand: "handled",
    GetBpmnFileCommand: "handled",
    // The SVG export awaits this reply on its own, outside the router.
    GetDiagramAsSVGCommand: "ignored",
    GetElementTemplatesCommand: "handled",
    GetBpmnlintConfigCommand: "handled",
    GetBpmnModelerSettingCommand: "handled",
    GetPropertiesPanelStateCommand: "handled",
    SetPropertiesPanelStateCommand: "handled",
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

function createExtensionContext(): ExtensionContext {
    return {
        subscriptions: [],
        globalState: new InMemoryMemento(),
    } as unknown as ExtensionContext;
}

/** The BPMN editor as VS Code's activation builds it. */
function createVsCodeBpmnEditor() {
    const context = createExtensionContext();
    setContext(context);
    const deps = buildSharedDeps(context);
    const scriptFiles = new ScriptFileStore(
        deps.editorStore,
        deps.vsWorkspace,
        deps.vsSettings,
        deps.artifactSvc,
        deps.notifier,
        "/tmp",
        (path) => path,
    );
    const diffStore = new DiffPaneStore();
    const deploymentStatus: EditorSessionParticipant = { onResolve: () => undefined };
    return bpmnEditorFeature.register(context, deps, {
        diffController: new BpmnDiffController(
            diffStore,
            new BpmnDiffService(deps.notifier, deps.vsSettings, diffStore),
            deps.notifier,
        ),
        scriptTaskSvc: new ScriptTaskService(
            deps.editorStore,
            scriptFiles,
            deps.vsSettings,
            deps.notifier,
            deps.picker,
            new ScriptXmlService(),
        ),
        scriptVariableStore: new ScriptVariableStore(),
        scriptFiles,
        codeLink: codeLinkFeature.register(context, deps),
        marketplaceSvc: { getCachedTemplatePaths: () => Promise.resolve([]) },
        deploymentStatusParticipant: deploymentStatus,
    });
}

describe("VS Code's BPMN editor", () => {
    it("routes match the host's coverage table", () => {
        const { editorRoutes } = createVsCodeBpmnEditor();

        const coverage = Object.fromEntries(
            BPMN_EDITOR_COMMAND_TYPES.map((type) => [type, editorRoutes.routeOf(type).kind]),
        );

        expect(coverage).toEqual(VSCODE_COVERAGE);
    });

    it("routes the whole document group to the core's document services", () => {
        const { editorRoutes } = createVsCodeBpmnEditor();

        expect(DOCUMENT_SYNC_COMMAND_TYPES.map((type) => editorRoutes.routeOf(type))).toEqual([
            { kind: "handled" },
            { kind: "handled" },
            { kind: "handled" },
        ]);
    });
});
