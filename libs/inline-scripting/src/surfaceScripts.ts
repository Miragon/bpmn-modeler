import {
    type OpenScriptEditorRef,
    resolveScriptWriteTarget,
    type ScriptField,
    type ScriptIdentity,
} from "@miragon/bpmn-modeler-types";

import type { ScriptTaskBusinessObject } from "./bpmnTypes";
import type { OpenScriptEditorsStore } from "./openScriptEditorsStore";
import type { ScriptSourceWatcher } from "./scriptSourceWatcher";

/** A surface's DI injector, such as `surface.getService("injector")`. */
export interface ScriptingInjector {
    get<T>(name: string): T;
    get<T>(name: string, strict: false): T | null;
}

export type ScriptWriteOutcome = "written" | "elementNotFound" | "noInlineScript";

interface ScriptModelElement {
    businessObject: ScriptTaskBusinessObject;
}

interface ScriptModelElementRegistry {
    get(id: string): ScriptModelElement | undefined;
}

interface ScriptModeling {
    updateModdleProperties(
        element: ScriptModelElement,
        moddleElement: unknown,
        properties: Record<string, unknown>,
    ): void;
}

/** Writes one field of an inline script as one undoable step. */
export function writeSurfaceScriptField(
    injector: ScriptingInjector,
    { elementId, kind, listenerIndex }: ScriptIdentity,
    field: ScriptField,
    value: string,
): ScriptWriteOutcome {
    const element = injector.get<ScriptModelElementRegistry>("elementRegistry").get(elementId);
    if (!element) {
        return "elementNotFound";
    }
    if (field === "content") {
        // commandStack.changed fires during the write; set the baseline first to avoid echoing our own edit.
        injector
            .get<Pick<ScriptSourceWatcher, "noteApplied">>("scriptSourceWatcher", false)
            ?.noteApplied(elementId, kind, listenerIndex, value);
    }
    const target = resolveScriptWriteTarget(element.businessObject, kind, listenerIndex, field);
    if (!target) {
        return "noInlineScript";
    }
    injector.get<ScriptModeling>("modeling").updateModdleProperties(element, target.moddleElement, {
        [target.propertyName]: value,
    });
    return "written";
}

/** C7 only; a surface without inline scripting ignores the refs. */
export function applyOpenScriptEditors(
    injector: ScriptingInjector,
    refs: OpenScriptEditorRef[],
): void {
    injector.get<Pick<OpenScriptEditorsStore, "set">>("openScriptEditorsStore", false)?.set(refs);
}
