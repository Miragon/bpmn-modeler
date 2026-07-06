/**
 * Param/result shapes for every host↔core RPC method, consolidated in one
 * type-only module so the descriptor and the call-sites share a single
 * definition instead of redeclaring anonymous inline shapes (the drift the
 * protocol effort exists to kill). Nothing here emits runtime code; the whole
 * module is erased by the compiler.
 *
 * The names mirror the method they carry (`WebviewMessageParams` ↔
 * `webview/message`). Result types replace the inline `as { … } | null` casts
 * the `Rpc.request` call-sites used to carry.
 */

import { GlobalFunctionDef, MethodDef } from "@miragon/bpmn-modeler-core";
import {
    AuthTypePayload,
    Command,
    DiffOrigin,
    Engine,
    Query,
    VariableDef,
} from "@miragon/bpmn-modeler-shared";

import { DeploymentStateSnapshot } from "../adapters";
import { SettingsSnapshot } from "../nodeAdapters";

// Re-export (don't move) the register payload: it extends `SessionMeta` from
// `adapters.ts`, so relocating its definition would drag `SessionMeta`/settings
// types across modules and risk an import cycle. Sharing the one definition is
// all the descriptor needs.
export type { RegisterParams } from "../composition/sessionHooks";

/** Empty-body notification/request (e.g. `clipboard/read`, `statusBar/templatesHide`). */
export type EmptyParams = Record<string, never>;

// ── Host → Core notifications ────────────────────────────────────────────────

/** `webview/message` — a webview {@link Command} the host forwards into the core. */
export interface WebviewMessageParams {
    editorId: string;
    message: Command;
}

/** `document/didChange` — the host reports new on-disk/editor text for an editor. */
export interface DocumentDidChangeParams {
    editorId: string;
    content: string;
    /**
     * Set iff this change is the host's echo of a core-originated
     * `document/write`, carrying that write's {@link DocumentWriteParams.revision}
     * so the bridge can drop its own causation. Absent on genuine external edits.
     */
    causedBy?: number;
}

/** `session/setActive`, `session/dispose` — address an editor by id alone. */
export interface EditorRefParams {
    editorId: string;
}

/** `settings/didChange` — a fresh `miragon.bpmnModeler.*` snapshot from the host. */
export interface SettingsDidChangeParams {
    settings: Partial<SettingsSnapshot>;
}

/** One side of a diff: a diff-scoped pane uri plus its cached XML. */
export interface DiffPaneInput {
    /** Stable, diff-scoped pane identity (host appends `#<diffId>-<role>`). */
    uri: string;
    content: string;
}

/** `diff/open` — the host opens a two-pane diff with both sides known up front. */
export interface DiffOpenParams {
    diffId: string;
    origin: DiffOrigin;
    before: DiffPaneInput;
    after: DiffPaneInput;
}

/** `diff/webviewMessage` — a webview {@link Command} from one diff pane. */
export interface DiffWebviewMessageParams {
    paneUri: string;
    message: Command;
}

/** `diff/dispose` — tear down both panes of a diff. */
export interface DiffDisposeParams {
    diffId: string;
}

/** `deploymentState/seed` — the host seeds the deployment-form mirror. */
export interface DeploymentSeedParams {
    state: Partial<DeploymentStateSnapshot>;
}

/** `deployment/webviewMessage` — a webview {@link Command} from the deployment panel. */
export interface DeploymentWebviewMessageParams {
    message: Command;
}

/** `deployment/open` — the host reports the deployment tool-window's visibility. */
export interface DeploymentOpenParams {
    open: boolean;
}

/** `script/didChange` — the host reports an edit in an open script tab. */
export interface ScriptDidChangeParams {
    scriptId: string;
    content: string;
}

/** `script/didClose` — the user closed a script tab on the host. */
export interface ScriptCloseParams {
    scriptId: string;
}

/**
 * `script/appendToManifest` — the host's "Declare in variable manifest" intention
 * asks the core to scaffold a `*.bpmn.vars.json` entry for an unknown variable.
 * `type`/`description` are optional so the host can append a name-only entry and
 * let the author fill the rest in the opened manifest.
 */
export interface ScriptAppendToManifestParams {
    scriptId: string;
    name: string;
    type?: string;
    description?: string;
}

// ── Core → Host requests (params + results) ──────────────────────────────────

/** `document/write` — push core-originated text; result reports whether it changed. */
export interface DocumentWriteParams {
    editorId: string;
    content: string;
    /**
     * Per-editor monotonic id the host echoes back as
     * {@link DocumentDidChangeParams.causedBy}, letting the bridge recognise the
     * resulting `document/didChange` as its own write (LSP-style causation)
     * rather than inferring it by content comparison.
     */
    revision: number;
}
export interface DocumentWriteResult {
    changed?: boolean;
}

