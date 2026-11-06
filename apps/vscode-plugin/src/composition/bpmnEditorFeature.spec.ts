import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../__fixtures__/vscodeCompositionFake"));

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

import { InMemoryMemento } from "../__fixtures__/vscodeStorage";
import { BpmnDiffController } from "../diff/adapter/in/BpmnDiffController";
import { setContext } from "../shared/adapter/out/extensionContext";
import * as bpmnEditorFeature from "./bpmnEditorFeature";
import { buildSharedDeps } from "./sharedDeps";

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
            () => {
                throw new Error("no diff pane resolves here");
            },
            deps.preferences,
        ),
        marketplaceSvc: { getCachedTemplatePaths: () => Promise.resolve([]) },
        deploymentStatusParticipant: deploymentStatus,
        scriptEditor: new ScriptEditorFeature({
            scriptEditor: new RecordingScriptEditor(deps.editorStore, scriptFiles, deps.picker),
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
