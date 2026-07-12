/**
 * The single literal source of truth for the host↔core RPC surface: one flat
 * {@link PROTOCOL} array pairing every method with its direction, kind, and a
 * representative param (and, for requests, result) fixture. The TS side owns
 * this contract; the IntelliJ Kotlin host verifies against the derived
 * {@link protocolSnapshot} (committed as `protocol.json`).
 *
 * Drift is caught two ways. Compile-time: each fixture is checked against its
 * named param/result type via `satisfies`, so renaming a field in `types.ts`
 * without updating the fixture is a build error. Runtime: `protocol.spec.ts`
 * pins the method set, directions, and per-method key sets against the snapshot.
 *
 * Adding a method = add a {@link METHODS} entry + a {@link PROTOCOL} entry +
 * refresh `protocol.json`; the contract test fails until all three agree.
 */

import { Command, Query } from "@miragon/bpmn-modeler-shared";

import {
    BasicAuthCredentials,
    ClipboardReadResult,
    ClipboardWriteParams,
    DeploymentOpenParams,
    DeploymentPostMessageParams,
    DeploymentSaveAuthTypeParams,
    DeploymentSaveOAuth2ConfigParams,
    DeploymentSaveParams,
    DeploymentSeedParams,
    DeploymentWebviewMessageParams,
    DiffDisposeParams,
    DiffOpenParams,
    DiffPostMessageParams,
    DiffWebviewMessageParams,
    DocumentDidChangeParams,
    DocumentSaveParams,
    DocumentSaveResult,
    DocumentWriteParams,
    DocumentWriteResult,
    EditorPostMessageParams,
    EditorRefParams,
    EmptyParams,
    MarketplaceAddParams,
    MarketplaceRemoveParams,
    MarketplaceStateSaveParams,
    MarketplaceUpdateParams,
    MigrateAllParams,
    NotifierLogParams,
    NotifierMessageParams,
    NotifierNotifyErrorParams,
    NotifierOpenDocumentParams,
    NotifierProgressParams,
    OAuth2Credentials,
    PickerShowParams,
    PickerShowResult,
    RegisterParams,
    ScriptAppendToManifestParams,
    ScriptCloseNotifyParams,
    ScriptCloseParams,
    ScriptDidChangeParams,
    ScriptOpenParams,
    ScriptUpdateContentParams,
    ScriptUpdateVariablesParams,
    SettingsDidChangeParams,
    StatusBarEngineVersionParams,
    StatusBarTemplatesReadyParams,
    TokenPromptShowParams,
    TokenPromptShowResult,
    TokenStoreGetParams,
    TokenStoreGetResult,
    TokenStoreSetParams,
    WebviewMessageParams,
} from "./types";

/** Which peer initiates the call. Requests are only ever Core→Host (see the contract test). */
export type Direction = "hostToCore" | "coreToHost";

/** Whether a reply is expected. */
export type Kind = "notification" | "request";

/**
 * Ergonomic name constants for call-sites (`METHODS.sessionRegister`). Hand-kept
 * in lockstep with {@link PROTOCOL}: the contract test asserts the two method
 * sets are identical, so neither can gain a method the other lacks.
 */
