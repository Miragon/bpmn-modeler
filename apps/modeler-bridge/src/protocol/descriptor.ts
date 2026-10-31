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
 * refresh `protocol.json`; the contract test fails until all three agree. The
 * IntelliJ `ProtocolHandlerCoverageTest` reads `protocol.json` too: a Core→Host
 * method needs its Kotlin handler, a Host→Core method a Kotlin sender, and both
 * must use the param keys listed here.
 */

import { Command, Query } from "@miragon/bpmn-modeler-shared";

import {
    BasicAuthCredentials,
    ClipboardReadResult,
    ClipboardWriteParams,
    DeploymentOpenParams,
    DeploymentPostMessageParams,
    DeploymentSaveParams,
    DeploymentSeedParams,
    DeploymentWebviewMessageParams,
    DeploymentWorkspaceRootParams,
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
    NotifierOpenDocumentParams,
    NotifierProgressParams,
    OAuth2Credentials,
    ConfirmShowParams,
    ConfirmShowResult,
    PickerShowParams,
    PickerShowResult,
    RegisterParams,
    SecretApprovedDestinations,
    SecretDeleteParams,
    SecretGetApprovedDestinationsParams,
    SecretGetParams,
    SecretSaveApprovedDestinationsParams,
    SecretSaveBasicAuthParams,
    SecretSaveOAuth2Params,
    ScriptCloseNotifyParams,
    ScriptCloseParams,
    ScriptDidChangeParams,
    ScriptDidOpenExternalParams,
    ScriptOpenParams,
    ScriptUpdateContentParams,
    ScriptUpdateVariablesParams,
    SettingsDidChangeParams,
    StatusBarUpdateParams,
    TokenPromptShowParams,
    TokenPromptShowResult,
    TokenStoreGetParams,
    TokenStoreGetResult,
    TokenStoreSetParams,
    WebviewMessageParams,
} from "./types";

/** Which peer initiates the call. Requests are only ever Core→Host (see the contract test). */
type Direction = "hostToCore" | "coreToHost";

/** Whether a reply is expected. */
type Kind = "notification" | "request";

/**
 * How long the core waits for the host's reply to a request:
 * - `prompt`: the host asks the user, who takes as long as they need.
 * - `syncedWrite`: the core keeps its own state in step with the reply (a
 *   bridge mirror it updates on acceptance, a fetched cache it drops on
 *   failure), so giving up on a write the host still applies would leave that
 *   state out of step with the host.
 * - `hostWork`: fails after {@link HOST_WORK_REPLY_DEADLINE_MS}, so a reply the
 *   host never sends cannot hold the caller's editor queue.
 */
type ReplyWait = "prompt" | "syncedWrite" | "hostWork";

interface ProtocolEntryShape {
    readonly method: string;
    readonly direction: Direction;
    readonly paramsFixture: object;
}

