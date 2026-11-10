/**
 * Host-agnostic contract for a single open editor session.
 *
 * `EditorSessionStore` is a pure registry of these handles; everything that
 * actually touches a `WebviewPanel` or `TextDocument` lives behind this port in
 * an outbound adapter (`VsCodeEditorHandle`). That is what lets the store
 * — and the services that depend on it — stay free of `vscode`, mirroring the
 * `DiffSession`/`DiffPaneHandle` seam of the diff feature.
 */

import { Command, Query } from "@miragon/bpmn-modeler-shared";

import { DocumentChangeEvent, EditorSubscription, SettingChange } from "../domain/EditorSession";

/**
 * One open editor session: document access, webview messaging, and the
 * per-session lifecycle subscriptions. Implemented by `VsCodeEditorHandle`,
 * which wraps a `WebviewPanel` + `TextDocument`.
 */
export interface EditorHandle {
    readonly id: string;

    /** `uri.toString()` — the canonical session key (scheme-qualified). */
    documentUriString(): string;
    /** `uri.path` — POSIX-style path the rest of the core speaks; `//server/…` on a share. */
    documentPath(): string;
    /** `uri.fsPath` — OS-native path (differs from `path` on Windows). */
    documentFsPath(): string;
    documentScheme(): string;

    getContent(): string;
    /** @returns `true` if applied, `false` if content was unchanged or the host refused the edit. */
    writeContent(content: string, expectedDocumentRevision?: number): Promise<boolean>;
    /**
     * @returns `true` when the document is saved or had nothing to save; `false`
     * when the host could not save it.
     */
    save(): Promise<boolean>;

    postMessage(message: Command | Query): Promise<boolean>;

    /**
     * Reloads the webview UI, re-requesting document content, element
     * templates, plugins and settings from the host — the same startup
     * handshake a tab-switch-back triggers on a non-retained webview. The
     * IntelliJ bridge reloads the whole page. Optional so a host that cannot
     * restart its webview omits it.
     */
    reload?(): void;

    /**
     * The URL under which this editor's webview loads the file at `path`, a
     * file below the host's plugin cache: a webview resource URI on VS Code,
     * a route of the loopback webview server on IntelliJ. Optional so a host
     * whose webview cannot load such files omits it, and its editors get no
     * plugins.
     */
    webviewUrlOf?(path: string): string;

    /** Whether this session's panel currently holds focus. */
    isActive(): boolean;

    /**
     * Adds a subscription to this session's bag so it is disposed together with
     * the session (used for watchers wired by controllers).
     */
    addSubscription(subscription: EditorSubscription): void;

    /** Disposes the panel and every subscription owned by this session. */
    dispose(): void;

    onDidReceiveMessage(callback: (message: Command) => void): EditorSubscription;
    onDidDispose(callback: () => void): EditorSubscription;
    /** Fires with the new state whenever the panel gains or loses focus. */
    onDidChangeActive(callback: (active: boolean) => void): EditorSubscription;
    onDidChangeDocument(callback: (event: DocumentChangeEvent) => void): EditorSubscription;
    onDidChangeSetting(callback: (event: SettingChange) => void): EditorSubscription;
}
