import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../__fixtures__/vscodeCompositionFake"));

import { ColorThemeKind, commands, ExtensionContext, Uri, WebviewViewProvider } from "vscode";

import {
    AddOnCatalogModel,
    allowanceOf,
    allowingAllowances,
    LOCAL_HOST,
    templatePreferenceChange,
    BpmnDiffService,
    DiffPaneStore,
    EditorSessionParticipant,
    ScriptEditorFeature,
    ScriptFileStore,
    ScriptVariableStore,
} from "@miragon/bpmn-modeler-core";
import { RecordingScriptEditor } from "@miragon/bpmn-modeler-core/testing";
import {
    AddOnCatalogQuery,
    BrandModeQuery,
    Query,
    RevealAddOnsQuery,
} from "@miragon/bpmn-modeler-shared";

import {
    changeColorTheme,
    registeredViewProviders,
    resetVscodeWindow,
    vscodeWindow,
} from "../__fixtures__/vscodeCompositionFake";
import { InMemoryMemento } from "../__fixtures__/vscodeStorage";
import { ADD_ONS_VIEW_ID } from "../addOns/adapter/in/AddOnsViewProvider";
import { REVIEW_ADD_ONS_CMD } from "../addOns/adapter/in/ReviewAddOnsCommand";
import { DiffController } from "../diff/adapter/in/DiffController";
import { bpmnDiffFormat } from "./diffFeature";
import { setContext } from "../shared/adapter/out/extensionContext";
import * as addOnsFeature from "./addOnsFeature";
import * as bpmnEditorFeature from "./bpmnEditorFeature";
import { buildSharedDeps } from "./sharedDeps";
import * as templateMarketplaceFeature from "./templateMarketplaceFeature";

function createExtensionContext(): ExtensionContext {
    return {
        subscriptions: [],
        globalState: new InMemoryMemento(),
        workspaceState: new InMemoryMemento(),
        globalStorageUri: Uri.file("/global-storage"),
        extensionUri: Uri.file("/extension"),
    } as unknown as ExtensionContext;
}