export const METHODS = {
    // Host → Core notifications
    sessionRegister: "session/register",
    webviewMessage: "webview/message",
    documentDidChange: "document/didChange",
    sessionSetActive: "session/setActive",
    sessionDispose: "session/dispose",
    settingsDidChange: "settings/didChange",
    diffOpen: "diff/open",
    diffWebviewMessage: "diff/webviewMessage",
    diffDispose: "diff/dispose",
    deploymentStateSeed: "deploymentState/seed",
    deploymentWebviewMessage: "deployment/webviewMessage",
    deploymentOpen: "deployment/open",
    scriptDidChange: "script/didChange",
    scriptDidClose: "script/didClose",
    scriptAppendToManifest: "script/appendToManifest",
    marketplaceAdd: "marketplace/add",
    marketplaceUpdate: "marketplace/update",
    marketplaceRemove: "marketplace/remove",
    modelerChangeEngineVersion: "modeler/changeEngineVersion",
    migrationMigrateAll: "migration/migrateAll",

    // Core → Host requests
    documentWrite: "document/write",
    documentSave: "document/save",
    pickerShow: "picker/show",
    clipboardRead: "clipboard/read",
    secretStoreSaveBasicAuth: "secretStore/saveBasicAuth",
    secretStoreGetBasicAuth: "secretStore/getBasicAuth",
    secretStoreSaveOAuth2: "secretStore/saveOAuth2",
    secretStoreGetOAuth2: "secretStore/getOAuth2",
    deploymentStateSaveAuthType: "deploymentState/saveAuthType",
    deploymentStateSaveOAuth2Config: "deploymentState/saveOAuth2Config",
    deploymentStateSave: "deploymentState/save",
    marketplaceStateSave: "marketplaceState/save",
    tokenStoreGet: "tokenStore/get",
    tokenStoreSet: "tokenStore/set",
    tokenPromptShow: "tokenPrompt/show",

    // Core → Host notifications
    editorPostMessage: "editor/postMessage",
    clipboardWrite: "clipboard/write",
    notifierShowInfo: "notifier/showInfo",
    notifierShowError: "notifier/showError",
    notifierNotifyError: "notifier/notifyError",
    notifierOpenConsole: "notifier/openConsole",
    notifierOpenDocument: "notifier/openDocument",
    notifierLog: "notifier/log",
    notifierProgressStart: "notifier/progressStart",
    notifierProgressEnd: "notifier/progressEnd",
    statusBarTemplatesLoading: "statusBar/templatesLoading",
    statusBarTemplatesReady: "statusBar/templatesReady",
    statusBarTemplatesHide: "statusBar/templatesHide",
    statusBarShowEngineVersion: "statusBar/showEngineVersion",
    statusBarHideEngineVersion: "statusBar/hideEngineVersion",
    statusBarDisposeEngineVersion: "statusBar/disposeEngineVersion",
    diffPostMessage: "diff/postMessage",
    deploymentPostMessage: "deployment/postMessage",
    scriptOpen: "script/open",
    scriptUpdateVariables: "script/updateVariables",
    scriptUpdateContent: "script/updateContent",
    scriptClose: "script/close",
} as const;

// Plain-object stand-ins for the opaque message payloads. The snapshot only
// records top-level param keys, so the message body's shape is irrelevant — but
// it must be a structural `Command`/`Query` (just `{ type: string }`) and a JSON
// round-trippable plain object (no class instance), which these are.
const SAMPLE_COMMAND: Command = { type: "GetBpmnFileCommand" };
const SAMPLE_QUERY: Query = { type: "FormDefaultsQuery" };

/**
 * Every RPC method, in a fixed order. `paramsFixture`/`resultFixture` are bound
 * to their named types via `satisfies` (compile-time drift guard); `as const`
 * keeps `method`/`direction`/`kind` literal so the union types below can be
 * derived and filtered by direction.
 */
