/**
 * Host-capability ports: one interface per host-native facility the feature
 * code needs (logging, notifications, pickers, clipboard, settings, workspace
 * fs, documents, status bar).
 *
 * These exist so `service/` depends on *interfaces*, not the concrete `Vs*`
 * adapters. That keeps the layer boundary honest (a service can be unit-tested
 * against the in-memory fakes in `src/testing` instead of a `vscode` mock) and
 * names, in domain terms, exactly which host facilities the core relies on —
 * the contract any non-VS-Code host would have to satisfy. The concrete
 * `VsCode*` classes in `adapter/out/` `implements` these.
 *
 * Only cross-cutting ports live here, so `kernel/` names no feature. A port one
 * feature owns lives in that feature's `port/`, and the prompts it asks are
 * built in its `domain/`.
 */

import { ColorThemeSetting, SurfaceMode } from "@miragon/bpmn-modeler-types";

import { ActionNotice } from "../domain/actionNotice";
import { DirectoryEntryKind } from "../domain/directoryEntry";
import { MarketplaceSettingsEntry } from "../domain/modelerSettings";
import { ChoicePrompt, ConfirmRequest, SearchPrompt } from "../domain/prompts";
import { StatusSlot, StatusView } from "../domain/statusView";

/**
 * Levelled diagnostic logging to the host's log surface (VS Code's
 * `bpmn.modeler` output channel, IntelliJ's `idea.log`). Split out of
 * {@link NotifierPort} so pure-logging callers — webview-log routing, artifact
 * discovery diagnostics — depend only on logging, not the whole notifier.
 *
 * `logDebug` is the level for high-frequency transport/lifecycle noise the user
 * only wants when diagnosing (raised via *Developer: Set Log Level…*). `logError`
 * prints an `Error` as `errorLogText` does, and accepts a bare `string` so a
 * webview-supplied stack prints verbatim; wrapping it in a host-side `Error`
 * would replace the original throw site's stack.
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
    /** A problem the user can recover from; the operation itself went through. */
    showWarning(message: string): void;
    showError(message: string): void;
    /** Logs `notifiedErrorLogText`, then shows `notifiedErrorToastText` as an error toast. */
    notifyError(context: string, error: Error): void;
    openLoggingConsole(): void;
    /** Runs `task` under a status-bar progress indicator titled `title`. */
    withProgress<T>(title: string, task: () => Promise<T>): Promise<T>;
    /** Opens the file at `absolutePath` in its registered editor. */
    openDocument(absolutePath: string): Promise<void>;
}

/**
 * User choices and confirmations. Each prompt carries everything the user
 * reads, built by the core; a host only renders it and reports the pick, and a
 * dismissal is an answer the caller handles.
 */
export interface PickerPort {
    /** @returns the offered value of the chosen item itself, or `undefined` on dismissal. */
    choose<V>(prompt: ChoicePrompt<V>): Promise<V | undefined>;
    /** @returns the offered values of the checked items, in the prompt's order, or `[]` on dismissal. */
    chooseMany<V>(prompt: ChoicePrompt<V>): Promise<readonly V[]>;
    /**
     * Modal by contract: the caller is about to remove something on the user's
     * behalf, and a dismissible toast is not consent.
     *
     * @returns `true` only on explicit confirmation.
     */
    confirm(request: ConfirmRequest): Promise<boolean>;
    /**
     * Runs the search behind a busy chooser, so the spinner sits where the user
     * is looking. The chooser opens only for the choice the outcome leaves; the
     * untouched `outcome` comes back either way, so the caller keeps the other
     * cases and their messages.
     *
     * @returns `{ outcome, chosen }` — `chosen` set only when the user chose.
     */
    searchAndChoose<R>(search: SearchPrompt<R>): Promise<{ outcome: R; chosen?: string }>;
}

/**
 * A non-modal notification with actions, for a decision the user may also
 * leave for later. Never opens anything by itself.
 */
export interface ActionNotifierPort {
    /**
     * @returns the offered value of the action the user clicked itself, or
     *   `undefined` when the notification was closed without one.
     */
    offer<V>(notice: ActionNotice<V>): Promise<V | undefined>;
}

/**
 * Host clipboard access. Isolated so the sandboxed-iframe mediator pattern
 * (host reads/writes on behalf of the webview) stays confined to adapters.
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
    /**
     * Whether bpmnlint runs at all. `false` suppresses every lint surface
     * (overlays, Problems entries, status bar) so design-only users are not
     * shown automation rules they do not care about. Defaults to `true`.
     */
    getLintingEnabled(): boolean;
    getFormPreviewAutomatic(): boolean;
    getColorTheme(): ColorThemeSetting;
    /**
     * The default landing mode (View/Design/Implement) for an editor with no
     * persisted mode. A seed only — `implement` on an untagged model resolves to
     * Design in the webview. Defaults to `implement`.
     */
    getDefaultMode(): SurfaceMode;
    getFavouriteBpmnElements(): string[];
    getLanguage(): string;
    /** Whether the activity→code map is persisted under `<configFolder>/code-link/`. */
    getPersistCodeLinkMap(): boolean;
    /** Whether Camunda SPIN globals (`S`/`JSON`) and SpinJsonNode members are offered in C7 scripts. */
    getScriptingSpin(): boolean;
    getMarketplaces(): MarketplaceSettingsEntry[];
}

