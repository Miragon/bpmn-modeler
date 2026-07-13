import type { ScriptKind, ScriptTaskScript } from "@miragon/bpmn-modeler-shared";

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

/**
 * Reads a script task's format, preferring the Camunda-namespaced attribute
 * over the plain BPMN one (`camunda:scriptFormat` → `scriptFormat` → `""`).
 *
 * The single-open paths (context pad, panel header button) and the bulk
 * collector all resolve the format through this one function so they can never
 * disagree about which value the host receives. `bo.get` is guarded because a
 * plain moddle object may expose the attribute only as a direct property.
 */
export function readScriptTaskFormat(bo: any): string {
    return bo?.get?.("camunda:scriptFormat") || bo?.get?.("scriptFormat") || bo?.scriptFormat || "";
}

/**
 * Scans the element registry for every `bpmn:ScriptTask` that carries an inline
 * script, returning the payload the "Open All Script Tasks in Editor" command
 * ships to the host.
 *
 * Three classes of element are excluded because they have no inline body to
 * open: labels (separate registry entries that share their host's business
 * object, so including them would double-count the task), script tasks that
 * delegate to an external `camunda:resource`, and tasks whose `script` property
 * is unset or empty.
 */
export function collectInlineScriptTasks(elementRegistry: any): ScriptTaskScript[] {
    const scripts: ScriptTaskScript[] = [];
    for (const element of elementRegistry.getAll()) {
        if (element.type === "label") {
            continue;
        }
        const bo = element.businessObject;
        if (!bo || bo.$type !== "bpmn:ScriptTask") {
            continue;
        }
        if (bo.get?.("camunda:resource") || bo.resource) {
            continue;
        }
        const content = bo.script;
        if (content === undefined || content === "") {
            continue;
        }
        scripts.push({
            elementId: element.id,
            scriptFormat: readScriptTaskFormat(bo),
            content,
        });
    }
    return scripts;
}
