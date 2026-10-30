import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", async () => {
    const windowFake = await import("../__fixtures__/vscodeWindowFake");
    const disposable = { dispose: () => undefined };
    return {
        ...windowFake,
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
    BpmnDiffService,
    BpmnEditorFeature,
    CodeLinkFeature,
    DefinitionSearchFeature,
    DiffPaneStore,
    DOCUMENT_SYNC_COMMAND_TYPES,
    EditorSessionParticipant,
    NavigationFeature,
    ScriptEditorFeature,
    ScriptFileStore,
    ScriptVariableStore,
} from "@miragon/bpmn-modeler-core";
import { RecordingScriptEditor } from "@miragon/bpmn-modeler-core/testing";
import { BPMN_EDITOR_COMMAND_TYPES, BpmnEditorCommandType } from "@miragon/bpmn-modeler-shared";

import { InMemoryMemento } from "../__fixtures__/vscodeStorage";
import { BpmnDiffController } from "../diff/controller/BpmnDiffController";
import { setContext } from "../shared/infrastructure/extensionContext";
import * as bpmnEditorFeature from "./bpmnEditorFeature";
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
function createVsCodeBpmnEditor(context = createExtensionContext()) {
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
        marketplaceSvc: { getCachedTemplatePaths: () => Promise.resolve([]) },
        deploymentStatusParticipant: deploymentStatus,
        scriptEditor: new ScriptEditorFeature({
            scriptEditor: new RecordingScriptEditor(),
            variables: new ScriptVariableStore(),
            scriptFiles,
            notifier: deps.notifier,
        }).editorContribution,
    });
}

describe("VS Code's BPMN editor", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("routes match the host's coverage table", () => {
        const { router } = createVsCodeBpmnEditor();

        const coverage = Object.fromEntries(
            BPMN_EDITOR_COMMAND_TYPES.map((type) => [type, router.routeOf(type).kind]),
        );

        expect(coverage).toEqual(VSCODE_COVERAGE);
    });

    it("routes the whole document group to the core's document services", () => {
        const { router } = createVsCodeBpmnEditor();

        expect(DOCUMENT_SYNC_COMMAND_TYPES.map((type) => router.routeOf(type))).toEqual([
            { kind: "handled" },
            { kind: "handled" },
            { kind: "handled" },
        ]);
    });

    it("stops the editor and its core contributions when the extension deactivates", () => {
        const stoppedFeatures = [
            BpmnEditorFeature,
            NavigationFeature,
            DefinitionSearchFeature,
            CodeLinkFeature,
        ].map((feature) => vi.spyOn(feature.prototype, "dispose"));
        const context = createExtensionContext();
        createVsCodeBpmnEditor(context);

        for (const subscription of context.subscriptions) {
            subscription.dispose();
        }

        for (const dispose of stoppedFeatures) {
            expect(dispose).toHaveBeenCalledTimes(1);
        }
    });
});