/** Plays VS Code resolving the Add-ons view, visible, and records its shell and what it posts to the page. */
function resolveAddOnsView(): { posted: Query[]; html: () => string } {
    const posted: Query[] = [];
    const inert = () => ({ dispose: () => undefined });
    const registration = registeredViewProviders.get(ADD_ONS_VIEW_ID);
    if (registration === undefined) throw new Error("No provider serves the Add-ons view.");
    const webview = {
        options: {},
        html: "",
        cspSource: "webview-csp:",
        asWebviewUri: (uri: Uri) => uri,
        postMessage: async (message: Query) => posted.push(message) > 0,
        onDidReceiveMessage: inert,
    };
    (registration.provider as WebviewViewProvider).resolveWebviewView(
        {
            visible: true,
            webview,
            onDidChangeVisibility: inert,
            onDidDispose: inert,
        } as never,
        {} as never,
        {} as never,
    );
    return { posted, html: () => webview.html };
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
    const { marketplaceSvc, templateSources } = templateMarketplaceFeature.register(context, deps);
    const reviews = addOnsFeature.createViewReviews(deps);
    const bpmn = bpmnEditorFeature.register(context, deps, {
        diffController: new DiffController(
            diffStore,
            deps.notifier,
            () => {
                throw new Error("no diff pane resolves here");
            },
            deps.preferences,
            bpmnDiffFormat(new BpmnDiffService(deps.notifier, deps.vsSettings, diffStore)),
        ),
        templateSources,
        deploymentStatusParticipant: deploymentStatus,
        reviews,
        scriptEditor: new ScriptEditorFeature({
            store: deps.editorStore,
            scriptEditor: new RecordingScriptEditor(scriptFiles),
            picker: deps.picker,
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
        reviews,
        ...addOnsFeature.register(context, deps, {
            ...bpmn,
            marketplaces: marketplace.marketplaces,
            reviews,
        }),
    };
}

const LEFT = {
    id: "/work/x",
    allowance: allowanceOf("plugin", "/work/x", { kind: "noRepository" }, LOCAL_HOST),
};

beforeEach(() => {
    resetVscodeWindow();
});

describe("VS Code's add-on catalog", () => {
    it("lists again when the BPMN editor's plugins, its rule packages or their one approval list change", async () => {
        const { deps, bpmn, addOns } = createVsCodeAddOns();
        const models: AddOnCatalogModel[] = [];
        addOns.attachView((model) => models.push(model), true);
        await addOns.whenSettled();

        await deps.pluginApprovals.change(allowingAllowances([LEFT]));
        await addOns.whenSettled();
        bpmn.plugins.inventory.leaveForView(LEFT);
        await addOns.whenSettled();
        bpmn.editor.rulePackageInventory?.leaveForView(LEFT);
        await addOns.whenSettled();

        expect(models).toHaveLength(4);
    });

    it("lists again when the user's template switches change", async () => {
        const { deps, addOns } = createVsCodeAddOns();
        const models: AddOnCatalogModel[] = [];
        addOns.attachView((model) => models.push(model), true);
        await addOns.whenSettled();

        await deps.templatePreferences.change(
            templatePreferenceChange("project", [{ source: "configFolder:shop/.camunda" }], []),
        );
        await addOns.whenSettled();

        expect(models).toHaveLength(2);
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

    it("serves the Add-ons view the catalog it builds", async () => {
        const { addOns } = createVsCodeAddOns();

        const { posted } = resolveAddOnsView();
        await addOns.whenSettled();

        expect(posted).toHaveLength(1);
        expect(posted[0]).toBeInstanceOf(AddOnCatalogQuery);
        expect((posted[0] as AddOnCatalogQuery).model.emptyText).toBe(
            "Open a folder to see the plugins, rule packages and element templates it brings.",
        );
    });

    it("shows the Add-ons view in VS Code's theme and follows a switch", async () => {
        changeColorTheme(ColorThemeKind.Dark);
        const { addOns } = createVsCodeAddOns();
        const { posted, html } = resolveAddOnsView();
        await addOns.whenSettled();

        changeColorTheme(ColorThemeKind.HighContrastLight);

        expect(html()).toContain('<html lang="en" data-cd-theme="dark">');
        expect(posted.filter((message) => message instanceof BrandModeQuery)).toEqual([
            new BrandModeQuery({ theme: "light", contrast: "hoch" }),
        ]);
    });

    it("has Review… show its rows in the Add-ons page the catalog serves", async () => {
        const { addOns, reviews } = createVsCodeAddOns();
        const posted: Query[] = [];
        addOns.attachPanel((message) => posted.push(message), true);
        const row = "plugin:/work/.camunda/plugins/resize";

        await expect(reviews.reveal.reveal([row])).resolves.toBe(true);
        await addOns.whenSettled();

        expect(vscodeWindow.executedCommands).toContainEqual({
            command: `${ADD_ONS_VIEW_ID}.focus`,
            args: [],
        });
        const reveals = posted.filter((message) => message instanceof RevealAddOnsQuery);
        expect(reveals.map(({ reveal }) => reveal)).toMatchObject([
            { kind: "rows", addOnIds: [row] },
        ]);
    });

    it("has Review Add-ons show the Add-ons view, then land its page on what needs review", async ({
        onTestFinished,
    }) => {
        const registerCommand = vi.spyOn(commands, "registerCommand");
        onTestFinished(() => registerCommand.mockRestore());
        const { addOns } = createVsCodeAddOns();
        const { posted } = resolveAddOnsView();
        const reviewAddOns = registerCommand.mock.calls.find(
            ([command]) => command === REVIEW_ADD_ONS_CMD,
        )?.[1];

        await reviewAddOns?.();
        await addOns.whenSettled();

        expect(vscodeWindow.executedCommands).toEqual([
            { command: `${ADD_ONS_VIEW_ID}.focus`, args: [] },
        ]);
        const reveals = posted.filter((message) => message instanceof RevealAddOnsQuery);
        expect(reveals.map(({ reveal }) => reveal.kind)).toEqual(["needsReview"]);
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
        await deps.pluginApprovals.change(allowingAllowances([LEFT]));
        await addOns.whenSettled();

        expect(models).toHaveLength(1);
    });
});
