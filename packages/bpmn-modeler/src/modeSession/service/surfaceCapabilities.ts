import type { BpmnDesignerHandle } from "../../design/port/publicApi";
import type { BpmnModelerHandle } from "../../modeler/port/publicApi";
import type { PendingSaveHandle } from "../../kernel/port/surfaceHandle";
import type { SurfaceHandle } from "../port/publicApi";

/**
 * The surfaces that edit: the designer and the modeler. Both carry the edit
 * event, a new diagram, format and clean-up, lint results and the properties
 * panel's pending input.
 */
export type EditableSurfaceHandle = BpmnDesignerHandle | BpmnModelerHandle;

/**
 * Narrows to the full modeler, the one surface that toggles Design↔Implement
 * live and edits engine properties. A host's own subtype of the handle stays
 * narrowed to that subtype.
 */
export function isModelerSurface<Handle extends SurfaceHandle>(
    handle: Handle,
): handle is Extract<Handle, BpmnModelerHandle> {
    return "setMode" in handle;
}

/** Narrows to a surface that edits (designer or modeler); the readonly viewer does not. */
export function isEditableSurface<Handle extends SurfaceHandle>(
    handle: Handle,
): handle is Extract<Handle, EditableSurfaceHandle> {
    return "newDiagram" in handle;
}

/** @internal Narrows to a surface whose `onContentSaved` export can still wait in its debounce. */
export function holdsPendingSave(
    handle: SurfaceHandle,
): handle is SurfaceHandle & PendingSaveHandle {
    return "flushContentSaved" in handle;
}
