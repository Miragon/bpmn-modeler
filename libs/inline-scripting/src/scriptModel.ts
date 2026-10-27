import { findListenerAt, scriptPropertyName } from "@miragon/bpmn-modeler-types";
import type { ScriptKind, ScriptTaskScript } from "@miragon/bpmn-modeler-types";

import type { ElementCollection, ElementLookup, ScriptTaskBusinessObject } from "./bpmnTypes";

/**
 * Model-side script reads. Listener lookups go through `findListenerAt`, as
 * writes do, so a read and a write agree on which listener a
 * `(kind, listenerIndex)` pair means.
 */

/** Earlier releases of this extension wrote it, so older diagrams may carry only this one. */
const LEGACY_SCRIPT_TASK_FORMAT_ATTRIBUTE = "camunda:scriptFormat";

/**
 * Reads a script's current content from the model.
 *
 * `undefined` means the script *surface* no longer exists — the element is
 * gone, or a listener (or its nested `camunda:Script`) was removed — which
 * callers treat as "close the editor tab". A script task whose `script`
 * property is merely unset maps to `""` instead: the property is always
 * writable on the element, so the tab can stay open on empty content. The
 * surfaces reported absent are the ones `resolveScriptWriteTarget` has no
 * target for.
 */
export function readScriptContent(
    elementRegistry: ElementLookup,
    elementId: string,
    kind: ScriptKind,
    listenerIndex: number | undefined,
): string | undefined {
    const element = elementRegistry.get(elementId);
    if (!element) {
        return undefined;
    }
    if (kind === "script-task") {
        // A replace-menu morph keeps the element id but drops the ScriptTask
        // surface, so `script` is gone. Report the surface as absent (→ close
        // the tab) rather than `""`, which would strand an editable-looking but
        // detached buffer. Mirrors `collectInlineScriptTasks`, which likewise
        // filters on `$type === "bpmn:ScriptTask"`.
        if (element.businessObject?.$type !== "bpmn:ScriptTask") {
            return undefined;
        }
        return element.businessObject?.script ?? "";
    }
    const listener = findListenerAt(element.businessObject, kind, listenerIndex);
    if (!listener?.script) {
        return undefined;
    }
    return listener.script.value ?? "";
}

/**
 * Reads a script task's format from the attribute a format write targets, so a
 * written format is the format read back. A legacy `camunda:scriptFormat` is
 * read only when the plain attribute is unset (`scriptFormat` →
 * `camunda:scriptFormat` → `""`).
 *
 * The single-open paths (context pad, panel header button) and the bulk
 * collector all resolve the format through this one function so they can never
 * disagree about which value the host receives. `bo.get` is guarded because a
 * plain moddle object may expose the attribute only as a direct property.
 */
export function readScriptTaskFormat(bo: ScriptTaskBusinessObject | undefined): string {
    const formatProperty = scriptPropertyName("script-task", "format");
    return (
        bo?.get?.(formatProperty) ||
        bo?.[formatProperty] ||
        bo?.get?.(LEGACY_SCRIPT_TASK_FORMAT_ATTRIBUTE) ||
        ""
    );
}

/**
 * Scans the element registry for every inline `bpmn:ScriptTask`, returning the
 * payload the "Generate Script Files for Script Tasks" command ships to the host.
 *
 * Only two classes of element are excluded: labels (separate registry entries
 * that share their host's business object, so including them would double-count
 * the task) and script tasks that delegate to an external `camunda:resource`
 * (they have no inline body). Tasks with an empty or unset inline script are
 * included on purpose — the command exists to hand the user an editable stub for
 * every script task, including ones they have not written yet.
 */
export function collectInlineScriptTasks(elementRegistry: ElementCollection): ScriptTaskScript[] {
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
        scripts.push({
            elementId: element.id,
            scriptFormat: readScriptTaskFormat(bo),
            // An unset moddle property still has to satisfy the string contract.
            content: bo.script ?? "",
        });
    }
    return scripts;
}
