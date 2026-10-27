import { DocumentChangeEvent, EditorSubscription, SettingChange } from "./EditorSession";

/**
 * One participant's view of an open editor session: its identity plus the
 * lifecycle events it may subscribe to. Every subscription dies with the
 * session, so a participant never touches the store or a host API directly.
 */
export interface EditorSessionContext {
    readonly editorId: string;

    /** Whether this exact session is still open (not closed, not replaced). */
    isCurrent(): boolean;

    /** Whether this session's editor currently holds focus. */
    isFocused(): boolean;

    onFocusChange(callback: (focused: boolean) => void): void;

    /**
     * Fires on content changes of this session's document, including the core's
     * own writes once the host has applied them.
     */
    onDocumentChange(callback: (event: DocumentChangeEvent) => void): void;

    onSettingChange(callback: (event: SettingChange, editorId: string) => void): void;

    /**
     * Fires when the host sends the seed of an already open session again
     * (IntelliJ after a bridge reconnect). VS Code never re-seeds. Re-arm
     * anything read from disk; the session itself stays open.
     */
    onReseed(callback: () => void | Promise<void>): void;

    /** Runs once when the session closes, after the store has dropped it. */
    onDispose(callback: () => void): void;

    addDisposable(disposable: EditorSubscription): void;
}

/**
 * One self-contained per-session concern (element templates, bpmnlint, the
 * deployment status, …). Each host lists its participants once; the
 * {@link EditorSessionLifecycle} runs them for every opened editor.
 */
export interface EditorSessionParticipant {
    onResolve(session: EditorSessionContext): void | Promise<void>;
}
