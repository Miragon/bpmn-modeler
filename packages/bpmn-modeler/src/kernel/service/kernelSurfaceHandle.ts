import type { EditableSurfaceMode } from "@miragon/bpmn-modeler-types/domain";

import type {
    BpmnSurface,
    EditingSurface,
    ModalSurface,
    ViewingSurface,
} from "../port/bpmnSurface";
import type { KernelSurface } from "./kernelSurface";

/**
 * The handle for a built kernel surface's kind. It holds only that kind's
 * members, so a guard such as `"newDiagram" in handle` reads the kind as the
 * types do.
 */
export function surfaceHandleOf(kernel: KernelSurface): BpmnSurface {
    const viewing: ViewingSurface = {
        base: "viewer",
        loadDiagram: (xml) => kernel.loadDiagram(xml),
        reloadDiagram: (xml) => kernel.reloadDiagram(xml),
        exportDiagram: () => kernel.exportDiagram(),
        getDiagramSvg: () => kernel.getDiagramSvg(),
        captureViewState: () => kernel.captureViewState(),
        applyViewState: (state) => kernel.applyViewState(state),
        setTheme: (theme) => kernel.setTheme(theme),
        destroy: () => kernel.destroy(),
        hasPendingInput: () => kernel.hasPendingInput(),
        flushPendingInput: () => kernel.flushPendingInput(),
        onCommandStackChanged: (listener) => kernel.onCommandStackChanged(listener),
        getService: <T>(name: string) => kernel.getService<T>(name),
        // Replaced by live getters below: the managers exist only while an instance lives.
        viewport: undefined as never,
        selection: undefined as never,
        rootElement: undefined as never,
    };
    Object.defineProperties(viewing, {
        viewport: { get: () => kernel.viewport, enumerable: true },
        selection: { get: () => kernel.selection, enumerable: true },
        rootElement: { get: () => kernel.rootElement, enumerable: true },
    });
    if (kernel.base === "viewer") {
        return viewing;
    }
    const editing = Object.defineProperties(viewing as unknown as EditingSurface, {
        base: { value: "modeler", enumerable: true },
        newDiagram: { value: () => kernel.newDiagram(), enumerable: true },
    });
    if (!kernel.isModal) {
        return editing;
    }
    return Object.defineProperties(editing as ModalSurface, {
        setMode: { value: (mode: EditableSurfaceMode) => kernel.setMode(mode), enumerable: true },
        getMode: { value: () => kernel.getMode(), enumerable: true },
    });
}