export const PROTOCOL = [
    // ── Host → Core notifications ────────────────────────────────────────────
    {
        method: METHODS.sessionRegister,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            editorId: "file:///a.bpmn",
            uriString: "file:///a.bpmn",
            path: "/a.bpmn",
            fsPath: "/a.bpmn",
            scheme: "file",
            workspaceRoot: "/repo",
            content: "<bpmn/>",
            settings: {},
        } satisfies RegisterParams,
    },
    {
        method: METHODS.webviewMessage,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { editorId: "e1", message: SAMPLE_COMMAND } satisfies WebviewMessageParams,
    },
    {
        method: METHODS.documentDidChange,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            editorId: "e1",
            content: "<bpmn/>",
            causedBy: 1,
        } satisfies DocumentDidChangeParams,
    },
    {
        method: METHODS.sessionSetActive,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { editorId: "e1" } satisfies EditorRefParams,
    },
    {
        method: METHODS.sessionDispose,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { editorId: "e1" } satisfies EditorRefParams,
    },
    {
        method: METHODS.settingsDidChange,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { settings: {} } satisfies SettingsDidChangeParams,
    },
    {
        method: METHODS.diffOpen,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            diffId: "d1",
            origin: "scm",
            before: { uri: "u#d1-before", content: "<bpmn/>" },
            after: { uri: "u#d1-after", content: "<bpmn/>" },
        } satisfies DiffOpenParams,
    },
    {
        method: METHODS.diffWebviewMessage,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            paneUri: "u#d1-before",
            message: SAMPLE_COMMAND,
        } satisfies DiffWebviewMessageParams,
    },
    {
        method: METHODS.diffDispose,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { diffId: "d1" } satisfies DiffDisposeParams,
    },
    {
        method: METHODS.deploymentStateSeed,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { state: {} } satisfies DeploymentSeedParams,
    },
    {
        method: METHODS.deploymentWebviewMessage,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { message: SAMPLE_COMMAND } satisfies DeploymentWebviewMessageParams,
    },
    {
        method: METHODS.deploymentOpen,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { open: true } satisfies DeploymentOpenParams,
    },
    {
        method: METHODS.scriptDidChange,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { scriptId: "s1", content: "x" } satisfies ScriptDidChangeParams,
    },
    {
        method: METHODS.scriptDidClose,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { scriptId: "s1" } satisfies ScriptCloseParams,
    },
    {
        method: METHODS.scriptAppendToManifest,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            scriptId: "s1",
            name: "orderId",
        } satisfies ScriptAppendToManifestParams,
    },
    {
        method: METHODS.marketplaceAdd,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            location: "https://github.com/owner/repo",
            settings: {},
            scope: "project",
        } satisfies MarketplaceAddParams,
    },
    {
        method: METHODS.marketplaceUpdate,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { settings: {} } satisfies MarketplaceUpdateParams,
    },
    {
        method: METHODS.marketplaceRemove,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { settings: {}, removedCount: 1 } satisfies MarketplaceRemoveParams,
    },
    {
        method: METHODS.modelerChangeEngineVersion,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { editorId: "e1" } satisfies EditorRefParams,
    },
    {
        method: METHODS.migrationMigrateAll,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies MigrateAllParams,
    },

    // ── Core → Host requests ─────────────────────────────────────────────────
    {
        method: METHODS.documentWrite,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: {
            editorId: "e1",
            content: "<bpmn/>",
            revision: 1,
        } satisfies DocumentWriteParams,
        resultFixture: { changed: true } satisfies DocumentWriteResult,
    },
    {
        method: METHODS.documentSave,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: { editorId: "e1" } satisfies DocumentSaveParams,
        resultFixture: { saved: true } satisfies DocumentSaveResult,
    },
    {
        method: METHODS.pickerShow,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: {
            title: "Pick",
            placeholder: "Pick one",
            canPickMany: false,
            items: [{ label: "a", description: "/a" }],
        } satisfies PickerShowParams,
        resultFixture: { selected: [0] } satisfies PickerShowResult,
    },
    {
        method: METHODS.clipboardRead,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: {} satisfies EmptyParams,
        resultFixture: { text: "copied" } satisfies ClipboardReadResult,
    },
    {
        method: METHODS.secretStoreSaveBasicAuth,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: { username: "u", password: "p" } satisfies BasicAuthCredentials,
        // No result: the host acks an empty reply; the core awaits only the round-trip.
    },
    {
        method: METHODS.secretStoreGetBasicAuth,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: {} satisfies EmptyParams,
        resultFixture: { username: "u", password: "p" } satisfies BasicAuthCredentials,
    },
    {
        method: METHODS.secretStoreSaveOAuth2,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: { clientId: "id", clientSecret: "secret" } satisfies OAuth2Credentials,
    },
    {
        method: METHODS.secretStoreGetOAuth2,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: {} satisfies EmptyParams,
        resultFixture: { clientId: "id", clientSecret: "secret" } satisfies OAuth2Credentials,
    },
    // Acknowledged persists (requests, not notifications): the bridge awaits the
    // host's empty ack so a persist failure is logged instead of diverging
    // silently. No resultFixture (empty ack).
    {
        method: METHODS.deploymentStateSaveAuthType,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: { authType: "basic" } satisfies DeploymentSaveAuthTypeParams,
    },
    {
        method: METHODS.deploymentStateSaveOAuth2Config,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: {
            tokenEndpoint: "https://token",
            audience: "aud",
        } satisfies DeploymentSaveOAuth2ConfigParams,
    },
    {
        method: METHODS.deploymentStateSave,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: {
            endpoint: "https://engine",
            tenantId: "t1",
        } satisfies DeploymentSaveParams,
    },
    // Acknowledged persist: the host adds the entry, fans the snapshot to all
    // bridges, then acks an empty reply — the core awaits only the round-trip.
    {
        method: METHODS.marketplaceStateSave,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: {
            location: "https://github.com/owner/repo",
            scope: "project",
        } satisfies MarketplaceStateSaveParams,
    },
    {
        method: METHODS.tokenStoreGet,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: { host: "github.com" } satisfies TokenStoreGetParams,
        resultFixture: { token: "ghp_example" } satisfies TokenStoreGetResult,
    },
    {
        method: METHODS.tokenStoreSet,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: {
            host: "github.com",
            token: "ghp_example",
        } satisfies TokenStoreSetParams,
    },
    {
        method: METHODS.tokenPromptShow,
        direction: "coreToHost",
        kind: "request",
        paramsFixture: {
            host: "github.com",
            reason: "github.com denied access; enter a personal access token.",
        } satisfies TokenPromptShowParams,
        resultFixture: { token: "ghp_example" } satisfies TokenPromptShowResult,
    },

    // ── Core → Host notifications ────────────────────────────────────────────
    {
        method: METHODS.editorPostMessage,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { editorId: "e1", message: SAMPLE_QUERY } satisfies EditorPostMessageParams,
    },
    {
        method: METHODS.clipboardWrite,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { text: "copied" } satisfies ClipboardWriteParams,
    },
    {
        method: METHODS.notifierShowInfo,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { message: "ready" } satisfies NotifierMessageParams,
    },
    {
        method: METHODS.notifierShowError,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { message: "boom" } satisfies NotifierMessageParams,
    },
    {
        method: METHODS.notifierNotifyError,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { context: "save", message: "boom" } satisfies NotifierNotifyErrorParams,
    },
    {
        method: METHODS.notifierOpenConsole,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: METHODS.notifierOpenDocument,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { path: "/a.bpmn" } satisfies NotifierOpenDocumentParams,
    },
    {
        method: METHODS.notifierLog,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { level: "info", message: "hi" } satisfies NotifierLogParams,
    },
    {
        method: METHODS.notifierProgressStart,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { title: "Working" } satisfies NotifierProgressParams,
    },
    {
        method: METHODS.notifierProgressEnd,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { title: "Working" } satisfies NotifierProgressParams,
    },
    {
        method: METHODS.statusBarTemplatesLoading,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: METHODS.statusBarTemplatesReady,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { count: 3 } satisfies StatusBarTemplatesReadyParams,
    },
    {
        method: METHODS.statusBarTemplatesHide,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: METHODS.statusBarShowEngineVersion,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { platform: "c7", version: "7.20" } satisfies StatusBarEngineVersionParams,
    },
    {
        method: METHODS.statusBarHideEngineVersion,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: METHODS.statusBarDisposeEngineVersion,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: METHODS.diffPostMessage,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {
            paneUri: "u#d1-before",
            message: SAMPLE_COMMAND,
        } satisfies DiffPostMessageParams,
    },
    {
        method: METHODS.deploymentPostMessage,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { message: SAMPLE_QUERY } satisfies DeploymentPostMessageParams,
    },
    {
        method: METHODS.scriptOpen,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {
            scriptId: "s1",
            fileName: "script.js",
            languageId: "javascript",
            filePath: "/ws/.camunda/tmp/scripting/h/e/script-task/script.js",
            content: "x",
            completion: { beans: [], variables: [], globals: [], types: {} },
        } satisfies ScriptOpenParams,
    },
    {
        method: METHODS.scriptUpdateVariables,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { scriptId: "s1", variables: [] } satisfies ScriptUpdateVariablesParams,
    },
    {
        method: METHODS.scriptUpdateContent,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { scriptId: "s1", content: "x" } satisfies ScriptUpdateContentParams,
    },
    {
        method: METHODS.scriptClose,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { scriptId: "s1" } satisfies ScriptCloseNotifyParams,
    },
] as const;

