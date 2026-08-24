import { WebviewPanel } from "vscode";

import { DocumentChangeEvent, EditorSubscription, SettingChange } from "@miragon/bpmn-modeler-core";

/**
 * A single participant's view of one freshly-opened editor session: its identity
 * plus the lifecycle-registration hooks it needs.
 *
 * The context is a thin adapter over the existing {@link EditorSessionStore}
 * per-editor API — it exists so participants register their own subscriptions
 * and teardown without ever touching the store (or `vscode`) directly. The
 * `panel` is exposed because the engine-version status bar participant reads
 * view-state transitions that have no store-level event.
 */
export interface EditorSessionContext {
    readonly editorId: string;

    /** The webview panel; only view-state-driven participants need it. */
    readonly panel: WebviewPanel;

    /** Whether this exact session still owns its document URI. */
    isCurrent(): boolean;

    /** Subscribes to workspace document-change events for this session. */
    onDocumentChange(callback: (event: DocumentChangeEvent) => void): void;

    /** Subscribes to configuration-change events for this session. */
    onSettingChange(callback: (event: SettingChange, editorId: string) => void): void;

    /**
     * Registers a teardown callback. All callbacks are aggregated and run once,
     * via the controller's single dispose subscription, after the store has done
     * its own bookkeeping — so the session is never torn down per-participant.
     */
    onDispose(callback: () => void): void;

    /** Joins a disposable to the session's bag, disposed when the session closes. */
    addDisposable(disposable: EditorSubscription): void;
}

/**
 * One self-contained editor lifecycle concern (render, element templates,
 * settings broadcast, engine-version status bar, …).
 *
 * Inverts the former god-controller: instead of `resolveCustomTextEditor`
 * hand-wiring every feature's setup, each feature contributes a participant that
 * is handed the session and registers itself. Adding a feature becomes "write a
 * participant + register it in `main.ts`" with zero controller edits.
 */
export interface EditorSessionParticipant {
    /** Runs once per opened editor, after the session is registered. */
    onResolve(session: EditorSessionContext): void | Promise<void>;
}
