import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    BPMN_EDITOR_COMMAND_TYPES,
    BpmnEditorCommandType,
    BpmnFileQuery,
    BpmnlintResultsQuery,
    BpmnPluginsQuery,
    Command,
    GetBpmnModelerSettingCommand,
    GetPropertiesPanelStateCommand,
    LogWarningCommand,
    SetLintingEnabledCommand,
} from "@miragon/bpmn-modeler-shared";

import { toWorkspacePath } from "../../../kernel/domain/workspacePath";
import { ArtifactService } from "../../../kernel/service/ArtifactService";
import { QuestionQueue } from "../../../kernel/service/QuestionQueue";
import { EditorSessionParticipant } from "../../../editorSession/domain/EditorSessionParticipant";
import { DocumentFlushService } from "../../../editorSession/service/DocumentFlushService";
import { MessageRoute } from "../../../editorSession/service/WebviewMessageRouter";
import { DocumentRenderParticipant } from "../../../editorSession/service/DocumentRenderParticipant";
import {
    createTestHost,
    FakeEditorHandle,
    HANDLED,
    ignored,
    InMemoryInstalledPackages,
    routesOf,
    ScriptedReview,
} from "../../../testing";
import {
    RULE_PACKAGE_APPROVAL_NOTICE_ID,
    RULE_PACKAGE_APPROVAL_PROMPT_ID,
    rulePackageContentHash,
} from "../domain/rulePackageApproval";
import {
    BpmnEditorContributions,
    BpmnEditorFeature,
    BpmnEditorHostExtensions,
    DOCUMENT_SYNC_COMMAND_TYPES,
} from "./BpmnEditorFeature";
import { BpmnlintParticipant } from "../service/BpmnlintParticipant";
import { BpmnSettingsParticipant } from "../service/BpmnSettingsParticipant";
import { ElementTemplatesParticipant } from "../service/ElementTemplatesParticipant";
import { EngineVersionStatusBarParticipant } from "../service/EngineVersionStatusBarParticipant";

const DIAGRAM = "/work/order.bpmn";
const C7_XML =
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.22.0"></bpmn:definitions>';

/** A command whose payload the recording handlers never read. */
class RecordedCommand extends Command {
    constructor(type: BpmnEditorCommandType) {
        super(type);
    }
}

/** Every BPMN editor command on a host that supplies every capability. */
const FULL_HOST_ROUTES: Record<BpmnEditorCommandType, MessageRoute> = {
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
};

const OWN_PLUMBING = ignored("the host's own plumbing owns the document");

/** What a host that supplies no optional capability gets instead. */
const BARE_HOST_ROUTES: Record<BpmnEditorCommandType, MessageRoute> = {
    ...FULL_HOST_ROUTES,
    GetBpmnFileCommand: OWN_PLUMBING,
    SyncDocumentCommand: OWN_PLUMBING,
    DocumentFlushedCommand: OWN_PLUMBING,
    SetLintingEnabledCommand: ignored("the host has no linting switch"),
    SetPropertiesPanelStateCommand: ignored("the host does not keep the panel visibility"),
};

/** Contributions whose handlers and participants only record that they ran. */
function recordingContributions(
    calls: string[],
    onScriptResync: () => void,
): BpmnEditorContributions {
    const participant = (name: string): EditorSessionParticipant => ({
        onResolve: () => {
            calls.push(`${name} resolved`);
        },
    });
    const handler = (name: string) => () => {
        calls.push(name);
    };
    return {
        navigation: {
            commandHandlers: {
                NavigateToReferencedModelCommand: handler("navigate to model"),
                GetFormReferenceStatusCommand: handler("form reference status"),
                GetFormPreviewCommand: handler("form preview"),
            },
            participant: participant("navigation"),
        },
        definitionSearch: {
            commandHandlers: { SearchWorkspaceDefinitionsCommand: handler("search definitions") },
            participant: participant("definitionSearch"),
        },
        deploymentStatus: participant("deploymentStatus"),
        scriptEditor: {
            commandHandlers: {
                OpenScriptEditorCommand: handler("open script"),
                OpenScriptEditorsCommand: handler("open scripts"),
                UpdateScriptSourceCommand: handler("update script source"),
                UpdateScriptVariablesCommand: handler("update script variables"),
                GetBpmnModelerSettingCommand: () => {
                    calls.push("resync scripts");
                    onScriptResync();
                },
            },
            participant: participant("scriptEditor"),
        },
        codeLink: {
            commandHandlers: {
                NavigateToImplementationCommand: handler("navigate to implementation"),
                SyncActivitiesCommand: handler("sync activities"),
            },
            participant: participant("codeLink"),
        },
    };
}

