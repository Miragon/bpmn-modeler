import { basename } from "path";

import { BpmnEditorCommandType } from "@miragon/bpmn-modeler-shared";

import {
    ClipboardPort,
    DocumentPort,
    NotifierPort,
    PickerPort,
    SettingsPort,
    StatusBarPort,
    WorkspacePort,
} from "../../kernel/domain/hostPorts";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { EditorSessionParticipant } from "../../editorSession/domain/EditorSessionParticipant";
import {
    displayDocumentHandler,
    syncDocumentHandler,
} from "../../editorSession/infrastructure/documentMessageHandlers";
import { requestFocusHandler } from "../../editorSession/infrastructure/webviewFocusMessageHandlers";
import { webviewLogHandler } from "../../editorSession/infrastructure/webviewLogMessageHandlers";
import { showInfoHandler } from "../../editorSession/infrastructure/webviewNotificationMessageHandlers";
import {
    documentFlushedHandler,
    DocumentFlushService,
} from "../../editorSession/service/DocumentFlushService";
import { EditorContribution } from "../../editorSession/service/EditorContribution";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { PendingEditsFlush } from "../../editorSession/service/PendingEditsFlush";
import {
    CommandTable,
    WebviewMessageRouter,
} from "../../editorSession/service/WebviewMessageRouter";
import { DocumentRenderParticipant } from "../../editorSession/session/DocumentRenderParticipant";
import { DiagnosticsPort, LintingPreferencePort, PropertiesPanelStatePort } from "./domain/ports";
import { NodeBpmnLinter } from "./infrastructure/bpmnlint/NodeBpmnLinter";
import { NoopDiagnostics } from "./infrastructure/bpmnlint/NoopDiagnostics";
import {
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
} from "./infrastructure/bpmnMessageHandlers";
import { BpmnClipboardMediator } from "./service/BpmnClipboardMediator";
import {
    BpmnElementTemplatesService,
    CachedTemplateProvider,
} from "./service/BpmnElementTemplatesService";
import { BpmnLayoutService } from "./service/BpmnLayoutService";
import { BpmnLintConfigLocator } from "./service/BpmnLintConfigLocator";
import { BpmnLintConfigService } from "./service/BpmnLintConfigService";
import { BpmnModelerService } from "./service/BpmnModelerService";
import { BpmnPropertiesPanelService } from "./service/BpmnPropertiesPanelService";
import { BpmnSettingsBroadcaster } from "./service/BpmnSettingsBroadcaster";
import { BpmnlintParticipant } from "./session/BpmnlintParticipant";
import { BpmnSettingsParticipant } from "./session/BpmnSettingsParticipant";
import { ElementTemplatesParticipant } from "./session/ElementTemplatesParticipant";
import { EngineVersionStatusBarParticipant } from "./session/EngineVersionStatusBarParticipant";

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
}

/** The core's document services behind {@link DOCUMENT_SYNC_COMMAND_TYPES}. */
export interface BpmnDocumentSync {
    readonly flushes: DocumentFlushService;
    readonly pendingEdits: Pick<PendingEditsFlush, "serve">;
}

/** What differs between hosts; an absent capability ignores its commands with one reason. */
export interface BpmnEditorHostExtensions {
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
        "NavigateToReferencedModelCommand" | "GetFormReferenceStatusCommand"
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
    readonly layout: BpmnLayoutService;
    readonly router: WebviewMessageRouter;
    readonly participants: readonly EditorSessionParticipant[];

    private readonly panel: BpmnPropertiesPanelService;
    private readonly rendering: BpmnEditorHostExtensions["rendering"];

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
        this.templates = new BpmnElementTemplatesService(
            ports.store,
            ports.documents,
            ports.artifacts,
            ports.statusBar,
            ports.notifier,
            ports.templateProvider,
        );
        this.layout = new BpmnLayoutService(ports.store, ports.notifier, ports.picker);
        const lintConfigLocator = new BpmnLintConfigLocator(
            ports.workspace,
            ports.settings,
            ports.artifacts,
        );
        const lintConfig = new BpmnLintConfigService(
            ports.store,
            ports.documents,
            lintConfigLocator,
            new NodeBpmnLinter(),
            ports.diagnostics ?? new NoopDiagnostics(),
            ports.statusBar,
            ports.notifier,
            ports.settings,
        );
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
            new EngineVersionStatusBarParticipant(ports.statusBar, ports.documents),
            contributions.deploymentStatus,
            scriptEditor.participant,
            codeLink.participant,
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
        this.templates.dispose();
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
