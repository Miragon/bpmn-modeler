import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../__fixtures__/vscodeCompositionFake"));

const injectedPorts = vi.hoisted(() => ({
    plugins: [] as BpmnPluginsHostPorts[],
    editors: [] as BpmnEditorHostPorts[],
    prunes: [] as string[],
}));

// Records what the composition hands each feature, which keeps no reference to it.
vi.mock("@miragon/bpmn-modeler-core", async (importOriginal) => {
    const core = await importOriginal<typeof import("@miragon/bpmn-modeler-core")>();
    class RecordedBpmnPluginsFeature extends core.BpmnPluginsFeature {
        constructor(ports: BpmnPluginsHostPorts) {
            super(ports);
            injectedPorts.plugins.push(ports);
            this.service.pruneIdleCopies = async () => {
                injectedPorts.prunes.push(ports.cacheRoot);
                return { removed: 0 };
            };
        }
    }
    class RecordedBpmnEditorFeature extends core.BpmnEditorFeature {
        constructor(...args: ConstructorParameters<typeof core.BpmnEditorFeature>) {
            super(...args);
            injectedPorts.editors.push(args[0]);
        }
    }
    return {
        ...core,
        BpmnPluginsFeature: RecordedBpmnPluginsFeature,
        BpmnEditorFeature: RecordedBpmnEditorFeature,
    };
});

import { ExtensionContext, Uri } from "vscode";

import {
    BpmnDiffService,
    BpmnEditorFeature,
    BpmnEditorHostPorts,
    BpmnPluginsFeature,
    BpmnPluginsHostPorts,
    CodeLinkFeature,
    DefinitionSearchFeature,
    DiffPaneStore,
    DOCUMENT_SYNC_COMMAND_TYPES,
    EditorSessionParticipant,
    NavigationFeature,
    QuestionQueue,
    ScriptEditorFeature,
    ScriptFileStore,
    ScriptVariableStore,
} from "@miragon/bpmn-modeler-core";
import { RecordingScriptEditor } from "@miragon/bpmn-modeler-core/testing";

import {
    changeWindowFocus,
    resetVscodeWindow,
    vscodeWindow,
} from "../__fixtures__/vscodeCompositionFake";
import { InMemoryMemento } from "../__fixtures__/vscodeStorage";
import { BpmnDiffController } from "../diff/adapter/in/BpmnDiffController";
import { NodeInstalledPackages } from "../modeler/bpmn/adapter/out/NodeInstalledPackages";
import { VsCodeTemplatePreferenceStore } from "../modeler/bpmn/adapter/out/VsCodeTemplatePreferenceStore";
import { setContext } from "../shared/adapter/out/extensionContext";
import * as addOnsFeature from "./addOnsFeature";
import * as bpmnEditorFeature from "./bpmnEditorFeature";
import { buildSharedDeps } from "./sharedDeps";

function createExtensionContext(): ExtensionContext {
    return {
        subscriptions: [],
        globalState: new InMemoryMemento(),
        workspaceState: new InMemoryMemento(),
        globalStorageUri: Uri.file("/global-storage"),
    } as unknown as ExtensionContext;
}

/** The BPMN editor as VS Code's activation builds it, with its reviews' view reveal connected. */
function createVsCodeBpmnEditor(context = createExtensionContext()) {
    setContext(context);
    const deps = buildSharedDeps(context);
    const reviews = addOnsFeature.createViewReviews(deps);
    reviews.reveal.connect(
        { reveal: (addOnIds) => revealedRows.push(addOnIds) },
        { focus: async () => void focusedViews.push("add-ons") },
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
        templateSources: { getCachedTemplateSources: () => Promise.resolve([]) },
        deploymentStatusParticipant: deploymentStatus,
        reviews,
        scriptEditor: new ScriptEditorFeature({
            scriptEditor: new RecordingScriptEditor(deps.editorStore, scriptFiles, deps.picker),
            variables: new ScriptVariableStore(),
            scriptFiles,
            notifier: deps.notifier,
        }).editorContribution,
    });
}

const revealedRows: (readonly string[])[] = [];
const focusedViews: string[] = [];

/** What "Review…" on a notice asks the review for one pending item. */
function reviewRequest(artifactId: string, workspaceFolders: readonly string[]) {
    return {
        prompt: {
            id: "pluginApproval",
            title: "Allow BPMN plugins from this workspace?",
            placeholder: "Check what you allow",
            items: [{ label: "Resize tasks", value: artifactId }],
        },
        artifactIds: [artifactId],
        workspaceFolders,
    };
}

