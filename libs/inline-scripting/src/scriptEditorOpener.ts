import { OPEN_SCRIPT_EDITOR_EVENT, OpenScriptEditorEvent } from "./scriptTaskContextPad";
import { readScriptTaskFormat } from "./scriptModel";

/**
 * Model-side entry point for opening a script in the host editor, shared by
 * every surface that can trigger it (context pad, properties-panel buttons,
 * keyboard shortcut).
 *
 * The DOM-injected buttons and the keyboard shortcut must open scripts
 * identically — including the undoable conversion of non-inline listeners —
 * so that logic lives here once instead of being duplicated per surface.
 */

type ListenerType = "executionListener" | "taskListener";

/**
 * DI service that fires {@link OPEN_SCRIPT_EDITOR_EVENT} for a script task's
 * inline script or a listener script, converting listener implementations to
 * inline `<camunda:script>` first when necessary.
 */
export class ScriptEditorOpener {
    static $inject = ["eventBus", "elementRegistry", "modeling", "bpmnFactory"];

    constructor(
        private readonly eventBus: any,
        private readonly elementRegistry: any,
        private readonly modeling: any,
        private readonly bpmnFactory: any,
    ) {}

    /**
     * Opens the first script the element offers, in the order the properties
     * panel presents them: the script-task inline script, then execution
     * listeners, then task listeners. A deterministic order lets a single
     * keyboard shortcut act on elements carrying several scripts.
     *
     * @returns `true` if a script editor was opened.
     */
    openFirstScript(element: any): boolean {
        if (this.openScriptTask(element)) {
            return true;
        }
        for (const listenerType of ["executionListener", "taskListener"] as ListenerType[]) {
            if (this.listenersOf(element, listenerType).length > 0) {
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
    openScriptTask(element: any): boolean {
        const bo = element?.businessObject;
        if (!bo || bo.$type !== "bpmn:ScriptTask") {
            return false;
        }

        this.eventBus.fire(OPEN_SCRIPT_EDITOR_EVENT, {
            elementId: element.id,
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: readScriptTaskFormat(bo),
            content: bo.script || "",
        } as OpenScriptEditorEvent);
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
    openListener(elementId: string, listenerType: ListenerType, listenerIndex: number): boolean {
        const element = this.elementRegistry.get(elementId);
        const listener = element
            ? this.listenersOf(element, listenerType)[listenerIndex]
            : undefined;
        if (!element || !listener) {
            return false;
        }

        this.ensureInlineScript(element, listener);

        const kind = listenerType === "executionListener" ? "execution-listener" : "task-listener";

        this.eventBus.fire(OPEN_SCRIPT_EDITOR_EVENT, {
            elementId,
            kind,
            listenerIndex,
            eventName: listener.get?.("event") ?? listener.event ?? undefined,
            scriptFormat:
                listener.script.get?.("scriptFormat") ?? listener.script.scriptFormat ?? "",
            content: listener.script.get?.("value") ?? listener.script.value ?? "",
        } as OpenScriptEditorEvent);
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
    private ensureInlineScript(element: any, listener: any): void {
        const existingScript = listener.script;
        const existingValue = existingScript?.get?.("value") ?? existingScript?.value;
        if (typeof existingValue === "string") {
            return;
        }

        if (existingScript) {
            this.modeling.updateModdleProperties(element, listener, {
                class: undefined,
                expression: undefined,
                delegateExpression: undefined,
            });
            this.modeling.updateModdleProperties(element, existingScript, {
                resource: undefined,
                value: "",
            });
            return;
        }

        const script = this.bpmnFactory.create("camunda:Script", {
            scriptFormat: "",
            value: "",
        });
        this.modeling.updateModdleProperties(element, listener, {
            class: undefined,
            expression: undefined,
            delegateExpression: undefined,
            script,
        });
    }

    private listenersOf(element: any, listenerType: ListenerType): any[] {
        const extensionType =
            listenerType === "executionListener"
                ? "camunda:ExecutionListener"
                : "camunda:TaskListener";
        return (element?.businessObject?.extensionElements?.values || []).filter(
            (e: any) => e.$type === extensionType,
        );
    }
}

/**
 * bpmn-js / didi module exporting the shared script-editor opener service.
 * Register via `additionalModules` when creating the C7 modeler.
 */
export const ScriptEditorOpenerModule = {
    scriptEditorOpener: ["type", ScriptEditorOpener],
};