type HostCapabilities = "full" | "bare";

function createFeature(
    capabilities: HostCapabilities = "full",
    rendering: BpmnEditorHostExtensions["rendering"] = "host-driven",
    onScriptResync: () => void = () => undefined,
    { servesPlugins = false }: { servesPlugins?: boolean } = {},
) {
    const host = createTestHost({ folders: ["/work"] });
    const calls: string[] = [];
    const servedExtensions: string[] = [];
    const contributions: BpmnEditorContributions = {
        ...recordingContributions(calls, onScriptResync),
        ...(servesPlugins
            ? {
                  plugins: {
                      commandHandlers: {
                          GetBpmnPluginsCommand: () => {
                              calls.push("serve plugins");
                          },
                      },
                      participant: { onResolve: () => undefined },
                  },
              }
            : {}),
    };
    const extensions: BpmnEditorHostExtensions =
        capabilities === "full"
            ? {
                  rendering,
                  documentSync: {
                      flushes: new DocumentFlushService(host.store, host.notifier),
                      pendingEdits: { serve: (extension) => servedExtensions.push(extension) },
                  },
                  lintingPreference: host.lintingPreference,
                  propertiesPanelState: host.propertiesPanelState,
              }
            : { rendering };
    const feature = new BpmnEditorFeature(
        {
            store: host.store,
            documents: host.documents,
            workspace: host.workspace,
            settings: host.settings,
            notifier: host.notifier,
            picker: host.picker,
            statusBar: host.statusBar,
            clipboard: host.clipboard,
            artifacts: new ArtifactService(host.workspace, host.settings, host.notifier),
        },
        extensions,
        contributions,
    );
    return { host, feature, calls, contributions, servedExtensions };
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("BpmnEditorFeature", () => {
    it("routes or explicitly ignores every BPMN editor command", () => {
        const { feature } = createFeature("full");

        expect(routesOf(feature.router, BPMN_EDITOR_COMMAND_TYPES)).toEqual(FULL_HOST_ROUTES);
    });

    it("ignores the commands of each capability a host leaves out, with its reason", () => {
        const { feature } = createFeature("bare");

        expect(routesOf(feature.router, BPMN_EDITOR_COMMAND_TYPES)).toEqual(BARE_HOST_ROUTES);
    });

    it.each<HostCapabilities>(["full", "bare"])(
        "handles or ignores the document group as a whole on a %s host",
        (capabilities) => {
            const { feature } = createFeature(capabilities);

            const groupRoutes = DOCUMENT_SYNC_COMMAND_TYPES.map((type) =>
                feature.router.routeOf(type),
            );

            expect(groupRoutes).toEqual([groupRoutes[0], groupRoutes[0], groupRoutes[0]]);
            expect(groupRoutes[0].kind).not.toBe("unrouted");
        },
    );

    it.each<{ rendering: BpmnEditorHostExtensions["rendering"]; render: string }>([
        { rendering: "on-host-document-change", render: "documentRender" },
        { rendering: "host-driven", render: "modelerSession" },
    ])("participants run in the documented order ($rendering)", ({ rendering, render }) => {
        const { feature, contributions } = createFeature("full", rendering);
        const contributed = new Map<EditorSessionParticipant, string>([
            [contributions.navigation.participant, "navigation"],
            [contributions.definitionSearch.participant, "definitionSearch"],
            [contributions.deploymentStatus, "deploymentStatus"],
            [contributions.scriptEditor.participant, "scriptEditor"],
            [contributions.codeLink.participant, "codeLink"],
        ]);
        const label = (participant: EditorSessionParticipant): string => {
            if (contributed.has(participant)) return contributed.get(participant)!;
            if (participant instanceof DocumentRenderParticipant) return "documentRender";
            if (participant instanceof ElementTemplatesParticipant) return "elementTemplates";
            if (participant instanceof BpmnlintParticipant) return "bpmnlint";
            if (participant instanceof BpmnSettingsParticipant) return "settings";
            if (participant instanceof EngineVersionStatusBarParticipant) return "engineVersion";
            return "modelerSession";
        };

        expect(feature.participants.map(label)).toEqual([
            render,
            "navigation",
            "definitionSearch",
            "elementTemplates",
            "bpmnlint",
            "settings",
            "engineVersion",
            "deploymentStatus",
            "scriptEditor",
            "codeLink",
        ]);
    });

    it("adds the plugins participant last on a host that serves plugins", () => {
        const { feature, contributions } = createFeature("full", "host-driven", undefined, {
            servesPlugins: true,
        });

        expect(feature.participants.at(-1)).toBe(contributions.plugins?.participant);
    });

    it.each([
        { servesPlugins: true, posted: [], calls: ["serve plugins"] },
        { servesPlugins: false, posted: [[]], calls: [] },
    ])(
        "answers the plugin request with the contributed handler or with no plugins (serves plugins: $servesPlugins)",
        async ({ servesPlugins, posted, calls: expectedCalls }) => {
            const { host, feature, calls } = createFeature("full", "host-driven", undefined, {
                servesPlugins,
            });
            const editor = host.openEditor(DIAGRAM, C7_XML);

            await feature.router.dispatch(new RecordedCommand("GetBpmnPluginsCommand"), editor.id);

            expect(
                editor
                    .postedOfType<BpmnPluginsQuery>("BpmnPluginsQuery")
                    .map(({ plugins }) => plugins),
            ).toEqual(posted);
            expect(calls).toEqual(expectedCalls);
        },
    );

    it.each<{ rendering: BpmnEditorHostExtensions["rendering"]; renders: number }>([
        { rendering: "on-host-document-change", renders: 1 },
        { rendering: "host-driven", renders: 0 },
    ])(
        "re-renders on a host document change only when it owns rendering ($rendering)",
        async ({ rendering, renders }) => {
            const { host, feature } = createFeature("full", rendering);
            const editor = await host.openSession(DIAGRAM, [...feature.participants], {
                content: C7_XML,
                router: feature.router,
            });

            editor.changeDocument(C7_XML);
            await settle();

            expect(editor.postedOfType("BpmnFileQuery")).toHaveLength(renders);
        },
    );

    it.each<{ rendering: BpmnEditorHostExtensions["rendering"]; renderedRevision: number }>([
        { rendering: "on-host-document-change", renderedRevision: 1 },
        { rendering: "host-driven", renderedRevision: 0 },
    ])(
        "shows content the core wrote into an open editor once ($rendering)",
        async ({ rendering, renderedRevision }) => {
            const { host, feature } = createFeature("full", rendering);
            const editor = await host.openSession(DIAGRAM, [...feature.participants], {
                content: C7_XML,
                router: feature.router,
            });
            const migratedXml = C7_XML.replace("7.22.0", "7.23.0");

            await host.documents.write(editor.id, migratedXml);
            await feature.renderCoreWrite(editor.id);
            await settle();

            expect(
                editor
                    .postedOfType<BpmnFileQuery>("BpmnFileQuery")
                    .map(({ content, documentRevision }) => ({ content, documentRevision })),
            ).toEqual([{ content: migratedXml, documentRevision: renderedRevision }]);
        },
    );

    it("reports no error when the editor closed between the core's write and its render", async () => {
        const { host, feature } = createFeature("full", "host-driven");
        const editor = await host.openSession(DIAGRAM, [...feature.participants], {
            content: C7_XML,
            router: feature.router,
        });
        await host.documents.write(editor.id, C7_XML.replace("7.22.0", "7.23.0"));
        const rendersBeforeClose = editor.postedOfType("BpmnFileQuery").length;

        editor.dispose();
        await feature.renderCoreWrite(editor.id);
        await settle();

        expect(host.notifier.errors).toEqual([]);
        expect(editor.postedOfType("BpmnFileQuery")).toHaveLength(rendersBeforeClose);
    });

    it("runs each contributed handler for its command", async () => {
        const { host, feature, calls } = createFeature("full");
        const editor = host.openEditor(DIAGRAM, C7_XML);

        for (const type of [
            "NavigateToReferencedModelCommand",
            "GetFormReferenceStatusCommand",
            "GetFormPreviewCommand",
            "SearchWorkspaceDefinitionsCommand",
            "OpenScriptEditorCommand",
            "OpenScriptEditorsCommand",
            "UpdateScriptSourceCommand",
            "UpdateScriptVariablesCommand",
            "NavigateToImplementationCommand",
            "SyncActivitiesCommand",
        ] as const) {
            await feature.router.dispatch(new RecordedCommand(type), editor.id);
        }

        expect(calls).toEqual([
            "navigate to model",
            "form reference status",
            "form preview",
            "search definitions",
            "open script",
            "open scripts",
            "update script source",
            "update script variables",
            "navigate to implementation",
            "sync activities",
        ]);
    });

    it("broadcasts the settings before the script editor resyncs", async () => {
        const opened: FakeEditorHandle[] = [];
        const settingsQueriesAtResync: number[] = [];
        const { host, feature, calls } = createFeature("full", "host-driven", () => {
            settingsQueriesAtResync.push(opened[0].postedOfType("BpmnModelerSettingQuery").length);
        });
        const editor = host.openEditor(DIAGRAM, C7_XML);
        opened.push(editor);

        await feature.router.dispatch(new GetBpmnModelerSettingCommand(), editor.id);

        expect(calls).toEqual(["resync scripts"]);
        expect(settingsQueriesAtResync).toEqual([1]);
    });

    it("stores a changed linting choice without pushing the lint state again", async () => {
        const { host, feature } = createFeature("full");
        const editor = host.openEditor(DIAGRAM, C7_XML);

        await feature.router.dispatch(new SetLintingEnabledCommand(false), editor.id);

        expect(host.lintingPreference.storedChoices).toEqual([false]);
        expect(editor.posted).toEqual([]);
    });

    it("pushes the lint state again when the page asks for the choice already stored", async () => {
        const { host, feature } = createFeature("full");
        const editor = host.openEditor(DIAGRAM, C7_XML);

        await feature.router.dispatch(new SetLintingEnabledCommand(true), editor.id);

        expect(host.lintingPreference.storedChoices).toEqual([]);
        expect(editor.postedOfType("BpmnlintInPageQuery")).toHaveLength(1);
    });

    it("compares the page's choice with the one the host stored", async () => {
        const { host, feature } = createFeature("full");
        host.settings.values.lintingEnabled = false;
        const editor = host.openEditor(DIAGRAM, C7_XML);

        await feature.router.dispatch(new SetLintingEnabledCommand(false), editor.id);
        await feature.router.dispatch(new SetLintingEnabledCommand(true), editor.id);

        expect(host.lintingPreference.storedChoices).toEqual([true]);
        expect(editor.postedOfType("BpmnLintDisabledQuery")).toHaveLength(1);
    });

    it("does not store a choice again once the host reads it back", async () => {
        const { host, feature } = createFeature("full");
        const editor = host.openEditor(DIAGRAM, C7_XML);

        await feature.router.dispatch(new SetLintingEnabledCommand(false), editor.id);
        await feature.router.dispatch(new SetLintingEnabledCommand(false), editor.id);

        expect(host.lintingPreference.storedChoices).toEqual([false]);
        expect(editor.postedOfType("BpmnLintDisabledQuery")).toHaveLength(1);
    });

    it.each<{ capabilities: HostCapabilities; stored: boolean; visible: boolean }>([
        { capabilities: "full", stored: false, visible: false },
        { capabilities: "bare", stored: false, visible: true },
    ])(
        "answers the panel state from the host's store, or visible without one ($capabilities)",
        async ({ capabilities, stored, visible }) => {
            const { host, feature } = createFeature(capabilities);
            host.propertiesPanelState.visible = stored;
            const editor = host.openEditor(DIAGRAM, C7_XML);

            await feature.router.dispatch(new GetPropertiesPanelStateCommand(), editor.id);

            expect(editor.postedOfType("PropertiesPanelStateQuery")).toEqual([
                expect.objectContaining({ visible }),
            ]);
        },
    );

    it.each<{ capabilities: HostCapabilities; served: string[] }>([
        { capabilities: "full", served: [".bpmn"] },
        { capabilities: "bare", served: [] },
    ])(
        "serves pending-edit flushes only when it syncs the document ($capabilities)",
        ({ capabilities, served }) => {
            const { servedExtensions } = createFeature(capabilities);

            expect(servedExtensions).toEqual(served);
        },
    );

    it("tags a forwarded webview log line with the diagram's file name", async () => {
        const { host, feature } = createFeature("full");
        const editor = host.openEditor(DIAGRAM, C7_XML);

        await feature.router.dispatch(new LogWarningCommand("slow render"), editor.id);
        await feature.router.dispatch(new LogWarningCommand("late reply"), "file:///gone.bpmn");

        expect(host.notifier.logged("warning")).toEqual([
            "[webview:order.bpmn] slow render",
            "[webview] late reply",
        ]);
    });

    it.each<{ capabilities: HostCapabilities; stored: boolean; visible: boolean }>([
        { capabilities: "full", stored: false, visible: false },
        { capabilities: "bare", stored: false, visible: true },
    ])(
        "opens a new editor's panel as the host stored it, or visible without a store ($capabilities)",
        ({ capabilities, stored, visible }) => {
            const { host, feature } = createFeature(capabilities);
            host.propertiesPanelState.visible = stored;

            expect(feature.initialPanelVisible()).toBe(visible);
        },
    );

    it("drops a pending template refresh once disposed", async () => {
        vi.useFakeTimers();
        try {
            const { host, feature } = createFeature("full");
            const editor = host.openEditor(DIAGRAM, C7_XML);
            await feature.templates.setElementTemplates(editor.id);
            const loaded = editor.postedOfType("ElementTemplatesQuery").length;

            feature.templates.refreshElementTemplates(editor.id);
            feature.dispose();
            await vi.advanceTimersByTimeAsync(1_000);

            expect(editor.postedOfType("ElementTemplatesQuery")).toHaveLength(loaded);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("BpmnEditorFeature with workspace rule packages", () => {
    const TASK_FOUND_CONFIG = JSON.stringify({
        rules: { "acme/task-found": "warn" },
        // A string extension lints on the host; the missing file is only skipped.
        moddleExtensions: { acme: "./acme.json" },
    });
    const DIAGRAM_WITH_TASK = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_1"><bpmn:task id="Task_1" /></bpmn:process>
</bpmn:definitions>`;
    const PLUGIN_FILES: Record<string, string> = {
        "package.json": JSON.stringify({ name: "bpmnlint-plugin-acme", version: "1.0.0" }),
        "index.js": "module.exports = {};",
        "rules/task-found.js": `module.exports = () => ({
    check(node, reporter) {
        if (node.$type === "bpmn:Task") reporter.report(node.id, "found");
    },
});`,
    };

    let workspaceDir: string;

    beforeEach(async () => {
        workspaceDir = toWorkspacePath(
            realpathSync(await mkdtemp(join(tmpdir(), "bpmn-editor-rule-packages-"))),
        );
    });

    afterEach(async () => {
        await rm(workspaceDir, { recursive: true, force: true });
    });

    /** The package on disk for Node's require, and the same bytes in memory for the gate's port. */
    async function installAcme(packages: InMemoryInstalledPackages): Promise<string> {
        const pluginDir = `${workspaceDir}/node_modules/bpmnlint-plugin-acme`;
        for (const [relPath, content] of Object.entries(PLUGIN_FILES)) {
            const path = `${pluginDir}/${relPath}`;
            await mkdir(join(path, ".."), { recursive: true });
            await writeFile(path, content);
            packages.writeFile(path, content);
        }
        return pluginDir;
    }

    async function lintWithAcmeInstalled({
        wiresRulePackages,
        allows = true,
        review,
    }: {
        wiresRulePackages: boolean;
        allows?: boolean;
        review?: ScriptedReview;
    }) {
        const configPath = `${workspaceDir}/.bpmnlintrc`;
        const diagramPath = `${workspaceDir}/order.bpmn`;
        const packages = new InMemoryInstalledPackages((bytes) =>
            createHash("sha256").update(bytes).digest("hex"),
        );
        const pluginDir = await installAcme(packages);
        const host = createTestHost({
            folders: [workspaceDir],
            files: { [configPath]: TASK_FOUND_CONFIG },
            noticeAnswers: { [RULE_PACKAGE_APPROVAL_NOTICE_ID]: "review" },
            promptAnswers: allows ? { [RULE_PACKAGE_APPROVAL_PROMPT_ID]: [pluginDir] } : {},
        });
        const feature = new BpmnEditorFeature(
            {
                ...host,
                artifacts: new ArtifactService(host.workspace, host.settings, host.notifier),
                ...(wiresRulePackages
                    ? {
                          rulePackages: {
                              approvals: host.pluginApprovals,
                              installedPackages: packages,
                              actionNotifier: host.actionNotifier,
                              questions: new QuestionQueue(),
                              ...(review === undefined ? {} : { review }),
                          },
                      }
                    : {}),
            },
            { rendering: "host-driven" },
            recordingContributions([], () => undefined),
        );
        const editor = host.openEditor(diagramPath, DIAGRAM_WITH_TASK, { focused: true });

        await feature.lintConfig.setBpmnlintConfig(editor.id);
        await feature.lintConfig.whenApprovalSettled();

        const results = editor
            .postedOfType<BpmnlintResultsQuery>("BpmnlintResultsQuery")
            .map((query) => Object.keys(query.results ?? {}));
        return { host, feature, editor, pluginDir, results };
    }

    it("asks about a rule package that skipped rules, and lints with it once allowed", async () => {
        const { host, pluginDir, results } = await lintWithAcmeInstalled({
            wiresRulePackages: true,
        });

        expect(host.actionNotifier.notices.map(({ id }) => id)).toEqual([
            RULE_PACKAGE_APPROVAL_NOTICE_ID,
        ]);
        expect(host.pluginApprovals.approvals.map(({ pluginId }) => pluginId)).toEqual([pluginDir]);
        expect(results).toEqual([[], ["acme/task-found"]]);
    });

    it("takes Review… to the review the host passes, which can leave the package to a view", async () => {
        const review = new ScriptedReview({ [RULE_PACKAGE_APPROVAL_PROMPT_ID]: "leftForView" });
        const { host, pluginDir, results } = await lintWithAcmeInstalled({
            wiresRulePackages: true,
            review,
        });

        expect(review.requests.map(({ artifactIds }) => artifactIds)).toEqual([[pluginDir]]);
        expect(host.picker.prompts).toEqual([]);
        expect(host.pluginApprovals.approvals).toEqual([]);
        expect(results).toEqual([[]]);
    });

    it("lets the gate report a package the user declined as declined", async () => {
        const { feature, editor, pluginDir } = await lintWithAcmeInstalled({
            wiresRulePackages: true,
            allows: false,
        });

        await feature.lintConfig.setBpmnlintConfig(editor.id);

        expect(feature.rulePackageCatalog?.seenPackages()).toEqual([
            { id: pluginDir, kind: "package", state: "declined", needed: true },
        ]);
    });

    it.each([
        { case: "lints a diagram blocked on a package again", disposed: false, relints: 1 },
        { case: "follows no approval change once disposed", disposed: true, relints: 0 },
    ])("$case when another writer allows it", async ({ disposed, relints }) => {
        const { host, feature, editor, pluginDir, results } = await lintWithAcmeInstalled({
            wiresRulePackages: true,
            allows: false,
        });

        if (disposed) feature.dispose();
        host.pluginApprovals.storeElsewhere(
            [{ pluginId: pluginDir, contentHash: rulePackageContentHash("elsewhere") }],
            { notify: true },
        );
        await feature.lintConfig.whenApprovalSettled();

        expect(editor.postedOfType("BpmnlintResultsQuery")).toHaveLength(results.length + relints);
    });

    it("stops following the approval store once disposed, so a revoke elsewhere leaves no trace", async () => {
        const { host, feature, editor, results } = await lintWithAcmeInstalled({
            wiresRulePackages: true,
        });

        feature.dispose();
        host.pluginApprovals.storeElsewhere([], { notify: true });
        await feature.lintConfig.whenApprovalSettled();

        expect(feature.rulePackageCatalog?.revokedThisSession()).toEqual(new Set());
        expect(editor.postedOfType("BpmnlintResultsQuery")).toHaveLength(results.length);
    });

    it("runs no workspace rule package and asks nothing on a host that wires no rule package ports", async () => {
        const { host, results } = await lintWithAcmeInstalled({ wiresRulePackages: false });

        expect(host.actionNotifier.notices).toEqual([]);
        expect(results).toEqual([[]]);
    });
});
