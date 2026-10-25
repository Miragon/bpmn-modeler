import type { Element } from "./bpmnTypes";
import { EDITOR_ICON_SVG } from "./editorIcon";
import type { ScriptEditorOpener } from "./scriptEditorOpener";

interface ContextPad {
    registerProvider(provider: ScriptTaskContextPadProvider): void;
}

interface ContextPadEntry {
    group: string;
    html: string;
    title: string;
    action: { click: () => void };
}

/**
 * bpmn-js context pad provider that adds an "Edit Script" action to
 * script task elements. The click goes through {@link ScriptEditorOpener}, so
 * it opens the script exactly like the panel buttons and the keyboard shortcut.
 */
export class ScriptTaskContextPadProvider {
    static $inject = ["contextPad", "scriptEditorOpener"];

    /**
     * @param contextPad The bpmn-js context pad service. The provider must
     *   register itself here, otherwise {@link getContextPadEntries} is
     *   never called even though the class is instantiated via `__init__`.
     */
    constructor(
        contextPad: ContextPad,
        private readonly opener: ScriptEditorOpener,
    ) {
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
    getContextPadEntries(element: Element): Record<string, ContextPadEntry> {
        const bo = element.businessObject;
        if (!bo || bo.$type !== "bpmn:ScriptTask") {
            return {};
        }

        return {
            "edit-script": {
                group: "edit",
                html: `<div class="entry edit-script-entry" draggable="true">${EDITOR_ICON_SVG}</div>`,
                title: "Edit Script",
                action: {
                    click: () => {
                        this.opener.openScriptTask(element);
                    },
                },
            },
        };
    }
}

/**
 * bpmn-js module definition for the script task context pad provider.
 *
 * Register this module via `additionalModules` when creating the modeler,
 * together with the `ScriptEditorOpenerModule` it depends on.
 */
export const ScriptTaskContextPadModule = {
    __init__: ["scriptTaskContextPadProvider"],
    scriptTaskContextPadProvider: ["type", ScriptTaskContextPadProvider],
};