/** `document/save` — persist the editor; result reports whether a save happened. */
export type DocumentSaveParams = EditorRefParams;
export interface DocumentSaveResult {
    saved?: boolean;
}

/** One row offered to the host popup: a label plus optional greyed detail. */
export interface PickItem {
    label: string;
    description?: string;
}

/** `picker/show` — round-trip one native chooser; result is the chosen indices. */
export interface PickerShowParams {
    title?: string;
    placeholder: string;
    canPickMany: boolean;
    items: PickItem[];
}
export interface PickerShowResult {
    selected?: number[] | null;
}

/** `clipboard/read` — the host reads the system clipboard on the core's behalf. */
export interface ClipboardReadResult {
    text?: string;
}

/** `secretStore/saveBasicAuth` params and `secretStore/getBasicAuth` result. */
export interface BasicAuthCredentials {
    username: string;
    password: string;
}

/** `secretStore/saveOAuth2` params and `secretStore/getOAuth2` result. */
export interface OAuth2Credentials {
    clientId: string;
    clientSecret: string;
}

// ── Core → Host notifications ────────────────────────────────────────────────

/** `editor/postMessage` — the core drives the host's editor browser. */
export interface EditorPostMessageParams {
    editorId: string;
    message: Command | Query;
}

/** `clipboard/write` — fire-and-forget system-clipboard write. */
export interface ClipboardWriteParams {
    text: string;
}

/** `notifier/showInfo`, `notifier/showError` — a one-line balloon. */
export interface NotifierMessageParams {
    message: string;
}

/** `notifier/notifyError` — a context-tagged error balloon. */
export interface NotifierNotifyErrorParams {
    context: string;
    message: string;
}

/** `notifier/openDocument` — reveal a file in the host. */
export interface NotifierOpenDocumentParams {
    path: string;
}

/** `notifier/log` — a leveled line to the IDE log/console. */
export interface NotifierLogParams {
    level: "debug" | "info" | "warn" | "error";
    message: string;
}

/** `notifier/progressStart`, `notifier/progressEnd` — bracket a host spinner. */
export interface NotifierProgressParams {
    title: string;
}

/** `statusBar/templatesReady` — element-template count for the status widget. */
export interface StatusBarTemplatesReadyParams {
    count: number;
}

/** `statusBar/showEngineVersion` — the resolved engine + version to display. */
export interface StatusBarEngineVersionParams {
    platform: Engine;
    version: string;
}

/** `diff/postMessage` — the core drives one diff pane's host browser. */
export interface DiffPostMessageParams {
    paneUri: string;
    message: unknown;
}

/** `deploymentState/saveAuthType` — persist the chosen auth type. */
export interface DeploymentSaveAuthTypeParams {
    authType: AuthTypePayload;
}

/** `deploymentState/saveOAuth2Config` — persist the OAuth2 endpoint/audience. */
export interface DeploymentSaveOAuth2ConfigParams {
    tokenEndpoint: string;
    audience: string;
}

/** `deploymentState/save` — persist the endpoint/tenant pair. */
export interface DeploymentSaveParams {
    endpoint: string;
    tenantId: string;
}

/** `deployment/postMessage` — the core pushes a {@link Query} into the deployment panel. */
export interface DeploymentPostMessageParams {
    message: Query;
}

/** Completion bean shipped to the host so it never needs BPMN/PSI knowledge. */
export interface ScriptCompletionBean {
    name: string;
    type: string;
    description: string;
    methods: readonly unknown[];
}

/** `script/open` — open (or reveal) an inline script in a host text editor. */
export interface ScriptOpenParams {
    scriptId: string;
    fileName: string;
    languageId: string;
    content: string;
    completion: {
        beans: readonly ScriptCompletionBean[];
        variables: VariableDef[];
        /** Camunda SPIN globals (`S`/`JSON`) offered at script root; empty when the SPIN setting is off. */
        globals: readonly GlobalFunctionDef[];
        /**
         * Type name → callable methods, for resolving a typed variable's members
         * (e.g. a `typeHint: "SpinJsonNode"` variable's `node.` completion).
         * Empty when the SPIN setting is off.
         */
        types: Record<string, readonly MethodDef[]>;
    };
}

/** `script/updateVariables` — refresh one tab's process-variable completion. */
export interface ScriptUpdateVariablesParams {
    scriptId: string;
    variables: VariableDef[];
}

/** `script/close` — the core tells the host to close a script tab it opened. */
export interface ScriptCloseNotifyParams {
    scriptId: string;
}
