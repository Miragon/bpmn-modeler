import { basename } from "path";

import { BpmnEditorCommandType } from "@miragon/bpmn-modeler-shared";

import { TemplatePreferenceStorePort } from "../../../kernel/port/templatePreferencePorts";
import {
    ClipboardPort,
    DocumentPort,
    NotifierPort,
    PickerPort,
    SettingsPort,
    StatusBarPort,
    WorkspacePort,
} from "../../../kernel/port/hostPorts";
import { ArtifactService } from "../../../kernel/service/ArtifactService";
import { EditorSessionParticipant } from "../../../editorSession/domain/EditorSessionParticipant";
import {
    displayDocumentHandler,
    syncDocumentHandler,
} from "../../../editorSession/adapter/in/documentMessageHandlers";
import { requestFocusHandler } from "../../../editorSession/adapter/in/webviewFocusMessageHandlers";
import { webviewLogHandler } from "../../../editorSession/adapter/in/webviewLogMessageHandlers";
import { showInfoHandler } from "../../../editorSession/adapter/in/webviewNotificationMessageHandlers";
import {
    documentFlushedHandler,
    DocumentFlushService,
} from "../../../editorSession/service/DocumentFlushService";
import { EditorContribution } from "../../../editorSession/service/EditorContribution";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";
import { PendingEditsFlush } from "../../../editorSession/service/PendingEditsFlush";
import {
    CommandTable,
    WebviewMessageRouter,
} from "../../../editorSession/service/WebviewMessageRouter";
import { DocumentRenderParticipant } from "../../../editorSession/service/DocumentRenderParticipant";
import {
    DiagnosticsPort,
    LintingPreferencePort,
    PropertiesPanelStatePort,
} from "../port/bpmnPorts";
import { NoopDiagnostics } from "../adapter/out/bpmnlint/NoopDiagnostics";
import {
    answerWithoutPluginsHandler,
    cleanupReportHandler,
    diagramFormattedHandler,
    getBpmnlintConfigHandler,
    getBpmnModelerSettingHandler,
    getClipboardHandler,
    getElementTemplatesHandler,
    getPropertiesPanelStateHandler,
    getTextClipboardHandler,
    setClipboardHandler,
    setLintingEnabledHandler,
    setPropertiesPanelStateHandler,
    setTextClipboardHandler,
    updateLintResultsHandler,
} from "../adapter/in/bpmnMessageHandlers";
import { BpmnClipboardMediator } from "../service/BpmnClipboardMediator";
import {
    BpmnElementTemplatesService,
    CachedTemplateProvider,
} from "../service/BpmnElementTemplatesService";
import { BpmnLayoutService } from "../service/BpmnLayoutService";
import { BpmnLintConfigLocator } from "../service/BpmnLintConfigLocator";
import { BpmnLintConfigService } from "../service/BpmnLintConfigService";
import { BpmnModelerService } from "../service/BpmnModelerService";
import { BpmnPropertiesPanelService } from "../service/BpmnPropertiesPanelService";
import { BpmnSettingsBroadcaster } from "../service/BpmnSettingsBroadcaster";
import { BpmnlintParticipant } from "../service/BpmnlintParticipant";
import { BpmnSettingsParticipant } from "../service/BpmnSettingsParticipant";
import { ElementTemplatesParticipant } from "../service/ElementTemplatesParticipant";
import { EngineVersionStatusBarParticipant } from "../service/EngineVersionStatusBarParticipant";
import { LoadedTemplateDirs } from "../service/LoadedTemplateDirs";
import { StatusItemOwnership } from "../../../editorSession/domain/StatusItemOwnership";
import { RulePackageInventory } from "../service/RulePackageInventory";
import { TemplateInventory } from "../service/TemplateInventory";
import { BpmnRulePackagePorts, RulePackageLinting, rulePackageLinting } from "./rulePackageLinting";

export type { BpmnRulePackagePorts } from "./rulePackageLinting";

/** The document plumbing: a host routes all three to the core's document services, or none. */
export const DOCUMENT_SYNC_COMMAND_TYPES = [
    "GetBpmnFileCommand",
    "SyncDocumentCommand",
    "DocumentFlushedCommand",
] as const satisfies readonly BpmnEditorCommandType[];

export type DocumentSyncCommandType = (typeof DOCUMENT_SYNC_COMMAND_TYPES)[number];

