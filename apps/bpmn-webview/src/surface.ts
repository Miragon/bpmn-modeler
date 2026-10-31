/**
 * The three canvas surfaces the webview can host — the full Camunda modeler
 * (Implement), the engine-neutral designer (Design), and the readonly viewer
 * (View) — plus the narrowing guards the webview uses to reach the methods only
 * some of them carry.
 */
import type { BpmnModeler, BpmnModelerHandle } from "@miragon/bpmn-modeler";
import type { BpmnViewerHandle } from "@miragon/bpmn-modeler/viewer";
import type { BpmnDesignerHandle } from "@miragon/bpmn-modeler/design";

/**
 * Any of the three surfaces. The modeler arm is the concrete `BpmnModeler`
 * class, not the public `BpmnModelerHandle`, because the webview drives the
 * extra host-adapter methods it carries beyond the handle (`getDefinitions`,
 * the inline-script bridge, `alignElementsToOrigin`). Only
 * {@link isModelerHandle} narrows to it; the capability guards narrow to the
 * public handles.
 */
export type SurfaceHandle = BpmnModeler | BpmnViewerHandle | BpmnDesignerHandle;

type EditableSurfaceHandle = BpmnModelerHandle | BpmnDesignerHandle;

/** Narrows to the full Camunda modeler — the only surface with live mode toggle + engine chrome. */
export function isModelerHandle(handle: SurfaceHandle): handle is BpmnModeler {
    return "setMode" in handle;
}

/** Narrows to an editable surface (modeler or designer); the viewer has no `newDiagram`. */
export function isEditableHandle(handle: SurfaceHandle): handle is EditableSurfaceHandle {
    return "newDiagram" in handle;
}

/**
 * Narrows to a surface that carries the lint handle methods (modeler or
 * designer); the readonly viewer has none. Both editable surfaces share the same
 * injection-only lint seam, so lint queries and the config request
 * gate on this rather than {@link isModelerHandle}.
 */
export function isLintingHandle(handle: SurfaceHandle): handle is EditableSurfaceHandle {
    return "applyLintResults" in handle;
}

/**
 * Narrows to a surface that can format and clean up (modeler or designer).
 *
 * A named capability guard rather than reusing {@link isEditableHandle}: layout
 * is pure geometry, so a future readonly-ish surface could gain `newDiagram`
 * without gaining a command stack, and this check would still be right.
 */
export function isFormattableHandle(handle: SurfaceHandle): handle is EditableSurfaceHandle {
    return "formatDiagram" in handle;
}
