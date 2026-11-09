import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../__fixtures__/vscodeCompositionFake"));

const injectedPorts = vi.hoisted(() => ({ addOns: [] as AddOnsHostPorts[] }));

// Records what the composition hands the catalog, which keeps no reference to it.
vi.mock("@miragon/bpmn-modeler-core", async (importOriginal) => {
    const core = await importOriginal<typeof import("@miragon/bpmn-modeler-core")>();
    class RecordedAddOnsFeature extends core.AddOnsFeature {
        constructor(ports: AddOnsHostPorts) {
            super(ports);
            injectedPorts.addOns.push(ports);
        }
    }
    return { ...core, AddOnsFeature: RecordedAddOnsFeature };
});

import { ExtensionContext, Uri } from "vscode";

import {
    AddOnsFeature,
    AddOnsHostPorts,
    BpmnDiffService,
    DiffPaneStore,
    EditorSessionParticipant,
    ScriptEditorFeature,
    ScriptFileStore,
    ScriptVariableStore,
} from "@miragon/bpmn-modeler-core";
import { RecordingScriptEditor } from "@miragon/bpmn-modeler-core/testing";

import { InMemoryMemento } from "../__fixtures__/vscodeStorage";
import { BpmnDiffController } from "../diff/adapter/in/BpmnDiffController";
import { setContext } from "../shared/adapter/out/extensionContext";
import * as addOnsFeature from "./addOnsFeature";
import * as bpmnEditorFeature from "./bpmnEditorFeature";
import { buildSharedDeps } from "./sharedDeps";

function createExtensionContext(): ExtensionContext {
    return {
        subscriptions: [],
        globalState: new InMemoryMemento(),
        globalStorageUri: Uri.file("/global-storage"),
    } as unknown as ExtensionContext;
}

/** The add-on catalog as VS Code's activation builds it, after the BPMN editor. */
function createVsCodeAddOns(context = createExtensionContext()) {
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
    const bpmn = bpmnEditorFeature.register(context, deps, {
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
    return { deps, bpmn, ...addOnsFeature.register(context, deps, bpmn) };
}

describe("VS Code's add-on catalog", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        injectedPorts.addOns.splice(0);
    });

    it("lists what the BPMN editor's plugins and rule packages find, over their one approval list", () => {
        const { deps, bpmn } = createVsCodeAddOns();

        const [ports] = injectedPorts.addOns;
        expect(ports?.approvals).toBe(deps.pluginApprovals);
        expect(ports?.plugins).toBe(bpmn.plugins.inventory);
        expect(ports?.rulePackages).toBe(bpmn.editor.rulePackageInventory);
        expect(ports?.restart).toBe("reloadWindow");
    });

    it("asks for a folder while none is open", async () => {
        const { addOns } = createVsCodeAddOns();
        const posted: string[] = [];

        addOns.attachView((model) => posted.push(model.emptyText ?? ""), true);
        await addOns.whenSettled();

        expect(posted).toEqual(["Open a folder to see the plugins and rule packages it brings."]);
    });

    it("stops the catalog when the extension deactivates", () => {
        const dispose = vi.spyOn(AddOnsFeature.prototype, "dispose");
        const context = createExtensionContext();
        createVsCodeAddOns(context);

        for (const subscription of context.subscriptions) {
            subscription.dispose();
        }

        expect(dispose).toHaveBeenCalledTimes(1);
    });
});
