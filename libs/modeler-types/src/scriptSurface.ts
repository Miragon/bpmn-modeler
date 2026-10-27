import type { ScriptKind } from "./scripting";

/** Which half of an inline script a host edit replaces. */
export type ScriptField = "content" | "format";

/** The moddle property a {@link ScriptField} is stored in. */
export type ScriptPropertyName = "script" | "scriptFormat" | "value";

type ScriptListenerKind = Exclude<ScriptKind, "script-task">;

/** The structural subset of a listener that can carry a nested `camunda:Script`. */
export interface ScriptListener<Body extends object = object> {
    $type?: string;
    script?: Body;
}

/** The structural subset of a parsed BPMN element a script surface can live on. */
export interface ScriptSurfaceElement<Listener extends ScriptListener = ScriptListener> {
    $type?: string;
    extensionElements?: { values?: readonly Listener[] };
}

/** The moddle element and property a write of one {@link ScriptField} lands on. */
export interface ScriptWriteTarget<Holder> {
    readonly moddleElement: Holder;
    readonly propertyName: ScriptPropertyName;
}

interface ScriptSurface {
    /** The listener whose nested `camunda:Script` holds the script; unset when the element holds it. */
    readonly listenerType: string | undefined;
    readonly propertyNames: Readonly<Record<ScriptField, ScriptPropertyName>>;
}

// `bpmn:ScriptTask.script` is a String property, while a listener nests a `camunda:Script` element.
const SCRIPT_SURFACES = {
    "script-task": {
        listenerType: undefined,
        propertyNames: { content: "script", format: "scriptFormat" },
    },
    "execution-listener": {
        listenerType: "camunda:ExecutionListener",
        propertyNames: { content: "value", format: "scriptFormat" },
    },
    "task-listener": {
        listenerType: "camunda:TaskListener",
        propertyNames: { content: "value", format: "scriptFormat" },
    },
} as const satisfies Record<ScriptKind, ScriptSurface>;

/** Names the addressed script surface for host-log messages. */
export function describeScriptSurface(
    elementId: string,
    kind: ScriptKind,
    listenerIndex: number | undefined,
): string {
    const { listenerType } = SCRIPT_SURFACES[kind];
    if (listenerType === undefined) {
        return elementId;
    }
    return `${listenerType} #${listenerIndex} on ${elementId}`;
}

/**
 * Returns the `listenerIndex`-th listener of `kind` from the element's
 * extension elements, or `undefined` if there is none.
 *
 * Indices count only listeners of that type, as bpmn-js-properties-panel's
 * `ExecutionListenerProps` / `TaskListenerProps` number them, so they match
 * what the user sees in the properties panel.
 */
export function findListenerAt<Listener extends ScriptListener>(
    element: ScriptSurfaceElement<Listener> | undefined,
    kind: ScriptListenerKind,
    listenerIndex: number | undefined,
): Listener | undefined {
    if (listenerIndex === undefined) {
        return undefined;
    }
    const { listenerType } = SCRIPT_SURFACES[kind];
    const listeners = element?.extensionElements?.values ?? [];
    return listeners.filter((listener) => listener.$type === listenerType)[listenerIndex];
}

/**
 * Where a write of a script's content or format lands. A script task carries
 * both on itself; a listener carries them on its nested `camunda:Script`.
 * `undefined` means the addressed surface has no inline script to write to.
 */
export function resolveScriptWriteTarget<
    Element extends ScriptSurfaceElement<ScriptListener<Body>>,
    Body extends object,
>(
    // The intersection lets TypeScript infer the nested script's type from the element.
    element: Element & ScriptSurfaceElement<ScriptListener<Body>>,
    kind: ScriptKind,
    listenerIndex: number | undefined,
    field: ScriptField,
): ScriptWriteTarget<Element | Body> | undefined {
    const propertyName = SCRIPT_SURFACES[kind].propertyNames[field];
    if (kind === "script-task") {
        // A replace-menu morph keeps the element id; writing anyway would leave a
        // stray `script`/`scriptFormat` attribute on the new element type.
        if (element.$type !== "bpmn:ScriptTask") {
            return undefined;
        }
        return { moddleElement: element, propertyName };
    }
    const script = findListenerAt(element, kind, listenerIndex)?.script;
    if (!script) {
        return undefined;
    }
    return { moddleElement: script, propertyName };
}
