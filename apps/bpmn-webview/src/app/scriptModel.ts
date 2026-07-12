import type { ScriptKind } from "@miragon/bpmn-modeler-shared";

/**
 * Model-side script lookups shared by {@link BpmnModeler}'s write path and the
 * {@link ScriptSourceWatcher}'s read path, so both resolve a script through
 * the exact same addressing rules and can never disagree about which listener
 * a `(kind, listenerIndex)` pair means.
 */

/**
 * Returns the `index`-th listener of `listenerType` from the element's
 * extension elements, or undefined if not found.
 *
 * Mirrors the upstream filtering bpmn-js-properties-panel does in
 * `ExecutionListenerProps` / `TaskListenerProps` so indices stay aligned
 * with what the user sees in the properties panel.
 */
export function findListenerAt(
    bo: any,
    listenerType: "camunda:ExecutionListener" | "camunda:TaskListener",
    index: number | undefined,
): any {
    if (index === undefined) {
        return undefined;
    }
    const values = bo?.extensionElements?.values ?? [];
    const filtered = values.filter((v: any) => v.$type === listenerType);
    return filtered[index];
}

/**
 * Reads a script's current content from the model.
 *
 * `undefined` means the script *surface* no longer exists — the element is
 * gone, or a listener (or its nested `camunda:Script`) was removed — which
 * callers treat as "close the editor tab". A script task whose `script`
 * property is merely unset maps to `""` instead: the property is always
 * writable on the element, so the tab can stay open on empty content.
 */
export function readScriptContent(
    elementRegistry: any,
    elementId: string,
    kind: ScriptKind,
    listenerIndex: number | undefined,
): string | undefined {
    const element = elementRegistry.get(elementId);
    if (!element) {
        return undefined;
    }
    if (kind === "script-task") {
        return element.businessObject?.script ?? "";
    }
    const listenerType =
        kind === "execution-listener" ? "camunda:ExecutionListener" : "camunda:TaskListener";
    const listener = findListenerAt(element.businessObject, listenerType, listenerIndex);
    if (!listener?.script) {
        return undefined;
    }
    return listener.script.value ?? "";
}