export interface BpmnEditorHostPorts {
    readonly store: EditorSessionStore;
    readonly documents: DocumentPort;
    readonly workspace: WorkspacePort;
    readonly settings: SettingsPort;
    readonly notifier: NotifierPort;
    readonly picker: PickerPort;
    readonly statusBar: StatusBarPort;
    readonly clipboard: ClipboardPort;
    readonly artifacts: ArtifactService;
    /** Absent on a host without a Problems panel. */
    readonly diagnostics?: DiagnosticsPort;
    /** Merges the marketplace cache into element-template discovery. */
    readonly templateProvider?: CachedTemplateProvider;
    /** Absent: the host keeps no template switches, and every template is offered. */
    readonly templatePreferences?: TemplatePreferenceStorePort;
    /** Absent: bpmnlint runs no workspace rule package, only the bundled rules. */
    readonly rulePackages?: BpmnRulePackagePorts;
}

/** The core's document services behind {@link DOCUMENT_SYNC_COMMAND_TYPES}. */
export interface BpmnDocumentSync {
    readonly flushes: DocumentFlushService;
    readonly pendingEdits: Pick<PendingEditsFlush, "serve">;
}

/** What differs between hosts; an absent capability ignores its commands with one reason. */
export interface BpmnEditorHostExtensions {
    readonly engineVersionOwnership?: StatusItemOwnership;
    /** `host-driven`: the host re-renders on its own document change, so the editor does not. */
    readonly rendering: "on-host-document-change" | "host-driven";
    /** Absent: the host's own plumbing owns the document. */
    readonly documentSync?: BpmnDocumentSync;
    /** Absent: the host has no linting switch. */
    readonly lintingPreference?: LintingPreferencePort;
    /** Absent: every panel opens visible, and a toggle lasts as long as its webview. */
    readonly propertiesPanelState?: PropertiesPanelStatePort;
}

/** The other features' handlers and participants, which the hosts' composition hands over. */
export interface BpmnEditorContributions {
    readonly navigation: EditorContribution<
        | "NavigateToReferencedModelCommand"
        | "GetFormReferenceStatusCommand"
        | "GetFormPreviewCommand"
    >;
    readonly definitionSearch: EditorContribution<"SearchWorkspaceDefinitionsCommand">;
    readonly deploymentStatus: EditorSessionParticipant;
    /** Its `GetBpmnModelerSettingCommand` handler runs after the settings broadcast. */
    readonly scriptEditor: EditorContribution<
        | "OpenScriptEditorCommand"
        | "OpenScriptEditorsCommand"
        | "UpdateScriptSourceCommand"
        | "UpdateScriptVariablesCommand"
        | "GetBpmnModelerSettingCommand"
    >;
    readonly codeLink: EditorContribution<
        "NavigateToImplementationCommand" | "SyncActivitiesCommand"
    >;
    /** Absent: the host serves no plugins, and the editor is told so at once. */
    readonly plugins?: EditorContribution<"GetBpmnPluginsCommand">;
}

const PANEL_ALWAYS_VISIBLE: PropertiesPanelStatePort = {
    getVisibility: () => true,
    setVisibility: () => Promise.resolve(),
};

/**
 * The BPMN editor for every host: builds its services from the host's ports,
 * one router from a table that names every BPMN editor command, and the
 * session participants in one order. Other features reach it only through
 * {@link BpmnEditorContributions}, which the hosts' composition hands over.
 */
export class BpmnEditorFeature {
    readonly bpmnService: BpmnModelerService;
    readonly templates: BpmnElementTemplatesService;
    /** What the add-on catalog lists of the element templates. */
    readonly templateInventory: TemplateInventory;
    readonly layout: BpmnLayoutService;
    readonly lintConfig: BpmnLintConfigService;
    /** What the add-on catalog lists of the rule packages; absent without {@link BpmnRulePackagePorts}. */
    readonly rulePackageInventory?: RulePackageInventory;
    readonly router: WebviewMessageRouter;
    readonly participants: readonly EditorSessionParticipant[];

    private readonly panel: BpmnPropertiesPanelService;
    private readonly rulePackages: RulePackageLinting;
    private readonly rendering: BpmnEditorHostExtensions["rendering"];
    private readonly switchSubscription?: { dispose(): void };

