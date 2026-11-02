import { resolveScriptWriteTarget, scriptPropertyName } from "@miragon/bpmn-modeler-types";
import type {
    ScriptField,
    ScriptKind,
    ScriptPropertyName,
    ScriptTaskScript,
} from "@miragon/bpmn-modeler-types";

import type {
    ElementCollection,
    ElementLookup,
    ListenerModdle,
    ModdleElement,
    ScriptTaskBusinessObject,
} from "./bpmnTypes";
import type { OpenScriptEditorEvent } from "./scriptEditorEvents";

/**
 * Model-side script reads. They address scripts through the script-surface
 * table, as writes do, so a read and a write agree on which element and
 * property a `(kind, listenerIndex)` pair means.
 */

/** Earlier releases of this extension wrote it, so older diagrams may carry only this one. */
const LEGACY_SCRIPT_TASK_FORMAT_ATTRIBUTE = "camunda:scriptFormat";

// A script task and a nested `camunda:Script` each declare only the properties they store.
type ScriptPropertyHolder = Partial<Record<ScriptPropertyName, string>>;

/**
 * Reads `field` of a `kind` script off the moddle element that stores it: the
 * script task itself, or a listener's nested `camunda:Script`. `get` is guarded
 * because a plain moddle object may expose the property only directly.
 */
export function readScriptField(
    holder: (ModdleElement & ScriptPropertyHolder) | undefined,
    kind: ScriptKind,
    field: ScriptField,
): string | undefined {
    const propertyName = scriptPropertyName(kind, field);
    return holder?.get?.(propertyName) ?? holder?.[propertyName];
}

/**
 * Reads a script's current content from the model.
 *
 * `undefined` means the script *surface* no longer exists — the element is
 * gone, it morphed away from a script task (a replace-menu morph keeps the
 * id), or a listener (or its nested `camunda:Script`) was removed — which
 * callers treat as "close the editor tab" rather than strand a detached
 * buffer. A script task whose `script` property is merely unset maps to `""`
 * instead: the property is always writable on the element, so the tab can
 * stay open on empty content.
 */
export function readScriptContent(
    elementRegistry: ElementLookup,
    elementId: string,
    kind: ScriptKind,
    listenerIndex: number | undefined,
): string | undefined {
    const businessObject = elementRegistry.get(elementId)?.businessObject;
    if (!businessObject) {
        return undefined;
    }
    const contentTarget = resolveScriptWriteTarget(businessObject, kind, listenerIndex, "content");
    if (!contentTarget) {
        return undefined;
    }
    const contentHolder: ScriptPropertyHolder = contentTarget.moddleElement;
    return contentHolder[contentTarget.propertyName] ?? "";
}

/**
 * Reads a script task's format from the attribute a format write targets, so a
 * written format is the format read back. A legacy `camunda:scriptFormat` is
 * read only when the plain attribute is unset (`scriptFormat` →
 * `camunda:scriptFormat` → `""`).
 *
 * The single-open paths (context pad, panel header button) and the bulk
 * collector all resolve the format through this one function so they can never
 * disagree about which value the host receives.
 */
export function readScriptTaskFormat(bo: ScriptTaskBusinessObject | undefined): string {
    return (
        readScriptField(bo, "script-task", "format") ||
        bo?.get?.(LEGACY_SCRIPT_TASK_FORMAT_ATTRIBUTE) ||
        ""
    );
}

// `scriptFormat` and `eventName` feed the script URI, so every open must build the same payload.

/** The payload that opens a script task's inline script in the host editor. */
export function scriptTaskOpenEvent(
    elementId: string,
    bo: ScriptTaskBusinessObject,
): OpenScriptEditorEvent {
    return {
        elementId,
        kind: "script-task",
        listenerIndex: undefined,
        eventName: undefined,
        scriptFormat: readScriptTaskFormat(bo),
        content: readScriptField(bo, "script-task", "content") ?? "",
    };
}

/** The listener-type token of a properties-panel listener entry id. */
export type PanelListenerType = "executionListener" | "taskListener";

/** The script kind a properties-panel listener entry addresses. */
export function listenerScriptKind(
    panelListenerType: PanelListenerType,
): Exclude<ScriptKind, "script-task"> {
    return panelListenerType === "executionListener" ? "execution-listener" : "task-listener";
}

/** The payload that opens a listener's nested `camunda:Script` in the host editor. */
export function listenerScriptOpenEvent(
    elementId: string,
    kind: Exclude<ScriptKind, "script-task">,
    listenerIndex: number | undefined,
    listener: ListenerModdle,
): OpenScriptEditorEvent {
    const script = listener.script;
    return {
        elementId,
        kind,
        listenerIndex,
        eventName: listener.get?.("event") ?? listener.event ?? undefined,
        scriptFormat: readScriptField(script, kind, "format") ?? "",
        content: readScriptField(script, kind, "content") ?? "",
    };
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
            content: readScriptField(bo, "script-task", "content") ?? "",
        });
    }
    return scripts;
}
