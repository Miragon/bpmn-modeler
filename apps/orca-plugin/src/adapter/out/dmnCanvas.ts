import { createModeler, type DmnModelerHandle, type DmnView } from "@miragon/dmn-modeler";
import type { HostThemeKind } from "@miragon/bpmn-modeler-shared";
import { EMPTY_DMN_DIAGRAM, isBlankDocument } from "@miragon/bpmn-modeler-types";

import type { ModelCanvas } from "../../port/modelCanvas";

export interface DmnCanvasOptions {
    container: HTMLElement;
    panelParent: HTMLElement;
    theme: HostThemeKind;
    onViewChanged(view: DmnView | undefined): void;
}

export interface DmnCanvas extends ModelCanvas {
    setTheme(theme: HostThemeKind): void;
    /** The DRD is the one view with a canvas to focus and a properties panel. */
    isDrdViewActive(): boolean;
    focusCanvas(): void;
    isCanvasFocused(): boolean;
}

/**
 * The DMN modeler as a canvas. Its `loadDiagram` keeps the person on the view
 * they were looking at across an outside write, such as a decision's table.
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

    return {
        async importText(text) {
            try {
                await modeler.loadDiagram(isBlankDocument(text) ? EMPTY_DMN_DIAGRAM : text);
                return true;
            } catch (error) {
                console.warn("Unable to open the DMN diagram", error);
                return false;
            }
        },
        exportText: () => modeler.exportDiagram(),
        applyPendingInput: () => modeler.flushPendingInput(),
        onEdit: (listener) => {
            editListeners.add(listener);
            return () => editListeners.delete(listener);
        },
        setTheme: (theme) => modeler.setTheme(theme),
        isDrdViewActive: () => modeler.isDrdViewActive(),
        focusCanvas: () => modeler.focusCanvas(),
        isCanvasFocused: () => modeler.isCanvasFocused(),
    };
}
