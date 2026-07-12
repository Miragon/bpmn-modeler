import type { OpenScriptEditorRef, ScriptKind } from "@miragon/bpmn-modeler-shared";

/**
 * Fired after the store replaced its open-script set, so listeners that keep
 * per-script state (e.g. the {@link ScriptSourceWatcher}'s model baselines)
 * re-align at the moment a script opens/closes rather than lazily at the next
 * command — a lazy baseline would silently swallow the first model change.
 */
export const OPEN_SCRIPT_EDITORS_CHANGED_EVENT = "openScriptEditors.changed";

/**
 * Builds the lock key for a script identity. `listenerIndex` is folded in with
 * a `0` default so a script task (no index) and a first-listener share no key,
 * because their `kind` already differs — the default only normalises the
 * `undefined`/`0` ambiguity within a single kind.
 */
export function openScriptKey(
    elementId: string,
    kind: ScriptKind,
    listenerIndex: number | undefined,
): string {
    return `${elementId}::${kind}::${listenerIndex ?? 0}`;
}

/**
 * bpmn-js DI service holding the host's current set of open inline-script
 * editors, keyed by {@link openScriptKey}. It is the single source of truth the
 * {@link ScriptLockPropertiesProvider} consults to decide whether a
 * properties-panel script field must be locked.
 *
 * The host broadcasts the *full* set (never a delta), so {@link set} replaces
 * the map wholesale and fires `propertiesPanel.providersChanged` to force the
 * panel to re-run its providers — that is what flips a field between editable
 * and locked live, without waiting for the next selection change.
 */
export class OpenScriptEditorsStore {
    private readonly openByKey = new Map<string, OpenScriptEditorRef>();

    static $inject = ["eventBus"];

    constructor(private readonly eventBus: any) {}

    /**
     * Replaces the open-script set and re-renders the properties panel.
     *
     * Fired unconditionally (even when the set is unchanged) because the host
     * only broadcasts on real transitions; the redundant re-render cost is a
     * non-issue and skipping it would risk a missed lock after a webview reload.
     */
    set(refs: OpenScriptEditorRef[]): void {
        this.openByKey.clear();
        for (const ref of refs) {
            this.openByKey.set(openScriptKey(ref.elementId, ref.kind, ref.listenerIndex), ref);
        }
        this.eventBus.fire(OPEN_SCRIPT_EDITORS_CHANGED_EVENT);
        this.eventBus.fire("propertiesPanel.providersChanged");
    }

    /** All currently open editor references. */
    all(): OpenScriptEditorRef[] {
        return [...this.openByKey.values()];
    }

    /** The open-editor reference for a script identity, or `undefined` if none. */
    get(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
    ): OpenScriptEditorRef | undefined {
        return this.openByKey.get(openScriptKey(elementId, kind, listenerIndex));
    }
}

/**
 * bpmn-js / didi module exporting the open-script-editors store.
 * Register via `additionalModules` when creating the C7 modeler.
 */
export const OpenScriptEditorsStoreModule = {
    __init__: ["openScriptEditorsStore"],
    openScriptEditorsStore: ["type", OpenScriptEditorsStore],
};