    constructor(
        private readonly ports: BpmnEditorHostPorts,
        extensions: BpmnEditorHostExtensions,
        contributions: BpmnEditorContributions,
    ) {
        this.rendering = extensions.rendering;
        this.bpmnService = new BpmnModelerService(
            ports.store,
            ports.documents,
            ports.picker,
            ports.statusBar,
            ports.notifier,
            ports.settings,
        );
        const loadedTemplateDirs = new LoadedTemplateDirs();
        this.templates = new BpmnElementTemplatesService(
            ports.store,
            ports.documents,
            ports.artifacts,
            ports.statusBar,
            ports.notifier,
            loadedTemplateDirs,
            ports.templateProvider,
            ports.templatePreferences && {
                preferences: ports.templatePreferences,
                workspace: ports.workspace,
            },
        );
        this.switchSubscription = ports.templatePreferences?.onDidChange(() => {
            void this.templates.refreshOffers();
        });
        this.templateInventory = new TemplateInventory(loadedTemplateDirs, ports.artifacts);
        this.layout = new BpmnLayoutService(ports.store, ports.notifier, ports.picker);
        const lintConfigLocator = new BpmnLintConfigLocator(
            ports.workspace,
            ports.settings,
            ports.artifacts,
        );
        this.rulePackages = rulePackageLinting(ports.rulePackages, ports);
        this.rulePackageInventory = this.rulePackages.inventory;
        const lintConfig = (this.lintConfig = new BpmnLintConfigService(
            ports.store,
            ports.documents,
            lintConfigLocator,
            this.rulePackages.linter,
            ports.diagnostics ?? new NoopDiagnostics(),
            ports.statusBar,
            ports.notifier,
            ports.settings,
            this.rulePackages.approvals,
        ));
        const clipboard = new BpmnClipboardMediator(ports.store, ports.clipboard, ports.notifier);
        const settingsBroadcaster = new BpmnSettingsBroadcaster(
            ports.store,
            ports.settings,
            ports.notifier,
        );
        this.panel = new BpmnPropertiesPanelService(
            ports.store,
            extensions.propertiesPanelState ?? PANEL_ALWAYS_VISIBLE,
            ports.notifier,
        );
        const logToHost = webviewLogHandler(ports.notifier, (editorId) => this.logSource(editorId));
        const { navigation, definitionSearch, scriptEditor, codeLink } = contributions;

        const commands: CommandTable<BpmnEditorCommandType> = {
            ...this.documentSyncRoutes(extensions.documentSync),
            LogDebugCommand: [logToHost],
            LogInfoCommand: [logToHost],
            LogWarningCommand: [logToHost],
            LogErrorCommand: [logToHost],
            ShowInfoCommand: [showInfoHandler(ports.notifier)],
            RequestFocusCommand: [requestFocusHandler(ports.store)],
            GetDiagramAsSVGCommand: {
                ignored: "the SVG export awaits this reply outside the router",
            },
            GetElementTemplatesCommand: [getElementTemplatesHandler(this.templates)],
            GetBpmnPluginsCommand: [
                contributions.plugins?.commandHandlers.GetBpmnPluginsCommand ??
                    answerWithoutPluginsHandler(ports.store),
            ],
            GetBpmnlintConfigCommand: [getBpmnlintConfigHandler(lintConfig)],
            UpdateLintResultsCommand: [updateLintResultsHandler(lintConfig)],
            SetLintingEnabledCommand: extensions.lintingPreference
                ? [
                      setLintingEnabledHandler(
                          extensions.lintingPreference,
                          ports.settings,
                          lintConfig,
                      ),
                  ]
                : { ignored: "the host has no linting switch" },
            GetBpmnModelerSettingCommand: [
                getBpmnModelerSettingHandler(settingsBroadcaster),
                scriptEditor.commandHandlers.GetBpmnModelerSettingCommand,
            ],
            GetPropertiesPanelStateCommand: [getPropertiesPanelStateHandler(this.panel)],
            SetPropertiesPanelStateCommand: extensions.propertiesPanelState
                ? [setPropertiesPanelStateHandler(this.panel)]
                : { ignored: "the host does not keep the panel visibility" },
            GetClipboardCommand: [getClipboardHandler(clipboard)],
            SetClipboardCommand: [setClipboardHandler(clipboard)],
            GetTextClipboardCommand: [getTextClipboardHandler(clipboard)],
            SetTextClipboardCommand: [setTextClipboardHandler(clipboard)],
            DiagramFormattedCommand: [diagramFormattedHandler(this.layout)],
            CleanupReportCommand: [cleanupReportHandler(this.layout)],
            NavigateToReferencedModelCommand: [
                navigation.commandHandlers.NavigateToReferencedModelCommand,
            ],
            GetFormReferenceStatusCommand: [
                navigation.commandHandlers.GetFormReferenceStatusCommand,
            ],
            GetFormPreviewCommand: [navigation.commandHandlers.GetFormPreviewCommand],
            SearchWorkspaceDefinitionsCommand: [
                definitionSearch.commandHandlers.SearchWorkspaceDefinitionsCommand,
            ],
            OpenScriptEditorCommand: [scriptEditor.commandHandlers.OpenScriptEditorCommand],
            OpenScriptEditorsCommand: [scriptEditor.commandHandlers.OpenScriptEditorsCommand],
            UpdateScriptSourceCommand: [scriptEditor.commandHandlers.UpdateScriptSourceCommand],
            UpdateScriptVariablesCommand: [
                scriptEditor.commandHandlers.UpdateScriptVariablesCommand,
            ],
            NavigateToImplementationCommand: [
                codeLink.commandHandlers.NavigateToImplementationCommand,
            ],
            SyncActivitiesCommand: [codeLink.commandHandlers.SyncActivitiesCommand],
        };
        this.router = WebviewMessageRouter.fromTable(commands);

        this.participants = [
            this.renderParticipant(extensions.rendering),
            navigation.participant,
            definitionSearch.participant,
            new ElementTemplatesParticipant(this.templates, ports.artifacts, ports.notifier),
            new BpmnlintParticipant(lintConfig, lintConfigLocator, ports.statusBar, ports.notifier),
            new BpmnSettingsParticipant(settingsBroadcaster),
            new EngineVersionStatusBarParticipant(
                ports.statusBar,
                ports.documents,
                extensions.engineVersionOwnership,
            ),
            contributions.deploymentStatus,
            scriptEditor.participant,
            codeLink.participant,
            ...(contributions.plugins ? [contributions.plugins.participant] : []),
        ];
    }