/**
 * Workspace-folder discovery and filesystem access, in the absolute-path /
 * glob-string vocabulary the core speaks. `vscode`-specific glob and `Uri`
 * types are deliberately kept out of the signatures.
 *
 * Every method takes a path plain or as a `file://` URI. A folder holds its
 * own path and everything below it, as
 * {@link import("../domain/rootContainment").relativeToRoot} decides, also when it is
 * `/` or a drive root. The testing kit's `describeWorkspaceContract` runs these
 * rules against the adapters.
 */
export interface WorkspacePort {
    /**
     * The innermost folder holding `document`. For a `file://` document or a
     * drive path the answer may come in either spelling: VS Code answers in its
     * URI path (`/c:/` for `C:/`), the bridge in the document's.
     *
     * @throws {NoWorkspaceFolderFoundError} if `document` is outside every folder.
     */
    getWorkspaceFolderForDocument(document: string): string;
    findWorkspaceFolderForDocument(document: string): string | undefined;
    /** In the order the folders were opened: the first is the workspace's primary folder. */
    getWorkspaceFolderPaths(): string[];
    /**
     * Spelled like the folder {@link getWorkspaceFolderForDocument} finds for
     * it, so the core can walk up from one to the other.
     */
    getDocumentDirectory(document: string): string;
    /**
     * An empty directory lists as `[]`.
     *
     * @throws {DirectoryNotFound} if `path` is missing or is not a directory.
     */
    readDirectory(path: string): Promise<[string, DirectoryEntryKind][]>;
    /**
     * @throws {FileNotFound} only if `path` is missing. Any other failure, a
     *   directory at `path` included, rejects with another error, so the core
     *   reports it instead of treating the file as absent.
     */
    readFile(path: string): Promise<string>;
    /** `false` when `path` is absent; a dangling link still counts as a link. */
    isSymbolicLink(path: string): Promise<boolean>;
    writeFile(path: string, content: string): Promise<void>;
    /**
     * Recursively removes the directory at `path`. A missing path is a no-op,
     * not an error — the marketplace-cache prune targets slots that a prior run
     * may already have deleted, and re-deleting one must stay silent.
     */
    deleteDirectory(path: string): Promise<void>;
    /**
     * Absolute paths of the matches in every workspace folder, spelled as
     * {@link import("../domain/workspacePath").toWorkspacePath} spells them: `/`-separated,
     * and `//server/share/repo/src/A.java` under a UNC root, never
     * `/server/share/…`, which Node's `fs` on Windows opens on the current drive.
     *
     * `pattern` and `exclude` match a file's path relative to its workspace
     * folder, so the folders above a workspace folder exclude none of its
     * files. A folder open inside another is searched on its own, so each file
     * is listed once. `undefined` keeps the host's own default excludes (VS Code's
     * `files.exclude`), `null` drops them. A host need not read a folder that
     * `exclude` covers whole ({@link import("../domain/globToRegExp").coveredFolderRegExp}).
     */
    findFiles(pattern: string, exclude?: string | null): Promise<string[]>;
    /**
     * Reports the changes below `rootPath` whose path relative to it matches
     * `glob`, as VS Code's `RelativePattern` matches. Handlers receive absolute
     * paths spelled like {@link findFiles} results, so consumers compare the
     * two without normalising.
     *
     * A new file arrives as a create and a removed one as a delete. A rewrite
     * arrives as a change, or as a create where the host cannot tell the two
     * apart, so a consumer handles a create as a superset of a change. Events
     * arrive synchronously (the testing kit) or later (the hosts batch and
     * debounce). Every path of a burst arrives, its own events coalesced as in
     * {@link import("../domain/watcherEvents").coalesceWatcherEvents}; VS Code drops a
     * file created and removed within one burst.
     *
     * A folder created or deleted as a whole, moved in or out for example, may
     * arrive as one event for the folder and none for its files, as on VS Code;
     * the bridge may report the files one by one instead. A consumer of some
     * files therefore watches every path, as
     * {@link import("../domain/watchedFiles").watchedChangeOf} reads its events.
     *
     * A `rootPath` that does not exist yet arms without throwing, and the files
     * created below it once it appears arrive as creates.
     *
     * Returns a handle that disposes the watcher and its listeners in one call.
     */
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
    /**
     * @returns `true` if applied; `false` if the content was unchanged or the
     * host refused the write (a stale revision, a replaced session, a failed
     * edit). Only {@link getContent} tells the two apart.
     */
    write(editorId: string, content: string, expectedDocumentRevision?: number): Promise<boolean>;
    /**
     * @returns `true` when the document is saved or had nothing to save; `false`
     * when the host could not save it.
     */
    save(editorId: string): Promise<boolean>;
}

/**
 * The status items the core shows, one view per slot. The host only places a
 * slot and renders its view; a later `show` or `hide` of a slot cancels the
 * pending auto-hide of its transient view.
 */
export interface StatusBarPort {
    show(slot: StatusSlot, view: StatusView): void;
    hide(slot: StatusSlot): void;
}
