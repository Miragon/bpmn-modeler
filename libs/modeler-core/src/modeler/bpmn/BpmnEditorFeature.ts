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
import { DocumentFlushService } from "../../editorSession/service/DocumentFlushService";
import { EditorContribution } from "../../editorSession/service/EditorContribution";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { PendingEditsFlush } from "../../editorSession/service/PendingEditsFlush";
import { WebviewMessageRouter } from "../../editorSession/service/WebviewMessageRouter";
import { DiagnosticsPort, LintingPreferencePort, PropertiesPanelStatePort } from "./domain/ports";
import {
    BpmnElementTemplatesService,
    CachedTemplateProvider,
} from "./service/BpmnElementTemplatesService";
import { BpmnLayoutService } from "./service/BpmnLayoutService";
import { BpmnModelerService } from "./service/BpmnModelerService";

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

/**
 * The BPMN editor for every host: builds its services from the host's ports,
 * one router from a table that names every BPMN editor command, and the
 * session participants in one order.
 */
export class BpmnEditorFeature {
    readonly bpmnService: BpmnModelerService;
    readonly templates: BpmnElementTemplatesService;
    readonly layout: BpmnLayoutService;
    readonly router = new WebviewMessageRouter();
    readonly participants: readonly EditorSessionParticipant[] = [];

    constructor(
        ports: BpmnEditorHostPorts,
        _extensions: BpmnEditorHostExtensions,
        _contributions: BpmnEditorContributions,
    ) {
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
    }
}
