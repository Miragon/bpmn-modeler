import { DiffRevision } from "../domain/DiffRevision";

/**
 * Port for a single diff pane.
 *
 * Wraps whatever the host gave us (in production: a `WebviewPanel` +
 * `TextDocument` pair — see `WebviewPaneHandle`). The session sees only this
 * handle, which lets `DiffSession` stay free of `vscode` imports and lets
 * tests substitute a plain object.
 *
 * `uri` is the canonical identity used by the session's lookups — it must
 * be the stringified URI of the underlying document (i.e.
 * `document.uri.toString()`).
 */
export interface DiffPaneHandle {
    readonly uri: string;
    /** Which version of its file the pane shows; it names the versions in a title. */
    readonly revision: DiffRevision;
    /**
     * `true` once the webview has imported its XML and emitted
     * `DiffReadyCommand`. The session is armed — and the differ runs —
     * when both panes report ready.
     */
    isReady(): boolean;
    setReady(): void;
    getText(): string;
    postMessage(msg: unknown): Promise<boolean>;
    dispose(): void;
}
