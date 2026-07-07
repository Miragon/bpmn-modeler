/**
 * Host-capability ports: one interface per host-native facility the feature
 * code needs (notifications, pickers, clipboard, settings, workspace fs,
 * documents, status bar, secrets, deployment state).
 *
 * These exist so `service/` depends on *interfaces*, not the concrete `Vs*`
 * adapters. That keeps the layer boundary honest (a service can be unit-tested
 * against a tiny in-memory stub instead of a hand-rolled `vscode` mock) and
 * names, in domain terms, exactly which host facilities the core relies on —
 * the contract any non-VS-Code host would have to satisfy. The concrete
 * `VsCode*` classes in `infrastructure/` `implements` these.
 *
 * Mirrors the port/adapter seam already proven by {@link CamundaEnginePort}
 * (`ports.ts`) and `DiffPaneHandle` (`DiffSession.ts`).
 */

import { AuthTypePayload, Engine } from "@miragon/bpmn-modeler-shared";

import { MigrationScope } from "../../migration/domain/MigrationPlan";

/**
 * Levelled diagnostic logging to the host's log surface (VS Code's
 * `bpmn.modeler` output channel, IntelliJ's `idea.log`). Split out of
 * {@link NotifierPort} so pure-logging callers — webview-log routing, artifact
 * discovery diagnostics — depend only on logging, not the whole notifier.
 *
 * `logDebug` is the level for high-frequency transport/lifecycle noise the user
 * only wants when diagnosing (raised via *Developer: Set Log Level…*). `logError`
 * accepts a bare `string` so a webview-supplied stack prints verbatim; wrapping
 * it in a host-side `Error` would replace the original throw site's stack.
 */
export interface LoggerPort {
    logDebug(message: string): void;
    logInfo(message: string): void;
    logWarning(message: string): void;
    logError(error: string | Error): void;
}

/**
 * User-facing messages and diagnostic logging. Keeps services free of
 * `window.show*Message` / output-channel wiring and centralises the
 * log-then-toast convention behind {@link notifyError}. Extends
 * {@link LoggerPort}, so every notifier is also a logger — injection sites that
 * only need to log can narrow to `LoggerPort` without extra wiring.
 */
export interface NotifierPort extends LoggerPort {
    showInfo(message: string): void;
    showError(message: string): void;
    /** Logs `error`, then surfaces a toast pairing `context` with the error message. */
    notifyError(context: string, error: Error): void;
    openLoggingConsole(): void;
    /** Opens the file at `absolutePath` in its registered editor. */
    openDocument(absolutePath: string): Promise<void>;
}

/**
 * Domain-aware quick-pick prompts (engine, migration scope, referenced model,
 * …). Each method owns the cancel-vs-throw convention for its prompt so
 * callsites stay free of `vscode` and the convention is not re-derived.
 */
export interface PickerPort {
    /** @throws {UserCancelledError} on dismissal. */
    pickExecutionPlatform(placeHolder: string, items: string[]): Promise<Engine>;
    /** @throws {UserCancelledError} on dismissal. */
    pickMigrationScope(c7Count: number, c8Count: number): Promise<MigrationScope>;
    /** @throws {UserCancelledError} on dismissal. */
    pickEngineVersion(platform: Engine, versions: readonly string[]): Promise<string>;
    /** @returns chosen absolute paths, or `[]` on dismissal. */
    pickWorkspaceFiles(opts: {
        glob: string;
        exclude?: string | null;
        placeholder: string;
        limit?: number;
    }): Promise<string[]>;
    /** @returns the chosen payload, or `null` on dismissal. */
    pickPayloadFile(paths: string[]): Promise<{ filePath: string; label: string } | null>;
    /** @returns the picked `scriptFormat`, or `undefined` on dismissal. */
    pickScriptLanguage(currentFormat: string): Promise<string | undefined>;
    /**
     * Runs `search` behind a busy selection list so the spinner sits where the
     * user is looking, not only in the status bar. Only a multi-match result
     * reveals the list to pick from; the untouched `outcome` comes back either
     * way, so the caller keeps its own 0/1/error branching and messages.
     *
     * The constraint carries `kind` (not just `paths?`) because an all-optional
     * shape is a "weak type" no locate-result union can be assigned to.
     *
     * @returns `{ outcome, chosen }` — `chosen` set only on a multi-match pick.
     */
    searchAndPickReferencedModel<R extends { kind: string; paths?: string[] }>(
        placeholder: string,
        search: () => Promise<R>,
    ): Promise<{ outcome: R; chosen?: string }>;
}