/** One descriptor entry, with literal `method`/`direction`/`kind`. */
export type ProtocolEntry = (typeof PROTOCOL)[number];

/** Union of every RPC method name. */
export type RpcMethod = ProtocolEntry["method"];

/** Methods the host sends to the core. */
export type HostToCoreMethod = Extract<ProtocolEntry, { direction: "hostToCore" }>["method"];

/** Methods the core sends to the host. */
export type CoreToHostMethod = Extract<ProtocolEntry, { direction: "coreToHost" }>["method"];

/** Language-neutral, per-method key contract — what the Kotlin host verifies against. */
export interface ProtocolSnapshotEntry {
    method: string;
    direction: Direction;
    kind: Kind;
    /** Sorted top-level param keys actually carried on the wire. */
    paramKeys: string[];
    /** Sorted top-level result keys; absent for notifications and void requests. */
    resultKeys?: string[];
}

/**
 * Projects {@link PROTOCOL} to the JSON-serializable, key-level contract stored
 * in `protocol.json`. Keys (not full types) are the part a different-language
 * host can check — the Kotlin silent break is a `params.get("editorId")`
 * field-name mismatch, which a key set catches and a type signature wouldn't.
 */
export function protocolSnapshot(): ProtocolSnapshotEntry[] {
    return PROTOCOL.map((entry) => {
        const snapshot: ProtocolSnapshotEntry = {
            method: entry.method,
            direction: entry.direction,
            kind: entry.kind,
            paramKeys: Object.keys(entry.paramsFixture).sort(),
        };
        if ("resultFixture" in entry && entry.resultFixture) {
            snapshot.resultKeys = Object.keys(entry.resultFixture).sort();
        }
        return snapshot;
    });
}

/** The three real groups; there is no Host→Core request (the contract test enforces it). */
const TABLE_GROUPS = [
    { direction: "hostToCore", kind: "notification", title: "Host → Core (notifications)" },
    { direction: "coreToHost", kind: "request", title: "Core → Host (requests)" },
    { direction: "coreToHost", kind: "notification", title: "Core → Host (notifications)" },
] as const;

/**
 * Renders the canonical, human-readable protocol table from {@link PROTOCOL} so
 * the prose in `bridge.ts` can never rot against the real surface. Kept
 * branch-light (filter + map + join, no per-method special-casing) so the whole
 * renderer is covered by asserting its full output once.
 */
export function protocolTable(): string {
    return TABLE_GROUPS.map((group) => {
        const methods = PROTOCOL.filter(
            (entry) => entry.direction === group.direction && entry.kind === group.kind,
        ).map((entry) => `  ${entry.method}`);
        return [`${group.title}:`, ...methods].join("\n");
    }).join("\n\n");
}
