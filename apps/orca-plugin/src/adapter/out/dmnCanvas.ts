import {
    createModeler,
    type DmnModelerHandle,
    type DmnPendingInputHandle,
    type DmnView,
} from "@miragon/dmn-modeler";
import type { HostThemeKind } from "@miragon/bpmn-modeler-shared";
import { EMPTY_DMN_DIAGRAM } from "@miragon/bpmn-modeler-types";

import type { ModelCanvas } from "../../port/modelCanvas";

export interface DmnCanvasOptions {
    container: HTMLElement;
    panelParent: HTMLElement;
    theme: HostThemeKind;
    onViewChanged(view: DmnView | undefined): void;
}

export interface DmnCanvas extends ModelCanvas {
    setTheme(theme: HostThemeKind): void;
}

const holdsPendingInput = (
    modeler: DmnModelerHandle,
): modeler is DmnModelerHandle & DmnPendingInputHandle => "flushPendingInput" in modeler;

const sameView = (view: DmnView, other: DmnView): boolean =>
    view.type === other.type && view.element.id === other.element.id;

/**
 * The DMN modeler as a canvas. An outside write keeps the person on the view
 * they were looking at, such as a decision's table, while it still exists.
 */
export async function createDmnCanvas(options: DmnCanvasOptions): Promise<DmnCanvas> {
    const editListeners = new Set<() => void>();
    const modeler: DmnModelerHandle = await createModeler(options.container, {
        theme: options.theme,
        propertiesPanel: { parent: options.panelParent },
        onContentChanged: () => editListeners.forEach((listener) => listener()),
        onViewChanged: ({ activeView }) => options.onViewChanged(activeView),
        onWarning: (message) => console.warn(message),
    });

    async function show(text: string): Promise<void> {
        const viewed = modeler.getActiveView();
        await modeler.loadDiagram(text.trim() ? text : EMPTY_DMN_DIAGRAM);
        const again = viewed && modeler.getViews().find((view) => sameView(view, viewed));
        if (again && !sameView(again, modeler.getActiveView()!)) await modeler.openView(again);
    }

    return {
        async importText(text) {
            try {
                await show(text);
                return true;
            } catch (error) {
                console.warn("Unable to open the DMN diagram", error);
                return false;
            }
        },
        exportText: () => modeler.exportDiagram(),
        applyPendingInput: () => {
            if (holdsPendingInput(modeler)) modeler.flushPendingInput();
        },
        onEdit: (listener) => {
            editListeners.add(listener);
            return () => editListeners.delete(listener);
        },
        setTheme: (theme) => modeler.setTheme(theme),
    };
}
