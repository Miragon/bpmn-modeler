import type { ScriptKind } from "@miragon/bpmn-modeler-shared";

import {
    OPEN_SCRIPT_EDITORS_CHANGED_EVENT,
    openScriptKey,
    OpenScriptEditorsStore,
} from "./openScriptEditorsStore";
import { readScriptContent } from "./scriptModel";

/** Fired when an open script's *model* content diverged from its editor tab. */
export const SCRIPT_SOURCE_CHANGED_EVENT = "scriptEditor.sourceChanged";

/**
 * Payload of {@link SCRIPT_SOURCE_CHANGED_EVENT}. `content === undefined`
 * means the script surface no longer exists (element deleted, listener
 * removed) — the host closes the tab; otherwise the host overwrites the open
 * buffer with the new content.
 */
export interface ScriptSourceChangedEvent {
    readonly elementId: string;
    readonly kind: ScriptKind;
    readonly listenerIndex: number | undefined;
    readonly content: string | undefined;
}

/**
 * bpmn-js DI service that watches the *model side* of every open inline
 * script and reports divergence to the host.
 *
 * The conditional panel lock removes the user as a second writer, but not the
 * command stack: canvas undo/redo (every doc keystroke is an undoable
 * command) and a document reload (git checkout under the editor) rewrite
 * script content underneath the open tab. Without this watcher the next
 * keystroke in the tab would push the stale buffer back and silently revert
 * what the user just asked for.
 *
 * Echo prevention is content-based: {@link noteApplied} records what the
 * host's keystroke stream writes into the model *before* the command fires,
 * so `commandStack.changed` sees model == baseline and stays silent; only
 * genuinely model-originated changes (undo, reload) differ from the baseline.
 */
export class ScriptSourceWatcher {
    /** Last model content per open script key — the divergence baseline. */
    private lastKnown = new Map<string, string | undefined>();

    static $inject = ["eventBus", "elementRegistry", "openScriptEditorsStore"];

    constructor(
        private readonly eventBus: any,
        private readonly elementRegistry: any,
        private readonly store: OpenScriptEditorsStore,
    ) {
        // Baselines are (re)established the moment the open-set changes —
        // i.e. when the host confirms a tab opened/closed — never lazily,
        // or the first undo after opening would go unnoticed.
        eventBus.on(OPEN_SCRIPT_EDITORS_CHANGED_EVENT, () => this.rebaseline());
        eventBus.on("commandStack.changed", () => this.detectChanges());
        // A document reload re-imports the XML without command-stack events.
        eventBus.on("import.done", () => this.detectChanges());
    }

    /**
     * Records content the host just streamed into the model (a keystroke from
     * the script tab), so the resulting command-stack event is recognised as
     * an echo rather than a model-side change. Must be called before the
     * moddle write — `commandStack.changed` fires synchronously inside it.
     */
    noteApplied(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        content: string,
    ): void {
        const key = openScriptKey(elementId, kind, listenerIndex);
        if (this.lastKnown.has(key)) {
            this.lastKnown.set(key, content);
        }
    }

    private rebaseline(): void {
        const next = new Map<string, string | undefined>();
        for (const ref of this.store.all()) {
            const key = openScriptKey(ref.elementId, ref.kind, ref.listenerIndex);
            next.set(key, this.lastKnown.has(key) ? this.lastKnown.get(key) : this.read(ref));
        }
        this.lastKnown = next;
    }

    private detectChanges(): void {
        for (const ref of this.store.all()) {
            const key = openScriptKey(ref.elementId, ref.kind, ref.listenerIndex);
            const current = this.read(ref);
            if (!this.lastKnown.has(key)) {
                this.lastKnown.set(key, current);
                continue;
            }
            if (this.lastKnown.get(key) === current) {
                continue;
            }
            this.lastKnown.set(key, current);
            const event: ScriptSourceChangedEvent = {
                elementId: ref.elementId,
                kind: ref.kind,
                listenerIndex: ref.listenerIndex,
                content: current,
            };
            this.eventBus.fire(SCRIPT_SOURCE_CHANGED_EVENT, event);
        }
    }

    private read(ref: {
        elementId: string;
        kind: ScriptKind;
        listenerIndex: number | undefined;
    }): string | undefined {
        return readScriptContent(this.elementRegistry, ref.elementId, ref.kind, ref.listenerIndex);
    }
}

/**
 * bpmn-js / didi module exporting the script-source watcher.
 * Register via `additionalModules` when creating the C7 modeler.
 */
export const ScriptSourceWatcherModule = {
    __init__: ["scriptSourceWatcher"],
    scriptSourceWatcher: ["type", ScriptSourceWatcher],
};
