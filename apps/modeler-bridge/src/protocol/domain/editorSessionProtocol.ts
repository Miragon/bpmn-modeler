import { PluginApproval, RawModelerSettings } from "@miragon/bpmn-modeler-core";
import { Command, Query } from "@miragon/bpmn-modeler-shared";

import {
    TEMPLATE_PREFERENCES_SAMPLE,
    TemplatePreferencesSnapshot,
    WorkspaceTrustSnapshot,
} from "./kernelProtocol";
import { ProtocolEntry } from "./protocolEntry";
import { PLUGIN_APPROVAL_SAMPLE, SAMPLE_COMMAND, SAMPLE_QUERY } from "./sharedSamples";

/** Per-editor metadata + cached document text, keyed by `editorId` (the URI string). */
export interface SessionMeta {
    editorId: string;
    /** Exact host editor generation for rejecting same-URI stale traffic. */
    sessionId?: number;
    uriString: string;
    path: string;
    fsPath: string;
    scheme: string;
    /** Host-provided workspace root, used to seed element-template discovery. */
    workspaceRoot?: string;
}

/**
 * `session/register` — the editor identity/meta plus the initial document
 * content and an optional settings snapshot that must seed the host-global
 * config before any template discovery runs.
 */
export interface RegisterParams extends SessionMeta {
    content: string;
    /** Host-owned revision preserved across bridge restarts. */
    documentRevision?: number;
    /** Full `miragon.bpmnModeler.*` snapshot; seeds settings before template discovery. */
    settings?: RawModelerSettings;
    /** The user's plugin approvals, so the first plugin request of a session reads them. */
    pluginApprovals?: PluginApproval[];
    /** The host's revision of `pluginApprovals`, as `pluginApprovals/didChange` carries it. */
    pluginApprovalsRevision?: number;
    /** The user's template switches, so the first templates the editor sends hide the switched-off ones. */
    templatePreferences?: TemplatePreferencesSnapshot;
    /** Whether the user trusts the project, so the first plugin request and lint already read it. */
    workspaceTrust?: WorkspaceTrustSnapshot;
}

/** `webview/message` — a webview {@link Command} the host forwards into the core. */
export interface WebviewMessageParams {
    editorId: string;
    sessionId?: number;
    message: Command;
}

/**
 * `document/didChange` — the host reports new on-disk/editor text for an editor.
 * Only external changes are sent; the core's own writes are acknowledged by the
 * {@link DocumentWriteResult} instead of an echo.
 */
export interface DocumentDidChangeParams {
    editorId: string;
    sessionId?: number;
    content: string;
    /** Host-owned document revision after applying this external change. */
    documentRevision?: number;
}

/** `session/setActive`, `session/dispose` — address one exact editor session. */
export interface EditorRefParams {
    editorId: string;
    sessionId?: number;
}

/** `document/write` — push core-originated text; result reports whether it changed. */
export interface DocumentWriteParams {
    editorId: string;
    sessionId?: number;
    content: string;
    /** Host document revision on which this write was based. */
    expectedDocumentRevision?: number;
}
export interface DocumentWriteResult {
    changed?: boolean;
    /** False when the host rejected a stale session or document revision. */
    accepted?: boolean;
    /**
     * The bytes the host Document actually holds, present only when the host
     * normalised the written content (line separators) so the mirror stays exact.
     */
    normalizedContent?: string;
}

/**
 * `document/save` — persist the editor; `saved` is `true` when the Document is
 * saved or had nothing to save, `false` when the host could not save it.
 */
export type DocumentSaveParams = EditorRefParams;
export interface DocumentSaveResult {
    saved?: boolean;
}

/** `editor/postMessage` — the core drives the host's editor browser. */
export interface EditorPostMessageParams {
    editorId: string;
    sessionId?: number;
    message: Command | Query;
}

export const EDITOR_SESSION_METHODS = {
    sessionRegister: "session/register",
    webviewMessage: "webview/message",
    documentDidChange: "document/didChange",
    sessionSetActive: "session/setActive",
    sessionDispose: "session/dispose",
    documentWrite: "document/write",
    documentSave: "document/save",
    editorPostMessage: "editor/postMessage",
    editorReload: "editor/reload",
} as const;

export const EDITOR_SESSION_HOST_TO_CORE_NOTIFICATIONS = [
    {
        method: EDITOR_SESSION_METHODS.sessionRegister,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            editorId: "file:///a.bpmn",
            sessionId: 1,
            documentRevision: 2,
            uriString: "file:///a.bpmn",
            path: "/a.bpmn",
            fsPath: "/a.bpmn",
            scheme: "file",
            workspaceRoot: "/repo",
            content: "<bpmn/>",
            settings: {},
            pluginApprovals: [PLUGIN_APPROVAL_SAMPLE],
            pluginApprovalsRevision: 7,
            templatePreferences: TEMPLATE_PREFERENCES_SAMPLE,
            workspaceTrust: { trusted: true, revision: 4 },
        } satisfies RegisterParams,
    },
    {
        method: EDITOR_SESSION_METHODS.webviewMessage,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            editorId: "e1",
            sessionId: 1,
            message: SAMPLE_COMMAND,
        } satisfies WebviewMessageParams,
    },
    {
        method: EDITOR_SESSION_METHODS.documentDidChange,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            editorId: "e1",
            sessionId: 1,
            content: "<bpmn/>",
            documentRevision: 2,
        } satisfies DocumentDidChangeParams,
    },
    {
        method: EDITOR_SESSION_METHODS.sessionSetActive,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { editorId: "e1", sessionId: 1 } satisfies EditorRefParams,
    },
    {
        method: EDITOR_SESSION_METHODS.sessionDispose,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { editorId: "e1", sessionId: 1 } satisfies EditorRefParams,
    },
] as const satisfies readonly ProtocolEntry[];

export const EDITOR_SESSION_CORE_TO_HOST_REQUESTS = [
    {
        method: EDITOR_SESSION_METHODS.documentWrite,
        direction: "coreToHost",
        kind: "request",
        replyWait: "syncedWrite",
        paramsFixture: {
            editorId: "e1",
            sessionId: 1,
            content: "<bpmn/>",
            expectedDocumentRevision: 2,
        } satisfies DocumentWriteParams,
        resultFixture: {
            changed: true,
            accepted: true,
            normalizedContent: "<bpmn/>",
        } satisfies DocumentWriteResult,
    },
    {
        method: EDITOR_SESSION_METHODS.documentSave,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: { editorId: "e1", sessionId: 1 } satisfies DocumentSaveParams,
        resultFixture: { saved: true } satisfies DocumentSaveResult,
    },
] as const satisfies readonly ProtocolEntry[];

export const EDITOR_SESSION_CORE_TO_HOST_NOTIFICATIONS = [
    {
        method: EDITOR_SESSION_METHODS.editorPostMessage,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {
            editorId: "e1",
            sessionId: 1,
            message: SAMPLE_QUERY,
        } satisfies EditorPostMessageParams,
    },
    {
        method: EDITOR_SESSION_METHODS.editorReload,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { editorId: "e1", sessionId: 1 } satisfies EditorRefParams,
    },
] as const satisfies readonly ProtocolEntry[];