    initialPanelVisible(): boolean {
        return this.panel.getPersistedPanelVisibility();
    }

    /**
     * Shows content the core wrote into an open editor through an unguarded
     * {@link DocumentPort.write}. Only a `host-driven` host needs this: it reports
     * no change for the core's own write. On the other hosts that change renders,
     * which a guarded write would suppress.
     */
    async renderCoreWrite(editorId: string): Promise<void> {
        if (this.rendering === "host-driven" && this.ports.store.hasEditor(editorId)) {
            // The host did not advance its revision for this write; a local bump
            // would make it reject every later sync from the page.
            await this.bpmnService.display(editorId);
        }
    }

    dispose(): void {
        this.switchSubscription?.dispose();
        this.templates.dispose();
        this.lintConfig.dispose();
        this.rulePackages.dispose();
    }

    private documentSyncRoutes(
        documentSync: BpmnDocumentSync | undefined,
    ): CommandTable<DocumentSyncCommandType> {
        if (!documentSync) {
            const ownPlumbing = { ignored: "the host's own plumbing owns the document" };
            return {
                GetBpmnFileCommand: ownPlumbing,
                SyncDocumentCommand: ownPlumbing,
                DocumentFlushedCommand: ownPlumbing,
            };
        }
        documentSync.pendingEdits.serve(".bpmn", this.bpmnService);
        return {
            GetBpmnFileCommand: [
                displayDocumentHandler(
                    this.bpmnService,
                    this.ports.notifier,
                    "Bpmn modeler is ready",
                ),
            ],
            SyncDocumentCommand: [syncDocumentHandler(this.bpmnService)],
            DocumentFlushedCommand: [documentFlushedHandler(documentSync.flushes)],
        };
    }

    private renderParticipant(
        rendering: BpmnEditorHostExtensions["rendering"],
    ): EditorSessionParticipant {
        if (rendering === "on-host-document-change") {
            return new DocumentRenderParticipant(this.bpmnService, ".bpmn", this.ports.notifier);
        }
        return {
            onResolve: (session) => {
                this.bpmnService.registerSession(session.editorId);
                session.onDispose(() => this.bpmnService.disposeSession(session.editorId));
            },
        };
    }

    // getFilePath throws for an editor the store no longer tracks; a bare
    // `[webview]` tag is better than dropping the line.
    private logSource(editorId: string): string | undefined {
        try {
            return basename(this.ports.documents.getFilePath(editorId));
        } catch {
            return undefined;
        }
    }
}
