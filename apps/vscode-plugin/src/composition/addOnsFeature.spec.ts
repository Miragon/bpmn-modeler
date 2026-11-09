import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../__fixtures__/vscodeCompositionFake"));

import { ExtensionContext, Uri } from "vscode";

import {
    AddOnCatalogModel,
    allowing,
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
import * as templateMarketplaceFeature from "./templateMarketplaceFeature";

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
    const { marketplaceSvc } = templateMarketplaceFeature.register(context, deps);
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
        marketplaceSvc,
        deploymentStatusParticipant: deploymentStatus,
        scriptEditor: new ScriptEditorFeature({
            scriptEditor: new RecordingScriptEditor(deps.editorStore, scriptFiles, deps.picker),
            variables: new ScriptVariableStore(),
            scriptFiles,
            notifier: deps.notifier,
        }).editorContribution,
    });
    const marketplace = templateMarketplaceFeature.registerCommands(context, deps, {
        marketplaceSvc,
        templatesSvc: bpmn.editor.templates,
    });
    return {
        deps,
        bpmn,
        marketplace,
        ...addOnsFeature.register(context, deps, {
            ...bpmn,
            marketplaces: marketplace.marketplaces,
        }),
    };
}

const LEFT = { id: "/work/x", name: "x", contentHash: "h" };

describe("VS Code's add-on catalog", () => {
    it("lists again when the BPMN editor's plugins, its rule packages or their one approval list change", async () => {
        const { deps, bpmn, addOns } = createVsCodeAddOns();
        const models: AddOnCatalogModel[] = [];
        addOns.attachView((model) => models.push(model), true);
        await addOns.whenSettled();

        await deps.pluginApprovals.change(allowing([LEFT]));
        await addOns.whenSettled();
        bpmn.plugins.inventory.leaveForView(LEFT);
        await addOns.whenSettled();
        bpmn.editor.rulePackageInventory?.leaveForView(LEFT);
        await addOns.whenSettled();

        expect(models).toHaveLength(4);
    });

    it("asks for a folder while none is open", async () => {
        const { addOns } = createVsCodeAddOns();
        const posted: string[] = [];

        addOns.attachView((model) => posted.push(model.emptyText ?? ""), true);
        await addOns.whenSettled();

        expect(posted).toEqual([
            "Open a folder to see the plugins, rule packages and element templates it brings.",
        ]);
    });

    it("offers the marketplace flows and lists again once one ran", async () => {
        const { marketplace, addOns } = createVsCodeAddOns();
        const models: AddOnCatalogModel[] = [];
        addOns.attachView((model) => models.push(model), true);
        await addOns.whenSettled();

        await marketplace.marketplaces.update();
        await addOns.whenSettled();

        expect(models).toHaveLength(2);
        expect(models[0].actions.map(({ kind }) => kind)).toEqual([
            "addMarketplace",
            "updateMarketplaces",
            "pruneCache",
        ]);
    });

    it("stops the catalog when the extension deactivates", async () => {
        const context = createExtensionContext();
        const { deps, addOns } = createVsCodeAddOns(context);
        const models: AddOnCatalogModel[] = [];
        addOns.attachView((model) => models.push(model), true);
        await addOns.whenSettled();

        for (const subscription of context.subscriptions) {
            subscription.dispose();
        }
        await deps.pluginApprovals.change(allowing([LEFT]));
        await addOns.whenSettled();

        expect(models).toHaveLength(1);
    });
});
