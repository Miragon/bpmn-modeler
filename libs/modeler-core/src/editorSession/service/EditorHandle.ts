/**
 * Host-agnostic contract for a single open editor session.
 *
 * `EditorSessionStore` is a pure registry of these handles; everything that
 * actually touches a `WebviewPanel` or `TextDocument` lives behind this port in
 * an infrastructure adapter (`VsCodeEditorHandle`). That is what lets the store
 * — and the services that depend on it — stay free of `vscode`, mirroring the
 * `DiffSession`/`DiffPaneHandle` seam in `DiffSession.ts`.
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
     * Reloads the webview UI in place, re-requesting document content, element
     * templates, and settings from the host — the same startup handshake a
     * tab-switch-back triggers on a non-retained webview. Optional so hosts that
     * cannot restart a webview (e.g. the IntelliJ bridge) simply omit it.
     */
    reload?(): void;

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
