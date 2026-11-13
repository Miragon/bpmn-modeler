import { ProtocolEntry } from "./protocolEntry";
import {
    PLUGIN_APPROVAL_SAMPLE,
    SAMPLE_COMMAND,
    SAMPLE_QUERY,
    TEMPLATE_PREFERENCES_SAMPLE,
} from "./sharedSamples";
import {
    DocumentDidChangeParams,
    DocumentSaveParams,
    DocumentSaveResult,
    DocumentWriteParams,
    DocumentWriteResult,
    EditorPostMessageParams,
    EditorRefParams,
    RegisterParams,
    WebviewMessageParams,
} from "./types";

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