type ProtocolEntry =
    | (ProtocolEntryShape & { readonly kind: "notification" })
    | (ProtocolEntryShape & {
          readonly kind: "request";
          readonly replyWait: ReplyWait;
          readonly resultFixture?: object;
      });

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
    scriptOpenAll: "script/openAll",
    scriptDidOpenExternal: "script/didOpenExternal",
    marketplaceAdd: "marketplace/add",
    marketplaceUpdate: "marketplace/update",
    marketplaceRemove: "marketplace/remove",
    modelerChangeEngineVersion: "modeler/changeEngineVersion",
    lintingToggle: "linting/toggle",
    migrationMigrateAll: "migration/migrateAll",
    layoutFormat: "layout/format",
    layoutCleanup: "layout/cleanup",
    deploymentSwitchTarget: "deployment/switchTarget",
    deploymentDeployFiles: "deployment/deployFiles",
    deploymentDeployActive: "deployment/deployActive",
    deploymentVerify: "deployment/verify",
    deploymentStatusBarMenu: "deployment/statusBarMenu",

    // Core → Host requests
    documentWrite: "document/write",
    documentSave: "document/save",
    pickerShow: "picker/show",
    confirmShow: "confirm/show",
    clipboardRead: "clipboard/read",
    secretStoreSaveBasicAuth: "secretStore/saveBasicAuth",
    secretStoreGetBasicAuth: "secretStore/getBasicAuth",
    secretStoreSaveOAuth2: "secretStore/saveOAuth2",
    secretStoreGetOAuth2: "secretStore/getOAuth2",
    secretStoreGetApprovedDestinations: "secretStore/getApprovedDestinations",
    secretStoreSaveApprovedDestinations: "secretStore/saveApprovedDestinations",
    secretStoreDelete: "secretStore/delete",
    deploymentStateSave: "deploymentState/save",
    marketplaceStateSave: "marketplaceState/save",
    tokenStoreGet: "tokenStore/get",
    tokenStoreSet: "tokenStore/set",
    tokenPromptShow: "tokenPrompt/show",

    // Core → Host notifications
    editorPostMessage: "editor/postMessage",
    clipboardWrite: "clipboard/write",
    notifierShowInfo: "notifier/showInfo",
    notifierShowWarning: "notifier/showWarning",
    notifierShowError: "notifier/showError",
    notifierOpenConsole: "notifier/openConsole",
    notifierOpenDocument: "notifier/openDocument",
    notifierLog: "notifier/log",
    notifierProgressStart: "notifier/progressStart",
    notifierProgressEnd: "notifier/progressEnd",
    statusBarUpdate: "statusBar/update",
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
            sessionId: 1,
            documentRevision: 2,
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
        paramsFixture: {
            editorId: "e1",
            sessionId: 1,
            message: SAMPLE_COMMAND,
        } satisfies WebviewMessageParams,
    },
    {
        method: METHODS.documentDidChange,
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
        method: METHODS.sessionSetActive,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { editorId: "e1", sessionId: 1 } satisfies EditorRefParams,
    },
    {
        method: METHODS.sessionDispose,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { editorId: "e1", sessionId: 1 } satisfies EditorRefParams,
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
        method: METHODS.scriptOpenAll,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: METHODS.scriptDidOpenExternal,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            filePath: "/ws/.camunda/tmp/scripting/h/e/script-task/e.js",
        } satisfies ScriptDidOpenExternalParams,
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
        method: METHODS.lintingToggle,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: METHODS.migrationMigrateAll,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies MigrateAllParams,
    },
    {
        method: METHODS.layoutFormat,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: METHODS.layoutCleanup,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: METHODS.deploymentSwitchTarget,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies DeploymentWorkspaceRootParams,
    },
    {
        method: METHODS.deploymentDeployFiles,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies DeploymentWorkspaceRootParams,
    },
    {
        method: METHODS.deploymentDeployActive,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies DeploymentWorkspaceRootParams,
    },
    {
        method: METHODS.deploymentVerify,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies DeploymentWorkspaceRootParams,
    },
    {
        method: METHODS.deploymentStatusBarMenu,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies DeploymentWorkspaceRootParams,
    },

    // ── Core → Host requests ─────────────────────────────────────────────────
    {
        method: METHODS.documentWrite,
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
        method: METHODS.documentSave,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: { editorId: "e1", sessionId: 1 } satisfies DocumentSaveParams,
        resultFixture: { saved: true } satisfies DocumentSaveResult,
    },
    {
        method: METHODS.pickerShow,
        direction: "coreToHost",
        kind: "request",
        replyWait: "prompt",
        paramsFixture: {
            title: "Pick",
            placeholder: "Pick one",
            canPickMany: false,
            items: [{ label: "a", description: "/a" }],
        } satisfies PickerShowParams,
        resultFixture: { selected: [0] } satisfies PickerShowResult,
    },
    {
        method: METHODS.confirmShow,
        direction: "coreToHost",
        kind: "request",
        replyWait: "prompt",
        paramsFixture: {
            title: "Remove 2 leftover item(s)?",
            confirmLabel: "Clean Up",
            details: ["bpmndi:BPMNShape without a model element"],
        } satisfies ConfirmShowParams,
        resultFixture: { confirmed: true } satisfies ConfirmShowResult,
    },
    {
        method: METHODS.clipboardRead,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {} satisfies EmptyParams,
        resultFixture: { text: "copied" } satisfies ClipboardReadResult,
    },
    {
        method: METHODS.secretStoreSaveBasicAuth,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            username: "u",
            password: "p",
            slot: "/ws/.camunda/deployment-targets.json::dev",
        } satisfies SecretSaveBasicAuthParams,
        // No result: the host acks an empty reply; the core awaits only the round-trip.
    },
    {
        method: METHODS.secretStoreGetBasicAuth,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            slot: "/ws/.camunda/deployment-targets.json::dev",
        } satisfies SecretGetParams,
        resultFixture: { username: "u", password: "p" } satisfies BasicAuthCredentials,
    },
    {
        method: METHODS.secretStoreSaveOAuth2,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            clientId: "id",
            clientSecret: "secret",
            slot: "/ws/.camunda/deployment-targets.json::dev",
        } satisfies SecretSaveOAuth2Params,
    },
    {
        method: METHODS.secretStoreGetOAuth2,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            slot: "/ws/.camunda/deployment-targets.json::dev",
        } satisfies SecretGetParams,
        resultFixture: { clientId: "id", clientSecret: "secret" } satisfies OAuth2Credentials,
    },
    {
        method: METHODS.secretStoreGetApprovedDestinations,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            slot: "/ws/.camunda/deployment-targets.json::dev",
        } satisfies SecretGetApprovedDestinationsParams,
        resultFixture: { origins: ["https://engine.example"] } satisfies SecretApprovedDestinations,
    },
    {
        method: METHODS.secretStoreSaveApprovedDestinations,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            slot: "/ws/.camunda/deployment-targets.json::dev",
            origins: ["https://engine.example"],
        } satisfies SecretSaveApprovedDestinationsParams,
    },
    {
        method: METHODS.secretStoreDelete,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            slot: "/ws/.camunda/deployment-targets.json::dev",
        } satisfies SecretDeleteParams,
    },
    // Acknowledged persist (a request, not a notification): the bridge awaits the
    // host's empty ack so a persist failure rejects the core's write instead of
    // diverging silently. No resultFixture (empty ack).
    {
        method: METHODS.deploymentStateSave,
        direction: "coreToHost",
        kind: "request",
        replyWait: "syncedWrite",
        paramsFixture: {
            patch: {
                endpoint: "https://engine",
                tenantId: "t1",
                authType: "oauth2",
                tokenEndpoint: "https://token",
                audience: "aud",
                activeTargetName: "dev",
                ledger: {
                    put: {
                        "target:dev@localhost:8080::/work/order.bpmn": {
                            fingerprint: "0123456789abcdef",
                            deployedAt: "2026-09-17T14:32:00.000Z",
                            deploymentId: "dep-1",
                            origin: "engine",
                            verifiedAt: "2026-09-17T15:00:00.000Z",
                        },
                    },
                    remove: ["target:prod@localhost:8080::/work/order.bpmn"],
                },
            },
        } satisfies DeploymentSaveParams,
    },
    // Acknowledged persist: the host adds the entry, fans the snapshot to all
    // bridges, then acks an empty reply — the core awaits only the round-trip.
    {
        method: METHODS.marketplaceStateSave,
        direction: "coreToHost",
        kind: "request",
        replyWait: "syncedWrite",
        paramsFixture: {
            location: "https://github.com/owner/repo",
            scope: "project",
        } satisfies MarketplaceStateSaveParams,
    },
    {
        method: METHODS.tokenStoreGet,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: { host: "github.com" } satisfies TokenStoreGetParams,
        resultFixture: { token: "ghp_example" } satisfies TokenStoreGetResult,
    },
    {
        method: METHODS.tokenStoreSet,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            host: "github.com",
            token: "ghp_example",
        } satisfies TokenStoreSetParams,
    },
    {
        method: METHODS.tokenPromptShow,
        direction: "coreToHost",
        kind: "request",
        replyWait: "prompt",
        paramsFixture: {
            title: "Personal Access Token for github.com",
            prompt: "github.com denied access; enter a personal access token.",
        } satisfies TokenPromptShowParams,
        resultFixture: { token: "ghp_example" } satisfies TokenPromptShowResult,
    },

    // ── Core → Host notifications ────────────────────────────────────────────
    {
        method: METHODS.editorPostMessage,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {
            editorId: "e1",
            sessionId: 1,
            message: SAMPLE_QUERY,
        } satisfies EditorPostMessageParams,
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
        method: METHODS.notifierShowWarning,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { message: "careful" } satisfies NotifierMessageParams,
    },
    {
        method: METHODS.notifierShowError,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { message: "boom" } satisfies NotifierMessageParams,
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
        method: METHODS.statusBarUpdate,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {
            slot: "engineVersion",
            view: {
                text: "Camunda 7 (7.20)",
                icon: "engine",
                tooltip: "Click to change engine version",
                tone: "neutral",
                action: "changeEngineVersion",
                transient: false,
            },
        } satisfies StatusBarUpdateParams,
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
] as const satisfies readonly ProtocolEntry[];

/** Generous, because host work can queue behind a modal dialog or a keychain prompt. */
export const HOST_WORK_REPLY_DEADLINE_MS = 120_000;

const HOST_WORK_REQUESTS: ReadonlySet<string> = new Set(
    PROTOCOL.filter((entry) => "replyWait" in entry && entry.replyWait === "hostWork").map(
        (entry) => entry.method,
    ),
);

/** How long a request to `method` waits for its reply; `undefined` waits until the host answers. */
export function replyDeadlineMs(method: string): number | undefined {
    return HOST_WORK_REQUESTS.has(method) ? HOST_WORK_REPLY_DEADLINE_MS : undefined;
}

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
