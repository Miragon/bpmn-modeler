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

import {
    DeploymentFreshness,
    DeploymentStatePatch,
    GlobalFunctionDef,
    MethodDef,
    RawDeploymentState,
    RawModelerSettings,
    StatusSlot,
    StatusView,
} from "@miragon/bpmn-modeler-core";
import { Command, Query } from "@miragon/bpmn-modeler-shared";
import { DiffOrigin, Engine, VariableDef } from "@miragon/bpmn-modeler-types";

import { SessionMeta } from "../adapters";

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
}

/** Empty-body notification/request (e.g. `clipboard/read`, `statusBar/templatesHide`). */
export type EmptyParams = Record<string, never>;

// ── Host → Core notifications ────────────────────────────────────────────────

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

/** `settings/didChange` — a fresh `miragon.bpmnModeler.*` snapshot from the host. */
export interface SettingsDidChangeParams {
    settings: RawModelerSettings;
}

/** One side of a diff: a diff-scoped pane uri plus its cached XML. */
interface DiffPaneInput {
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

/**
 * `deploymentState/seed` — the host seeds the deployment-state mirror with what
 * it stored; the core fills in the defaults.
 */
export interface DeploymentSeedParams {
    state: RawDeploymentState;
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

/**
 * `script/didClose` — the host reports a script tab is closed: user-initiated,
 * or the completion ack of a core-initiated `script/close`. Sent only after
 * the host flush-saved the closing document, so the core may delete the
 * on-disk file on receipt without racing that save.
 */
export interface ScriptCloseParams {
    scriptId: string;
}

/**
 * `script/didOpenExternal` — the host reports a script file was opened outside
 * the core's own `script/open` flow (Project view, Explorer, Quick Open, or the
 * panel button on an untracked file). The core adopts it into live sync; a
 * system-independent path lets `parseScriptPath` match regardless of separator.
 */
export interface ScriptDidOpenExternalParams {
    filePath: string;
}

/**
 * `marketplace/add` — a Tools-menu "Add Template Marketplace" action. `settings`
 * piggybacks the host's fresh snapshot so the fetch never depends on a prior
 * `session/register` seed (the run may fire before any editor is open).
 *
 * `scope` is the host's persist target, opaque to the bridge: persistence happens
 * in `marketplaceState/save` *after* the fetch succeeds, so the choice must ride
 * the round trip and be echoed back. Absent = `"project"` so an older host that
 * never sends it stays compatible.
 */
export interface MarketplaceAddParams {
    location: string;
    settings: RawModelerSettings;
    scope?: "project" | "application";
}

/**
 * `marketplace/update` — re-fetch every configured marketplace. `settings`
 * piggybacks the snapshot for the same reason as {@link MarketplaceAddParams}.
 */
export interface MarketplaceUpdateParams {
    settings: RawModelerSettings;
}

/**
 * `marketplace/remove` — drop one or more marketplaces the host already
 * unregistered, pruning their orphaned cache slots **without** re-fetching the
 * survivors (the local counterpart to {@link MarketplaceUpdateParams}). `settings`
 * carries the *post-removal* snapshot, so the core prunes against the reduced
 * marketplace list. `removedCount` is the host's selection count, echoed straight
 * into the summary toast — the prune count would understate it (a removed entry
 * may have had no cache slot).
 */
export interface MarketplaceRemoveParams {
    settings: RawModelerSettings;
    removedCount: number;
}

/**
 * `migration/migrateAll` — migrate every `.bpmn` under a workspace root to a
 * user-picked engine version. Carries the root explicitly because the action can
 * fire with no editor open, so no `session/register` has registered it yet and
 * `NodeWorkspace.findFiles` only globs registered roots. (`modeler/changeEngineVersion`
 * needs no dedicated params — it reuses {@link EditorRefParams}.)
 */
export interface MigrateAllParams {
    workspaceRoot: string;
}

// ── Core → Host requests (params + results) ──────────────────────────────────

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

/** One row offered to the host popup: a label plus optional greyed detail. */
interface PickItem {
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

/**
 * `confirm/show` — a modal yes/no the host renders natively.
 *
 * A request rather than a notification because the core has to wait for the
 * answer before deleting anything; requests only run core→host, which is the
 * direction needed here.
 *
 * `details` arrives already summarised by `summarizeAffectedItems`, so the
 * host renders it verbatim and never shortens it.
 */
export interface ConfirmShowParams {
    title: string;
    confirmLabel: string;
    details: string[];
}
export interface ConfirmShowResult {
    confirmed?: boolean;
}

/** `clipboard/read` — the host reads the system clipboard on the core's behalf. */
export interface ClipboardReadResult {
    text?: string;
}

/** `secretStore/getBasicAuth` and `secretStore/getOAuth2` results. */
export interface BasicAuthCredentials {
    username: string;
    password: string;
}

/** `secretStore/getOAuth2` result / `secretStore/saveOAuth2` credential half. */
export interface OAuth2Credentials {
    clientId: string;
    clientSecret: string;
}

/**
 * `secretStore/*` params. Every credential call carries an optional `slot`
 * scoping it to a named deployment target (absent = the legacy ad-hoc keys).
 */
export interface SecretSaveBasicAuthParams {
    username: string;
    password: string;
    slot?: string;
}
export interface SecretSaveOAuth2Params {
    clientId: string;
    clientSecret: string;
    slot?: string;
}
export interface SecretGetParams {
    slot?: string;
}
export interface SecretDeleteParams {
    slot: string;
}
export interface SecretGetApprovedDestinationsParams {
    slot: string;
}
/** `secretStore/getApprovedDestinations` result, or `null` when nothing is stored. */
export interface SecretApprovedDestinations {
    origins: string[];
}
export interface SecretSaveApprovedDestinationsParams {
    slot: string;
    origins: string[];
}

/**
 * `marketplaceState/save` — the host persists the added registration and fans the
 * new snapshot to every open bridge. No result: the host acks an empty reply and
 * the core awaits only the round-trip (like `deploymentState/save`).
 *
 * `scope` is echoed straight back from {@link MarketplaceAddParams} — the bridge
 * never interprets it; only the host knows what its scopes mean. Absent =
 * `"project"` so an add that carried no scope persists per-project as before.
 */
export interface MarketplaceStateSaveParams {
    location: string;
    scope?: "project" | "application";
}

/** `tokenStore/get` — read a per-host PAT; result carries the token, or `null` when none. */
export interface TokenStoreGetParams {
    host: string;
}
export interface TokenStoreGetResult {
    token: string;
}

/** `tokenStore/set` — persist a per-host PAT (an overwrite expresses token rotation). */
export interface TokenStoreSetParams {
    host: string;
    token: string;
}

/**
 * `tokenPrompt/show` — a modal PAT-entry dialog on the host. Result carries the
 * entered token, or `null` on decline/blank (never throws — a decline is per-run
 * data, not control flow).
 */
export interface TokenPromptShowParams {
    host: string;
    reason: string;
}
export interface TokenPromptShowResult {
    token: string;
}

// ── Core → Host notifications ────────────────────────────────────────────────

/** `editor/postMessage` — the core drives the host's editor browser. */
export interface EditorPostMessageParams {
    editorId: string;
    sessionId?: number;
    message: Command | Query;
}

/** `clipboard/write` — fire-and-forget system-clipboard write. */
export interface ClipboardWriteParams {
    text: string;
}

/**
 * `notifier/showInfo`, `notifier/showWarning`, `notifier/showError` — a balloon
 * with the core's text as it is, including the context line `notifyError` adds.
 */
export interface NotifierMessageParams {
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

/** `statusBar/update` — what one status slot shows, or `null` to hide the slot. */
export interface StatusBarUpdateParams {
    slot: StatusSlot;
    view: StatusView | null;
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

/**
 * `deploymentState/save` — persist exactly the fields and ledger rows the patch
 * names; the host acks an empty reply.
 */
export interface DeploymentSaveParams {
    patch: DeploymentStatePatch;
}

/**
 * `statusBar/showDeploymentTarget` — the active target name (or `null` for "no
 * target"), the freshness dot state, and the last-deploy / last-verify
 * timestamps (or `null`).
 */
export interface StatusBarDeploymentTargetParams {
    name: string | null;
    freshness: DeploymentFreshness;
    deployedAt: string | null;
    verifiedAt: string | null;
}

/**
 * `deployment/switchTarget`, `deployment/deployFiles`, `deployment/deployActive`,
 * `deployment/verify`, `deployment/statusBarMenu` — host-initiated. The workspace root is passed
 * because `NodeWorkspace` only learns roots from `session/register`, so a host
 * action fired with no active editor must name it.
 */
export interface DeploymentWorkspaceRootParams {
    workspaceRoot: string;
}

/** `deployment/postMessage` — the core pushes a {@link Query} into the deployment panel. */
export interface DeploymentPostMessageParams {
    message: Query;
}

/** Completion bean shipped to the host so it never needs BPMN/PSI knowledge. */
interface ScriptCompletionBean {
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
    /**
     * Absolute path of the real script file the bridge wrote into the editor's
     * script folder. The host opens this file (re-enabling IdeaVim and
     * file-based tooling). The field is absent when the folder lookup or the
     * write failed; the host then opens an in-memory `LightVirtualFile` from
     * `content`, as it does when the path fails to resolve.
     */
    filePath?: string;
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

/**
 * `script/updateContent` — the core overwrites an open tab's content because
 * the script changed on the *model* side (canvas undo/redo, document reload).
 * The host must guard its document listener so the write doesn't echo back as
 * a `script/didChange`.
 */
export interface ScriptUpdateContentParams {
    scriptId: string;
    content: string;
}

/**
 * `script/close` — the core tells the host to close a script tab it opened.
 * The host flushes and closes the tab, then acks with `script/didClose`; the
 * core defers deleting the script's on-disk file until that ack.
 */
export interface ScriptCloseNotifyParams {
    scriptId: string;
}
