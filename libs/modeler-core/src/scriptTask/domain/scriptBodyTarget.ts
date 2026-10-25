import type { ScriptKind } from "@miragon/bpmn-modeler-types";

interface ScriptBodyElement {
    value?: string;
}

interface ListenerElement {
    $type: string;
    script?: ScriptBodyElement;
}

/** The structural subset of a parsed BPMN element a script body can live on. */
export interface ScriptHolder {
    $type: string;
    // `bpmn:ScriptTask.script` is a String property, not a nested element.
    script?: string;
    extensionElements?: { values?: ListenerElement[] };
}

interface ScriptBodyTarget {
    readonly holder: { script?: string; value?: string };
    readonly propertyName: "script" | "value";
}

/**
 * Where a script surface's body is stored on `element`, or `undefined` when the
 * addressed surface has no inline script to write to.
 *
 * Host mirror of inline-scripting's `resolveScriptWriteTarget` (content field);
 * keep the two in step. Listener indices count only listeners of the addressed
 * type, matching the properties panel's numbering.
 */
export function resolveScriptBodyTarget(
    element: ScriptHolder,
    kind: ScriptKind,
    listenerIndex: number | undefined,
): ScriptBodyTarget | undefined {
    if (kind === "script-task") {
        // A replace morph keeps the id; assigning anyway marks the XML changed and
        // rewrites the file for nothing.
        if (element.$type !== "bpmn:ScriptTask") {
            return undefined;
        }
        return { holder: element, propertyName: "script" };
    }
    if (listenerIndex === undefined) {
        return undefined;
    }
    const listenerType =
        kind === "execution-listener" ? "camunda:ExecutionListener" : "camunda:TaskListener";
    const listener = (element.extensionElements?.values ?? []).filter(
        (value) => value.$type === listenerType,
    )[listenerIndex];
    if (!listener?.script) {
        return undefined;
    }
    return { holder: listener.script, propertyName: "value" };
}