describe("VS Code's BPMN editor", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        injectedPorts.plugins.splice(0);
        injectedPorts.editors.splice(0);
        injectedPorts.prunes.splice(0);
        revealedRows.splice(0);
        focusedViews.splice(0);
        resetVscodeWindow();
    });

    it.each([
        {
            kind: "plugin",
            review: () => injectedPorts.plugins[0]?.review,
            artifactId: "/work/.camunda/plugins/resize",
        },
        {
            kind: "rule package",
            review: () => injectedPorts.editors[0]?.rulePackages?.review,
            artifactId: "/work/node_modules/bpmnlint-plugin-acme",
        },
    ])(
        "leaves Review… of a $kind inside an open folder to the Add-ons view, without a list",
        async ({ review, artifactId }) => {
            createVsCodeBpmnEditor();

            const answer = await review()?.review(reviewRequest(artifactId, ["/work"]));

            expect(answer).toEqual({ kind: "leftForView" });
            expect(focusedViews).toEqual(["add-ons"]);
            expect(revealedRows).toHaveLength(1);
            expect(revealedRows[0]).toEqual([expect.stringContaining(artifactId)]);
            expect(vscodeWindow.quickPicks).toHaveLength(0);
        },
    );

    it("lists a plugin to check when no folder is open, as the view lists only open folders", async () => {
        createVsCodeBpmnEditor();

        const answer = injectedPorts.plugins[0]?.review?.review(
            reviewRequest("/elsewhere/.camunda/plugins/resize", []),
        );
        await vi.waitFor(() => expect(vscodeWindow.quickPicks).toHaveLength(1));
        vscodeWindow.quickPicks[0].pick("Resize tasks");

        await expect(answer).resolves.toEqual({
            kind: "checked",
            ids: ["/elsewhere/.camunda/plugins/resize"],
        });
        expect(revealedRows).toEqual([]);
    });

    it("removes idle plugin copies from its cache once when the extension activates", () => {
        createVsCodeBpmnEditor();

        expect(injectedPorts.prunes).toEqual([injectedPorts.plugins[0]?.cacheRoot]);
    });

    it("asks about plugins and rule packages in one queue and keeps both in one approval list", () => {
        createVsCodeBpmnEditor();

        const [plugins] = injectedPorts.plugins;
        const rulePackages = injectedPorts.editors[0]?.rulePackages;
        expect(plugins?.questions).toBeInstanceOf(QuestionQueue);
        expect(rulePackages?.questions).toBe(plugins?.questions);
        expect(rulePackages?.approvals).toBe(plugins?.approvals);
        expect(rulePackages?.actionNotifier).toBe(plugins?.actionNotifier);
        expect(rulePackages?.installedPackages).toBeInstanceOf(NodeInstalledPackages);
    });

    it("reads the approvals another window stored once this window gains focus", async () => {
        const context = createExtensionContext();
        createVsCodeBpmnEditor(context);
        const approvals = injectedPorts.plugins[0]!.approvals;
        let announced = 0;
        approvals.onDidChange(() => announced++);
        const otherWindowsRow = { pluginId: "/repo/.camunda/plugins/resize", contentHash: "9f2c" };
        await context.globalState.update("bpmnPluginApprovals", [otherWindowsRow]);

        changeWindowFocus(false);
        await Promise.resolve();
        expect(announced).toBe(0);
        changeWindowFocus(true);
        await Promise.resolve();

        expect(announced).toBe(1);
        expect(approvals.read()).toEqual([otherWindowsRow]);
        for (const subscription of context.subscriptions) {
            subscription.dispose();
        }
    });

    it("hands the editor the template switches kept in this window's workspace and global state", () => {
        createVsCodeBpmnEditor();

        expect(injectedPorts.editors[0]?.templatePreferences).toBeInstanceOf(
            VsCodeTemplatePreferenceStore,
        );
    });

    it("reads the template switches another window stored once this window gains focus", async () => {
        const context = createExtensionContext();
        createVsCodeBpmnEditor(context);
        const switches = injectedPorts.editors[0]!.templatePreferences!;
        let announced = 0;
        switches.onDidChange(() => announced++);
        const acmeOff = { source: "marketplace:local:/opt/acme" };
        await context.globalState.update("bpmnTemplatePreferences", { disabled: [acmeOff] });

        changeWindowFocus(true);
        await Promise.resolve();

        expect(announced).toBe(1);
        expect(switches.read().allProjects).toEqual({ disabled: [acmeOff] });
        for (const subscription of context.subscriptions) {
            subscription.dispose();
        }
    });

    it("routes the whole document group to the core's document services", () => {
        const { router } = createVsCodeBpmnEditor().editor;

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
            BpmnPluginsFeature,
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