/**
 * Host clipboard access. Isolated so the sandboxed-iframe mediator pattern
 * (host reads/writes on behalf of the webview) stays confined to infrastructure.
 */
export interface ClipboardPort {
    readClipboard(): Promise<string>;
    writeClipboard(text: string): Promise<void>;
}

/**
 * Read-only access to the modeler's user/workspace configuration.
 */
export interface SettingsPort {
    getAlignToOrigin(): boolean;
    getShowTransactionBoundaries(): boolean;
    getConfigFolder(): string;
    getC8ApiVersion(): string;
    getColorTheme(): "automatic" | "light";
    getFavouriteBpmnElements(): string[];
    getLanguage(): string;
    /** Whether the activity→code map is persisted under `<configFolder>/code-link/`. */
    getPersistCodeLinkMap(): boolean;
    /** Whether Camunda SPIN globals (`S`/`JSON`) and SpinJsonNode members are offered in C7 scripts. */
    getScriptingSpin(): boolean;
}

/**
 * Workspace-folder discovery and filesystem access, in the absolute-path /
 * glob-string vocabulary the core speaks. `vscode`-specific glob and `Uri`
 * types are deliberately kept out of the signatures.
 */
export interface WorkspacePort {
    /** @throws {NoWorkspaceFolderFoundError} if `document` is outside every folder. */
    getWorkspaceFolderForDocument(document: string): string;
    findWorkspaceFolderForDocument(document: string): string | undefined;
    getWorkspaceFolderPaths(): string[];
    getDocumentDirectory(document: string): string;
    findGitRoot(startDir: string): Promise<string | undefined>;
    readDirectory(path: string): Promise<[string, "file" | "directory"][]>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    findFiles(pattern: string, exclude?: string | null, limit?: number): Promise<string[]>;
    /** Returns a handle that disposes the watcher and its listeners in one call. */
    createWatcher(
        rootPath: string,
        glob: string,
        handlers: {
            onChange?: (path: string) => void;
            onCreate?: (path: string) => void;
            onDelete?: (path: string) => void;
        },
    ): { dispose(): void };
}

/**
 * Read/write access to an open editor's document, addressed by `editorId` so
 * operations always route to the right document when editors are side-by-side.
 */
export interface DocumentPort {
    getContent(editorId: string): string;
    getFilePath(editorId: string): string;
    /** @returns `true` if applied, `false` if content was unchanged. */
    write(editorId: string, content: string): Promise<boolean>;
    save(editorId: string): Promise<boolean>;
}

/**
 * Status-bar indicators for element-template loading, the active engine
 * version, and bpmnlint config discovery. State (which items exist) is owned by
 * the adapter.
 */
export interface StatusBarPort {
    showElementTemplatesLoading(): void;
    showElementTemplatesReady(count: number): void;
    hideElementTemplatesStatus(): void;
    showEngineVersion(platform: Engine, version: string): void;
    hideEngineVersion(): void;
    disposeEngineVersionStatus(): void;
    showBpmnlintActive(configPath: string): void;
    showBpmnlintNoConfig(): void;
    hideBpmnlintStatus(): void;
}

/**
 * Encrypted-at-rest storage for sensitive deployment credentials.
 */
export interface SecretStorePort {
    saveBasicAuth(username: string, password: string): Promise<void>;
    getBasicAuth(): Promise<{ username: string; password: string } | undefined>;
    saveOAuth2(clientId: string, clientSecret: string): Promise<void>;
    getOAuth2(): Promise<{ clientId: string; clientSecret: string } | undefined>;
}

/**
 * Persists the global default visibility of the BPMN properties panel across
 * sessions. {@link getVisibility} is synchronous so the webview HTML can be
 * pre-rendered with the correct collapsed state before the webview boots.
 */
export interface PropertiesPanelStatePort {
    getVisibility(): boolean;
    setVisibility(visible: boolean): Promise<void>;
}

/**
 * Persists non-secret deployment-form state (endpoint, tenant, auth type, …)
 * across sessions so the form can be pre-filled on next use.
 */
export interface DeploymentStatePort {
    getEndpoint(): string;
    getTenantId(): string;
    getAuthType(): AuthTypePayload;
    saveAuthType(authType: AuthTypePayload): Promise<void>;
    getTokenEndpoint(): string;
    getAudience(): string;
    saveOAuth2Config(tokenEndpoint: string, audience: string): Promise<void>;
    save(endpoint: string, tenantId: string): Promise<void>;
}
