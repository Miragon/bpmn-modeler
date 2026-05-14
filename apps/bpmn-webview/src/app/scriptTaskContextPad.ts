import type { ScriptKind } from "@miragon/bpmn-modeler-shared";
import { VSCODE_ICON_SVG } from "./vscodeIcon";

/**
 * bpmn-js context pad provider that adds an "Edit Script" entry for
 * `bpmn:ScriptTask` elements.
 *
 * When clicked, it fires a `scriptEditor.open` event on the bpmn-js event
 * bus, carrying the element ID, script kind, format, and current content.
 * The webview entry point listens for this event and forwards it to the
 * extension host as an `OpenScriptEditorCommand`. The same event is also
 * fired by the listener properties-panel provider, so both surfaces share
 * a single bridge.
 */

/**
 * Payload emitted on the `scriptEditor.open` event bus event.
 *
 * `listenerIndex` and `eventName` are present only for listener kinds and
 * disambiguate which of the multiple scripts on a single element is being
 * edited.
 */
export interface OpenScriptEditorEvent {
    readonly elementId: string;
    readonly kind: ScriptKind;
    readonly listenerIndex: number | undefined;
    readonly eventName: string | undefined;
    readonly scriptFormat: string;
    readonly content: string;
}

/** Event-bus event name shared by the context pad and properties panel. */
export const OPEN_SCRIPT_EDITOR_EVENT = "scriptEditor.open";

/**
 * bpmn-js context pad provider that adds an "Edit Script" action to
 * script task elements.
 */
class ScriptTaskContextPadProvider {
    private readonly eventBus: any;

    static $inject = ["eventBus", "contextPad"];

    /**
     * @param eventBus The bpmn-js event bus instance.
     * @param contextPad The bpmn-js context pad service. The provider must
     *   register itself here, otherwise {@link getContextPadEntries} is
     *   never called even though the class is instantiated via `__init__`.
     */
    constructor(eventBus: any, contextPad: any) {
        this.eventBus = eventBus;
        contextPad.registerProvider(this);
    }

    /**
     * Returns context pad entries for the given element.
     *
     * Adds an "Edit Script" entry only for `bpmn:ScriptTask` elements.
     *
     * @param element The currently selected BPMN element.
     * @returns A map of context pad entry descriptors.
     */
    getContextPadEntries(element: any): Record<string, any> {
        const bo = element.businessObject;
        if (!bo || bo.$type !== "bpmn:ScriptTask") {
            return {};
        }

        return {
            "edit-script": {
                group: "edit",
                html: `<div class="entry edit-script-entry" draggable="true">${VSCODE_ICON_SVG}</div>`,
                title: "Edit Script",
                action: {
                    click: () => {
                        const scriptFormat =
                            bo.get("camunda:scriptFormat") || bo.get("scriptFormat") || "";
                        const content = bo.script || "";

                        this.eventBus.fire(OPEN_SCRIPT_EDITOR_EVENT, {
                            elementId: element.id,
                            kind: "script-task",
                            listenerIndex: undefined,
                            eventName: undefined,
                            scriptFormat,
                            content,
                        } as OpenScriptEditorEvent);
                    },
                },
            },
        };
    }
}

/**
 * bpmn-js module definition for the script task context pad provider.
 *
 * Register this module via `additionalModules` when creating the modeler.
 */
export const ScriptTaskContextPadModule = {
    __init__: ["scriptTaskContextPadProvider"],
    scriptTaskContextPadProvider: ["type", ScriptTaskContextPadProvider],
};
