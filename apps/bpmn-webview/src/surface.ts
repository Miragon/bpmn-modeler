/**
 * The three canvas surfaces the webview can host — the full Camunda modeler
 * (Implement), the engine-neutral designer (Design), and the readonly viewer
 * (View) — plus the narrowing guards bootstrap uses to reach the methods only
 * some of them carry.
 */
import type { BpmnModeler } from "@miragon/bpmn-modeler";
import type { BpmnViewerHandle } from "@miragon/bpmn-modeler/viewer";
import type { BpmnDesignerHandle } from "@miragon/bpmn-modeler/design";

/**
 * Any of the three surfaces. The modeler arm is the concrete `BpmnModeler`
 * class, not the public `BpmnModelerHandle`, because the webview drives the
 * extra host-adapter methods it carries beyond the handle (`getDefinitions`,
 * `onCommandStackChanged`, the inline-script bridge, `alignElementsToOrigin`).
 */
export type SurfaceHandle = BpmnModeler | BpmnViewerHandle | BpmnDesignerHandle;

/** Narrows to the full Camunda modeler — the only surface with live mode toggle + engine chrome. */
export function isModelerHandle(handle: SurfaceHandle): handle is BpmnModeler {
    return "setMode" in handle;
}

/** Narrows to an editable surface (modeler or designer); the viewer has no `newDiagram`. */
export function isEditableHandle(
    handle: SurfaceHandle,
): handle is BpmnModeler | BpmnDesignerHandle {
    return "newDiagram" in handle;
}

/**
 * Narrows to a surface that carries the lint handle methods (modeler or
 * designer); the readonly viewer has none. Both editable surfaces share the same
 * injection-only lint seam (ADR 0023), so lint queries and the config request
 * gate on this rather than {@link isModelerHandle}.
 */
export function isLintingHandle(handle: SurfaceHandle): handle is BpmnModeler | BpmnDesignerHandle {
    return "applyLintResults" in handle;
}

/**
 * Narrows to a surface that can format and clean up (modeler or designer).
 *
 * A named capability guard rather than reusing {@link isEditableHandle}: layout
 * is pure geometry, so a future readonly-ish surface could gain `newDiagram`
 * without gaining a command stack, and this check would still be right.
 */
export function isFormattableHandle(
    handle: SurfaceHandle,
): handle is BpmnModeler | BpmnDesignerHandle {
    return "formatDiagram" in handle;
}
