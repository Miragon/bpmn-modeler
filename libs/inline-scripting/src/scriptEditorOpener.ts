import { findListenerAt, scriptPropertyName } from "@miragon/bpmn-modeler-types";
import type { ScriptKind } from "@miragon/bpmn-modeler-types";

import type { Element, ElementLookup, ListenerModdle, ModdleElement } from "./bpmnTypes";
import { OPEN_SCRIPT_EDITOR_EVENT } from "./scriptEditorEvents";
import {
    listenerScriptKind,
    listenerScriptOpenEvent,
    type PanelListenerType,
    readScriptField,
    scriptTaskOpenEvent,
} from "./scriptModel";

/**
 * Model-side entry point for opening a script in the host editor, shared by
 * every surface that can trigger it (context pad, properties-panel buttons,
 * keyboard shortcut).
 *
 * The DOM-injected buttons and the keyboard shortcut must open scripts
 * identically — including the undoable conversion of non-inline listeners —
 * so that logic lives here once instead of being duplicated per surface.
 */

interface EventBus {
    fire(event: string, payload?: unknown): void;
}

interface Modeling {
    updateModdleProperties(
        element: Element,
        moddleElement: ModdleElement,
        properties: Record<string, unknown>,
    ): void;
}

interface BpmnFactory {
    create(type: string, attrs: Record<string, unknown>): ModdleElement;
}

/**
 * DI service that fires {@link OPEN_SCRIPT_EDITOR_EVENT} for a script task's
 * inline script or a listener script, converting listener implementations to
 * inline `<camunda:script>` first when necessary.
 */
export class ScriptEditorOpener {
    static $inject = ["eventBus", "elementRegistry", "modeling", "bpmnFactory"];

    constructor(
        private readonly eventBus: EventBus,
        private readonly elementRegistry: ElementLookup,
        private readonly modeling: Modeling,
        private readonly bpmnFactory: BpmnFactory,
    ) {}

    /**
     * Opens the first script the element offers, in the order the properties
     * panel presents them: the script-task inline script, then execution
     * listeners, then task listeners. A deterministic order lets a single
     * keyboard shortcut act on elements carrying several scripts.
     *
     * @returns `true` if a script editor was opened.
     */
    openFirstScript(element: Element): boolean {
        if (this.openScriptTask(element)) {
            return true;
        }
        for (const listenerType of ["executionListener", "taskListener"] as PanelListenerType[]) {
            if (findListenerAt(element?.businessObject, listenerScriptKind(listenerType), 0)) {
                return this.openListener(element.id, listenerType, 0);
            }
        }
        return false;
    }

    /**
     * Opens the inline script of a `bpmn:ScriptTask`. An unset script opens
     * as an empty document on purpose — the feature exists to hand the user
     * an editable stub, including for scripts they have not written yet.
     *
     * @returns `true` if the element is a script task and the event fired.
     */
    openScriptTask(element: Element): boolean {
        const bo = element?.businessObject;
        if (!bo || bo.$type !== "bpmn:ScriptTask") {
            return false;
        }

        this.eventBus.fire(OPEN_SCRIPT_EDITOR_EVENT, scriptTaskOpenEvent(element.id, bo));
        return true;
    }

    /**
     * Opens the script of the addressed execution/task listener, converting
     * it to an inline `<camunda:script>` first if it uses another
     * implementation type. Looks the element up via the registry rather than
     * the selection because the properties panel also shows the implicit root
     * process when nothing is selected.
     *
     * @returns `true` if the listener exists and the event fired.
     */
    openListener(
        elementId: string,
        listenerType: PanelListenerType,
        listenerIndex: number,
    ): boolean {
        const element = this.elementRegistry.get(elementId);
        const kind = listenerScriptKind(listenerType);
        const listener = findListenerAt(element?.businessObject, kind, listenerIndex);
        if (!element || !listener) {
            return false;
        }

        this.ensureInlineScript(element, kind, listener);

        this.eventBus.fire(
            OPEN_SCRIPT_EDITOR_EVENT,
            listenerScriptOpenEvent(elementId, kind, listenerIndex, listener),
        );
        return true;
    }

    /**
     * Converts a listener's implementation to an inline `<camunda:script>`
     * if it isn't one already. No-op when the listener already uses an
     * inline script.
     *
     * Two paths:
     * - The listener has a `<camunda:script>` with a `resource` attribute
     *   (external-resource implementation): strip `resource` and seed an
     *   empty `value` on the existing element.
     * - The listener has no script element (Java class / expression /
     *   delegate expression): create a fresh `<camunda:script>` and clear
     *   the other implementation attributes in the same update so the
     *   entire switch is one undoable command.
     */
    private ensureInlineScript(
        element: Element,
        kind: Exclude<ScriptKind, "script-task">,
        listener: ListenerModdle,
    ): void {
        const existingScript = listener.script;
        if (typeof readScriptField(existingScript, kind, "content") === "string") {
            return;
        }
        const contentProperty = scriptPropertyName(kind, "content");

        if (existingScript) {
            this.modeling.updateModdleProperties(element, listener, {
                class: undefined,
                expression: undefined,
                delegateExpression: undefined,
            });
            this.modeling.updateModdleProperties(element, existingScript, {
                resource: undefined,
                [contentProperty]: "",
            });
            return;
        }

        const script = this.bpmnFactory.create("camunda:Script", {
            [scriptPropertyName(kind, "format")]: "",
            [contentProperty]: "",
        });
        this.modeling.updateModdleProperties(element, listener, {
            class: undefined,
            expression: undefined,
            delegateExpression: undefined,
            script,
        });
    }
}

/**
 * bpmn-js / didi module exporting the shared script-editor opener service.
 * Register via `additionalModules` when creating the C7 modeler.
 */
export const ScriptEditorOpenerModule = {
    scriptEditorOpener: ["type", ScriptEditorOpener],
};
